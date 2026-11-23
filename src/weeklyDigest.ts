import { milestoneSourceHref, normalizeMilestones, validDate } from "./data";
import { saigonDay, vendorRoutes } from "./eventDecision";
import { compareMilestones, isTimedMilestone, milestoneDay, milestoneTimes, milestoneTypeLabels } from "./milestones";
import type { Event, EventDateRange, VendorMilestone, VendorOption } from "./model";
import { outreachReminders } from "./outreach";
import { formatDateRange, monthLabel, occurrenceKey, upcoming } from "./utils";

export const DIGEST_STORAGE_KEY = "tcg-weekly-digest-v1";

const termLabels = {
  vendor_booths: "Vendor access",
  vendor_application: "How to apply",
  vendor_deadline: "Vendor notice",
  vendor_cost: "Vendor cost",
  booth_detail: "Booth details",
  published_booth_price: "Published booth price",
  price_source_url: "Published price source",
} as const;
type Term = keyof typeof termLabels;
const termKeys = Object.keys(termLabels) as Term[];

type VendorTerms = { id: string; lines: string[] };
type PublishedEvent = {
  name: string;
  archived: boolean;
  eventStatus: NonNullable<Event["event_status"]> | null;
  dateStatus: Event["date_status"];
  dateNote: string | null;
  estimatedMonth: string | null;
  dates: EventDateRange[];
  recurring: boolean;
  venue: string | null;
  city: string | null;
  country: string | null;
  terms: Record<Term, string | null>;
  milestones: VendorMilestone[];
  prices: VendorTerms[];
  documents: VendorTerms[];
};

type DigestSnapshot = {
  snapshotDate: string;
  eventsById: Record<string, PublishedEvent>;
};
type DigestCheckpoint = DigestSnapshot & { reviewedAt: string };

const clean = (value?: string | null) => value?.trim() || null;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const byOccurrence = (a: EventDateRange, b: EventDateRange) =>
  occurrenceKey(a).localeCompare(occurrenceKey(b)) || (a.venue ?? "").localeCompare(b.venue ?? "");

function publishedPrice(option: VendorOption): VendorTerms {
  const { id, name, currency, amount, amount_incl_vat, vat_rate, eligibility, kind,
    rate_status, size, includes, notes, source, early_bird, valid_until } = option;
  const money = (value: number) => `${currency} ${value.toLocaleString("en-GB", { maximumSignificantDigits: 21 })}`;
  const tax = vat_rate?.toLocaleString("en-GB", { style: "percent", maximumSignificantDigits: 21 });
  const eligibilityLabel = {
    eligible: "Eligible", ineligible: "Ineligible", unclear: "Eligibility unclear",
  }[eligibility];
  const rateLabel = {
    current: "Current rate", past_year: "Past edition rate", expired: "Expired rate", unavailable: "Unavailable rate",
  }[rate_status];
  return {
    id,
    lines: [
      name,
      tax === undefined || amount_incl_vat === undefined ? money(amount)
        : `${money(amount)} before VAT · ${money(amount_incl_vat)} including ${tax} VAT`,
      [kind === "package" ? "Booth package" : "Add-on", early_bird && "Early-bird rate", rateLabel, eligibilityLabel]
        .filter(Boolean).join(" · "),
      size && `Size · ${size}`,
      includes && `Includes · ${includes}`,
      valid_until && `Valid until ${valid_until}`,
      notes,
      `Source · ${source}`,
    ].filter((line): line is string => Boolean(line)),
  };
}

export function buildDigestSnapshot(events: readonly Event[], snapshotDate: string): DigestSnapshot {
  return {
    snapshotDate,
    eventsById: Object.fromEntries(events.map((event): [string, PublishedEvent] => {
      const recurring = Boolean(event.occurrences?.length);
      const dates = recurring
        ? event.occurrences!.map(({ start_date, end_date, venue }) => ({
          start_date, end_date, ...(venue && { venue }),
        })).sort(byOccurrence)
        : event.start_date ? [{ start_date: event.start_date, end_date: event.end_date ?? event.start_date }] : [];
      return [event.id, {
        name: event.name,
        archived: event.scanner_archived === true,
        eventStatus: event.event_status ?? null,
        dateStatus: event.date_status,
        dateNote: clean(event.date_note),
        estimatedMonth: event.estimated_month,
        dates,
        recurring,
        venue: clean(event.venue),
        city: clean(event.city),
        country: clean(event.country),
        terms: {
          vendor_booths: clean(event.vendor_booths),
          vendor_application: clean(event.vendor_application),
          vendor_deadline: clean(event.vendor_deadline),
          vendor_cost: clean(event.vendor_cost),
          booth_detail: clean(event.booth_detail),
          published_booth_price: clean(event.outreach?.published_booth_price),
          price_source_url: clean(event.outreach?.price_source_url),
        },
        milestones: (event.vendor_milestones ?? []).map((milestone) => isTimedMilestone(milestone)
          ? { ...milestone, at: new Date(milestone.at).toISOString() } : milestone).sort(byId),
        prices: (event.vendor_options ?? []).filter(({ basis }) => basis === "published").map(publishedPrice).sort(byId),
        documents: (event.vendor_documents ?? []).filter(({ kind, source }) =>
          kind !== "organizer_proposal" && milestoneSourceHref(source)).map(({ id, label, path, source, notes }) => ({
          id, lines: [label, path, source, ...(notes ? [notes] : [])],
        })).sort(byId),
      }];
    })),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const nullableText = (value: unknown): value is string | null => value === null || typeof value === "string";
const validMonth = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function isDateRange(value: unknown): value is EventDateRange {
  return record(value) && validDate(value.start_date) && validDate(value.end_date) &&
    value.start_date <= value.end_date && (value.venue === undefined || typeof value.venue === "string");
}

function readVendorTerms(value: unknown): VendorTerms[] {
  if (!Array.isArray(value)) throw new Error();
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!record(item) || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) || seen.has(item.id) ||
        !Array.isArray(item.lines) || !item.lines.length || !item.lines.every((line) => typeof line === "string" && line.trim()))
      throw new Error();
    seen.add(item.id);
    return { id: item.id, lines: item.lines as string[] };
  }).sort(byId);
}

function readPublishedEvent(value: unknown): PublishedEvent {
  if (!record(value)) throw new Error();
  const { name, archived, eventStatus, dateStatus, dateNote, estimatedMonth, dates, recurring, venue, city, country, terms } = value;
  if (typeof name !== "string" || typeof archived !== "boolean" ||
      (eventStatus !== null && eventStatus !== "cancelled" && eventStatus !== "postponed") ||
      (dateStatus !== "confirmed" && dateStatus !== "estimated" && dateStatus !== "tba") ||
      !nullableText(dateNote) || (estimatedMonth !== null && !validMonth(estimatedMonth)) ||
      !Array.isArray(dates) || !dates.every(isDateRange) || typeof recurring !== "boolean" ||
      (recurring ? dates.length === 0 : dates.length > 1) ||
      !nullableText(venue) || !nullableText(city) || !nullableText(country) ||
      !record(terms) || !termKeys.every((key) => nullableText(terms[key])))
    throw new Error();
  return {
    name, archived, eventStatus, dateStatus,
    dateNote: clean(dateNote), estimatedMonth, recurring, dates: dates.map(({ start_date, end_date, venue }) => ({
      start_date, end_date, ...(clean(venue) && { venue: clean(venue)! }),
    })).sort(byOccurrence),
    venue: clean(venue), city: clean(city), country: clean(country),
    terms: Object.fromEntries(termKeys.map((key) => [key, clean(terms[key] as string | null)])) as PublishedEvent["terms"],
    milestones: normalizeMilestones(value.milestones, true).sort(byId),
    prices: readVendorTerms(value.prices),
    documents: readVendorTerms(value.documents),
  };
}

export function loadDigestCheckpoint(storage?: Pick<Storage, "getItem">) {
  let raw: string | null;
  try {
    raw = (storage ?? globalThis.localStorage).getItem(DIGEST_STORAGE_KEY);
  } catch {
    return { checkpoint: null, error: "Could not read the weekly digest review on this device." };
  }
  if (raw === null) return { checkpoint: null, error: "" };
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || typeof value.reviewedAt !== "string" ||
        !validDate(value.reviewedAt.slice(0, 10)) || !Number.isFinite(Date.parse(value.reviewedAt)) ||
        new Date(value.reviewedAt).toISOString() !== value.reviewedAt ||
        !validDate(value.snapshotDate) || !record(value.eventsById)) throw new Error();
    const checkpoint: DigestCheckpoint = {
      reviewedAt: value.reviewedAt,
      snapshotDate: value.snapshotDate,
      eventsById: Object.fromEntries(Object.entries(value.eventsById).map(([id, event]) => {
        if (!id) throw new Error();
        return [id, readPublishedEvent(event)];
      })),
    };
    return { checkpoint, error: "" };
  } catch {
    return { checkpoint: null, error: "The saved review could not be read. Mark reviewed to set a new baseline." };
  }
}

export function saveDigestCheckpoint(snapshot: DigestSnapshot, storage?: Pick<Storage, "setItem">) {
  const checkpoint: DigestCheckpoint = { reviewedAt: new Date().toISOString(), ...snapshot };
  try {
    (storage ?? globalThis.localStorage).setItem(DIGEST_STORAGE_KEY, JSON.stringify(checkpoint));
    return { checkpoint, error: "" };
  } catch {
    return { checkpoint: null, error: "Could not save the review on this device. Check storage and try again." };
  }
}

type Change = { key: string; label: string; previous: string[]; current: string[] };
type DigestChange = { id: string; name: string; listing?: string; fields: Change[] };

const dateStatusLabel = { confirmed: "Confirmed", estimated: "Estimated", tba: "To be announced" };
const eventStatusLabel = { cancelled: "Cancelled", postponed: "Postponed" };
const listingLabel = (event?: PublishedEvent) =>
  event && (event.archived ? "Archived listing" : "Active listing");

function collectChanges(previous?: PublishedEvent, current?: PublishedEvent): Change[] {
  const fields: Change[] = [];
  const lines = (value?: string | string[] | null) => typeof value === "string" ? [value] : value ?? [];
  const compare = (key: string, label: string, before?: string | string[] | null, after?: string | string[] | null) => {
    const previous = lines(before), current = lines(after);
    if (JSON.stringify(previous) !== JSON.stringify(current)) fields.push({ key, label, previous, current });
  };
  const rangeLabel = (range: EventDateRange) => formatDateRange(range.start_date, range.end_date);
  const schedule = (event?: PublishedEvent) => event && dateStatusLabel[event.dateStatus];
  const status = (event?: PublishedEvent) => event && (event.eventStatus ? eventStatusLabel[event.eventStatus] : "Scheduled");
  const month = (event?: PublishedEvent) => event?.estimatedMonth && monthLabel(event.estimatedMonth);
  const location = (event?: PublishedEvent) => [event?.city, event?.country].filter(Boolean).join(", ") || null;

  compare("listing", "Listing", listingLabel(previous), listingLabel(current));
  compare("status", "Event status", status(previous), status(current));
  compare("date-status", "Date status", schedule(previous), schedule(current));
  const oldDates = previous?.dates ?? [], newDates = current?.dates ?? [];
  const oldKeys = new Set(oldDates.map(occurrenceKey)), newKeys = new Set(newDates.map(occurrenceKey));
  const recurring = previous?.recurring || current?.recurring;
  const removedDates = oldDates.filter((range) => !newKeys.has(occurrenceKey(range)));
  const addedDates = newDates.filter((range) => !oldKeys.has(occurrenceKey(range)));
  const datesWithVenue = (range: EventDateRange) => [rangeLabel(range), range.venue].filter(Boolean).join(" · ");
  compare("dates", recurring ? "Recurring dates" : "Event dates",
    removedDates.map(datesWithVenue), addedDates.map(datesWithVenue));
  compare("month", "Estimated month", month(previous), month(current));
  compare("date-note", "Date note", previous?.dateNote, current?.dateNote);
  compare("location", "City and country", location(previous), location(current));
  compare("venue", "Venue", previous?.venue, current?.venue);
  const newVenues = new Map(newDates.map((range) => [occurrenceKey(range), range.venue]));
  for (const range of oldDates) {
    const key = occurrenceKey(range);
    const currentVenue = newVenues.get(key);
    if (newVenues.has(key) && range.venue !== currentVenue)
      compare(`venue-${key}`, `Venue for ${rangeLabel(range)}`, range.venue ?? previous?.venue, currentVenue ?? current?.venue);
  }
  for (const key of termKeys) compare(key, termLabels[key], previous?.terms[key], current?.terms[key]);

  function compareRecords(group: string, label: string, oldRecords: VendorTerms[] = [], newRecords: VendorTerms[] = []) {
    const before = new Map(oldRecords.map(({ id, lines }) => [id, lines]));
    const after = new Map(newRecords.map(({ id, lines }) => [id, lines]));
    for (const id of new Set([...before.keys(), ...after.keys()])) compare(`${group}-${id}`, label, before.get(id), after.get(id));
  }
  const milestoneRecords = (event?: PublishedEvent) => event?.milestones.map((m) => ({
    id: m.id,
    lines: [m.label, ...milestoneTimes(m, true), `${milestoneTypeLabels[m.type]} · ${m.timeZone}`,
      ...(m.verified ? [] : ["Unverified date"]), ...(m.notes ? [m.notes] : []), `Source · ${m.source}`],
  }));
  compareRecords("milestone", "Booking milestone", milestoneRecords(previous), milestoneRecords(current));
  compareRecords("price", "Published booth option", previous?.prices, current?.prices);
  compareRecords("document", "Public vendor document", previous?.documents, current?.documents);
  return fields;
}

export function digestChanges(previous: DigestCheckpoint | null, current: DigestSnapshot): DigestChange[] {
  if (!previous) return [];
  const ids = new Set([...Object.keys(previous.eventsById), ...Object.keys(current.eventsById)]);
  return [...ids].flatMap((id) => {
    const before = Object.hasOwn(previous.eventsById, id) ? previous.eventsById[id] : undefined;
    const after = Object.hasOwn(current.eventsById, id) ? current.eventsById[id] : undefined;
    const fields = collectChanges(before, after);
    if (!fields.length) return [];
    const listing = !after ? "Removed from the data"
      : after.archived && !before?.archived ? "Archived"
      : !before ? "Added"
      : before.archived && !after.archived ? "Relisted" : undefined;
    return [{ id, name: (after ?? before!).name, listing, fields }];
  }).sort((a, b) => a.name.localeCompare(b.name) || byId(a, b));
}

type OutreachReminder = ReturnType<typeof outreachReminders>[number];
type WeekAction =
  | { day: string; event: Event; milestone: VendorMilestone; kind: "milestone" }
  | { day: string; event: Event; reminder: OutreachReminder; kind: "outreach" };
type SourceCheck = { event: Event; id: string; label: string; detail?: string; href?: string };

function uncheckedNotice(event: Event) {
  const text = clean(event.vendor_deadline);
  if (!text) return;
  const notice = /\bplayer\b/i.test(text)
    ? text.split(";").map((clause) => clause.trim()).filter((clause) => /\b(?:vendor|exhibitor|booth)\b/i.test(clause)).join("; ")
    : text;
  if (!notice || /^[-–—]+$/.test(notice)) return;
  // A verified milestone can already cover the same announcement. Text dates are only used to deduplicate.
  const covered = event.vendor_milestones?.some((milestone) =>
    milestone.verified && (milestone.type === "booking_opens" || milestone.type === "application_closes") &&
    [milestone.at.slice(0, 10), ...milestoneTimes(milestone).map((label) => label.split(/, | · /)[0])]
      .some((date) => new RegExp(`\\b${date}\\b`, "i").test(notice)));
  if (!covered) return notice;
}

export function digestActions(events: readonly Event[], now: number) {
  const today = saigonDay(now);
  const end = new Date(Date.parse(today) + 6 * 86_400_000).toISOString().slice(0, 10);
  const active = events.filter((event) => !event.scanner_archived);
  const reminders = outreachReminders(active, today);
  const followUps = reminders.filter(({ due }) => due <= today);
  const actions: WeekAction[] = [];
  const sourceChecks: SourceCheck[] = [];
  for (const event of active) {
    if (event.event_status) continue;
    const milestones = event.vendor_milestones ?? [];
    const notice = uncheckedNotice(event);
    const checkSources = upcoming(event, today) && (Boolean(notice) || milestones.some((m) => !m.verified));
    const routes = checkSources ? vendorRoutes(event) : undefined;
    const source = routes && (milestoneSourceHref(routes.application?.href ?? "") ??
      milestoneSourceHref(routes.official?.href ?? "") ?? milestoneSourceHref(event.source?.url ?? "") ??
      milestoneSourceHref(routes.reference?.href ?? "") ?? routes.contact?.href);
    for (const milestone of milestones) {
      if (!milestone.verified) {
        if (checkSources) sourceChecks.push({ event, id: `milestone-${milestone.id}`, label: milestone.label,
          detail: milestone.notes, href: milestoneSourceHref(milestone.source) ?? source });
        continue;
      }
      const day = milestoneDay(milestone);
      if (day >= today && day <= end) actions.push({ day, event, milestone, kind: "milestone" });
    }
    if (checkSources && notice) sourceChecks.push({ event, id: "notice", label: "Vendor notice", detail: notice, href: source });
  }
  for (const reminder of reminders) {
    if (reminder.due > today && reminder.due <= end)
      actions.push({ day: reminder.due, event: reminder.event, reminder, kind: "outreach" });
  }
  actions.sort((a, b) => a.day.localeCompare(b.day) ||
    (a.kind === "milestone" && b.kind === "milestone" ? compareMilestones(a.milestone, b.milestone)
      : a.kind.localeCompare(b.kind)) || a.event.name.localeCompare(b.event.name) || byId(a.event, b.event));
  sourceChecks.sort((a, b) => a.event.name.localeCompare(b.event.name) || byId(a.event, b.event) || byId(a, b));

  const days = new Map<string, WeekAction[]>();
  for (const action of actions) {
    const day = days.get(action.day);
    if (day) day.push(action);
    else days.set(action.day, [action]);
  }
  return { today, end, days, followUps, sourceChecks };
}
