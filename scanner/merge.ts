import { isDeepStrictEqual } from "node:util";
import type { Event } from "../src/model.ts";
import { mergeMilestones, mergeVendorPricing } from "../src/data.ts";
import { listingKey, type Notice } from "./listing.ts";
import { slug } from "./normalize.ts";
import { fold } from "./relevance.ts";

const day = 86_400_000;
const stamp = (s: string) => Date.parse(s + "T00:00:00Z");
function tokens(s: string) {
  // Suntec's description calls its Arca listing "Nexus TCG Tradeshow".
  return new Set(
    fold(s)
      .replace(/nexus collectibles arca/g, "nexus tradeshow")
      .replace(/\bcardshow\b/g, "card show")
      .replace(/comic-con/g, "comic con")
      .replace(/\b(volume|vol)\.?\s*\d+/g, " ")
      .replace(/\b(?:20\d\d|edition|the|by|in|and|at|of)\b/g, " ")
      .match(/[\p{L}\d]+/gu) ?? [],
  );
}
function similar(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b);
  const common = [...x].filter((t) => y.has(t)).length;
  if (!common) return false;
  const min = Math.min(x.size, y.size);
  return (
    (common === x.size && common === y.size) ||
    common / (x.size + y.size - common) >= 0.68 ||
    (common === min &&
      min >= 2 &&
      [...x].some(
        (t) =>
          y.has(t) &&
          ![
            "card",
            "show",
            "comic",
            "con",
            "expo",
            "games",
            "fest",
            "trading",
          ].includes(t),
      ))
  );
}
function ranges(e: Event) {
  return e.occurrences?.length
    ? e.occurrences
    : e.start_date
      ? [{ start_date: e.start_date, end_date: e.end_date ?? e.start_date }]
      : [];
}
function nearby(a: Event, b: Event) {
  const ar = ranges(a),
    br = ranges(b);
  if (ar.length && br.length)
    return ar.some((x) =>
      br.some(
        (y) =>
          stamp(x.start_date) <= stamp(y.end_date) + 3 * day &&
          stamp(y.start_date) <= stamp(x.end_date) + 3 * day,
      ),
    );
  const months = (e: Event) =>
    [
      e.estimated_month,
      ...ranges(e).flatMap((r) => [
        r.start_date.slice(0, 7),
        r.end_date.slice(0, 7),
      ]),
    ].filter(Boolean);
  return months(a).some((m) => months(b).includes(m));
}
const city = (e: Event) => fold(e.city ?? "").replace(/\s*\(.*|,.*$/g, "").trim();

function sameLocation(a: Event, b: Event) {
  return !(
    (a.country_code && b.country_code && a.country_code !== b.country_code) ||
    (a.country && b.country && fold(a.country) !== fold(b.country)) ||
    (city(a) && city(b) && city(a) !== city(b))
  );
}

function similarTitles(a: Event, b: Event) {
  if (similar(a.name, b.name)) return true;
  // Venue listings often append a parenthetical subtitle and organisers append
  // the host city. Compare the main title too, once location and dates agree.
  const mainTitle = (e: Event) =>
    fold(e.name)
      .split("(")[0]
      .replaceAll(city(e) || "\u0000", " ")
      .trim();
  return similar(mainTitle(a), mainTitle(b));
}

export function matches(a: Event, b: Event) {
  return sameLocation(a, b) && nearby(a, b) && similarTitles(a, b);
}

const editionNumber = (event: Event) => fold(event.name).replace(/\b20\d\d\b/g, "")
  .match(/\b\d+(?=\b|(?:st|nd|rd|th)\b)/g)?.map(Number).join(" ");
const namedYear = (event: Event) => event.name.match(/\b20\d\d\b/g)?.join(" ");
const scheduleYear = (event: Event) => (event.start_date ?? event.estimated_month)?.slice(0, 4);

function compatibleEditions(a: Event, b: Event) {
  const aNumber = editionNumber(a), bNumber = editionNumber(b);
  const aYear = namedYear(a), bYear = namedYear(b);
  return (!aNumber || !bNumber || aNumber === bNumber) && (!aYear || !bYear || aYear === bYear);
}

function importMatch(a: Event, b: Event) {
  if (!sameLocation(a, b) || !compatibleEditions(a, b) || !similarTitles(a, b)) return false;
  if (nearby(a, b) || (historicalRanges(a).length > 0 &&
    nearby({ ...a, occurrences: historicalRanges(a), estimated_month: null }, b))) return true;
  if (a.date_status !== "tba" && b.date_status !== "tba") return false;
  // An undated watch can be relisted without a year suffix, but a dated
  // edition needs corroboration to avoid consuming a generic series watch.
  const aYear = namedYear(a) ?? scheduleYear(a), bYear = namedYear(b) ?? scheduleYear(b);
  return tokens(a.name).size > 0 && slug(a.name.replace(/\b20\d\d\b/g, "")) ===
    slug(b.name.replace(/\b20\d\d\b/g, "")) &&
    (a.date_status === "tba" && b.date_status === "tba" || !!aYear && aYear === bYear);
}

function scannerReschedule(old: Event, next: Event) {
  if (!city(old) || city(old) !== city(next) || !sameLocation(old, next) || !compatibleEditions(old, next)) return false;
  if ([old, next].some((event) => event.section === "recurring_sg" || event.occurrences?.length)) return false;
  const sameNumber = editionNumber(old) && editionNumber(old) === editionNumber(next);
  const retainedYear = namedYear(old) && namedYear(old) === namedYear(next) && scheduleYear(old) !== scheduleYear(next);
  if (similarTitles(old, next) && (sameNumber || retainedYear)) return true;
  // A shared dated listing can corroborate a move even with a rewritten title.
  return [old.website, ...(old.source_urls ?? [])].some((link) => {
    if (!link || !URL.canParse(link)) return false;
    const url = new URL(link);
    return /(?:^|[/_-])20\d\d(?:$|[./_-])/.test(url.pathname) &&
      (next.website === link || next.source_urls?.includes(link));
  });
}

function historicalRanges(e: Event) {
  return e.source?.previous_dates ?? e.source?.original_dates ?? [];
}
function sameRange(a: { start_date: string; end_date: string }, b: typeof a) {
  return a.start_date === b.start_date && a.end_date === b.end_date;
}
function sourceHistory(old: Event, next: Event, listing = next) {
  const superseded = ranges(old).filter((r) => !ranges(next).some((n) => sameRange(n, r)));
  const history = [...historicalRanges(old).filter((r) => !superseded.some((s) => sameRange(s, r))), ...superseded];
  const aliases = new Set(old.source?.aliases);
  for (const key of [listingKey(old), listingKey(listing)]) {
    if (key) aliases.add(key);
  }
  return {
    ...(history.length && {
      original_dates: old.source?.original_dates?.length ? old.source.original_dates : superseded.length ? superseded : [history[0]],
      previous_dates: history,
    }),
    ...(aliases.size && { aliases: [...aliases] }),
  };
}

function hasSharedPlanning(event: Event) {
  return Boolean(event.outreach || event.vendor_milestones?.length ||
    event.vendor_options?.length || event.vendor_documents?.length || event.trip_budget);
}

function preserveMilestones(previous: Event, next: Event): Partial<Event> {
  if (!previous.vendor_milestones?.length) return {};
  return {
    vendor_milestones: mergeMilestones(next.vendor_milestones, previous.vendor_milestones),
    vendor_deadline: previous.vendor_deadline ?? next.vendor_deadline,
  };
}

function refreshVendorPricing(previous: Event, next: Event) {
  const pricing = mergeVendorPricing(next, previous);
  const published = new Map(next.vendor_options?.filter((option) => option.basis === "published")
    .map((option) => [option.id, option]));
  if (pricing.vendor_options) {
    pricing.vendor_options = pricing.vendor_options.map((option) => {
      const update = published.get(option.id);
      return option.basis === "published" && update
        ? { ...update, eligibility: option.eligibility, notes: option.notes || update.notes }
        : option;
    });
  }
  return pricing;
}

export function emptyField(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}

export interface ImportConflict {
  event_id: string;
  export_id: string;
  field: string;
  curated: unknown;
  incoming: unknown;
  reason: string;
}

export interface ImportRow {
  event: Event;
  previous?: Event;
  incoming: Event;
}

function reconcileScanner(existing: Event[], imported: Event[]) {
  const byId = new Map(existing.map((event) => [event.id, event]));
  const claims = imported.map((event) => {
    const direct = byId.get(event.id);
    if (direct) return { event, priority: 0, candidates: [direct] };
    const aliases = existing.filter((old) => old.scanner_export_id === event.id);
    if (aliases.length) return { event, priority: 1, candidates: aliases };
    const near = existing.filter((old) => importMatch(old, event));
    const activeNear = near.filter((old) => !old.scanner_archived);
    const exact = activeNear.filter((old) => ranges(old).some((range) =>
      ranges(event).some((other) => sameRange(range, other))));
    if (exact.length) return { event, priority: 2, candidates: exact };
    if (activeNear.length) return { event, priority: 3, candidates: activeNear };
    if (near.length) return { event, priority: 4, candidates: near };
    const moved = existing.filter((old) => !old.scanner_archived &&
      (!old.source || hasSharedPlanning(old)) && scannerReschedule(old, event));
    return { event, priority: 5, candidates: moved };
  });
  const matchedRows = new Map<Event, Event>();
  const added: Event[] = [];
  const conflicts: ImportConflict[] = [];
  let fieldsFilled = 0;
  const rows: ImportRow[] = [];
  const selected = new Map<Event, Event>();
  for (const { event, candidates } of [...claims].sort((a, b) => a.priority - b.priority)) {
    if (candidates.length === 1 && !selected.has(candidates[0])) selected.set(candidates[0], event);
  }
  for (const { event: incoming, candidates } of claims) {
    const [previous] = candidates;
    const duplicate = previous
      ? selected.get(previous) !== incoming && previous
      : added.find((event) => importMatch(event, incoming));
    if (candidates.length > 1) {
      conflicts.push({ event_id: previous.id, export_id: incoming.id, field: "id",
        curated: candidates.map((event) => event.id), incoming: incoming.id, reason: "ambiguous event match" });
      continue;
    }
    if (duplicate) {
      conflicts.push({ event_id: duplicate.id, export_id: incoming.id, field: "id",
        curated: duplicate.id, incoming: incoming.id, reason: "duplicate export listing" });
      continue;
    }
    const { scanner_export_id: _exportId, scanner_archived: _archived,
      source: _source, is_new_find: _newFind, ...fields } = incoming;
    if (!previous) {
      added.push(fields);
      rows.push({ event: fields, incoming });
      continue;
    }
    // Keep the planner ID so event links, seed log entries and local patches still resolve.
    const event = { ...previous };
    // An export match takes ownership from the live scraper while keeping its planner data.
    if (previous.source) {
      const originalStart = previous.source.original_dates?.[0]?.start_date ??
        previous.source.previous_dates?.[0]?.start_date;
      if (!event.original_start_date && !event.occurrences?.length && originalStart)
        event.original_start_date = originalStart;
      delete event.source;
      delete event.is_new_find;
    }
    delete event.scanner_archived;
    if (previous.id !== incoming.id && emptyField(previous.scanner_export_id))
      event.scanner_export_id = incoming.id;
    const curated = new Map(Object.entries(event));
    const fills: [string, unknown][] = [];
    const scheduleDisagrees = (["date_status", "start_date", "end_date", "estimated_month"] as const).some(
      (key) => !emptyField(previous[key]) && !isDeepStrictEqual(previous[key], fields[key]),
    );
    for (const [field, value] of Object.entries(fields)) {
      if (field === "logo" || field === "logo_kind" || value === undefined) continue;
      const current = curated.get(field);
      if (isDeepStrictEqual(current, value)) continue;
      let reason: string;
      if (!emptyField(current)) reason = "curated value kept";
      else if (emptyField(value)) continue;
      else if (field === "website" && typeof value === "string" && previous.source_urls?.includes(value) &&
          /official (?:website|site) (?:was )?not (?:independently )?(?:confirmed|verified|found)/i.test(previous.description ?? ""))
        reason = "website is already listed as a reference and the official site is unconfirmed";
      else if (scheduleDisagrees &&
          ["start_date", "end_date", "estimated_month", "occurrences", "original_start_date", "date_note"].includes(field))
        reason = "incompatible with curated schedule";
      else {
        fills.push([field, value]);
        continue;
      }
      conflicts.push({ event_id: previous.id, export_id: incoming.id, field,
        curated: current ?? null, incoming: value, reason });
    }
    const updated = { ...event, ...Object.fromEntries(fills) };
    fieldsFilled += fills.length;
    matchedRows.set(previous, updated);
    rows.push({ event: updated, previous, incoming });
  }
  return {
    scanner: [...existing.flatMap((event) => {
      const matched = matchedRows.get(event);
      return matched ? [matched] : !event.source && !event.scanner_archived ? [event] : [];
    }), ...added],
    old: existing.filter((event) => event.source && !matchedRows.has(event)),
    rows, added, conflicts, fieldsFilled,
  };
}

export function merge(
  existing: Event[],
  incoming: Event[],
  today: string,
  imported?: Event[],
  sourceOrder: readonly string[] = [],
  notices: Notice[] = [],
) {
  const rank = (id: string) => {
    const index = sourceOrder.indexOf(id);
    return index === -1 ? Infinity : index;
  };
  const scannerImport = imported && reconcileScanner(existing, imported);
  const { scanner, old } = scannerImport ?? {
    scanner: existing.filter((e) => !e.source && !e.scanner_archived),
    old: existing.filter((e) => e.source),
  };
  const retained = old.filter(
    (e) => hasSharedPlanning(e) || !scanner.some((s) => s.id === e.id || importMatch(e, s)),
  );
  function samePlace(a: Event, b: Event) {
    return (!a.city || !b.city || fold(a.city) === fold(b.city)) &&
      (!a.country_code || !b.country_code || a.country_code === b.country_code);
  }
  const snapshot = retained.slice();
  const editionRanges = (e: Event) => [...ranges(e), ...historicalRanges(e)];
  function keyMatches(stored: Event, listing: Event) {
    const key = listingKey(listing);
    return !!key && (listingKey(stored) === key || !!stored.source!.aliases?.includes(key));
  }
  function sameSubject(stored: Event, listing: Event) {
    if (stored.source!.id !== listing.source!.id || !samePlace(stored, listing)) return false;
    if (fold(stored.name) === fold(listing.name)) return true;
    const named = fold(listing.name).match(/^(.+) (20\d\d)$/);
    return !!named && fold(stored.name) === named[1] &&
      !!stored.city && !!listing.city && !!stored.country_code && !!listing.country_code &&
      (keyMatches(stored, listing) || editionRanges(stored).some((r) =>
        r.start_date.startsWith(named[2]) || r.end_date.startsWith(named[2])));
  }
  function compatibleKeys(a: Event, b: Event) {
    if (!listingKey(a) || !listingKey(b) || keyMatches(a, b)) return true;
    // The Singapore Card Show can change its title while keeping the same
    // dates and booking form. Match the title separately in the caller.
    return a.source!.id === "sg-card-show" && b.source!.id === "sg-card-show" &&
      !!a.vendor_application && a.vendor_application === b.vendor_application && !!a.start_date &&
      a.start_date === b.start_date && a.end_date === b.end_date;
  }
  function announced(stored: Event, listing: Event) {
    return !!listing.start_date && (stored.estimated_month === listing.start_date.slice(0, 7) ||
      ranges(stored).some((r) => r.start_date === listing.start_date));
  }
  function canRelist(stored: Event, listing: Event) {
    if (!sameSubject(stored, listing)) return false;
    if (keyMatches(stored, listing) || announced(stored, listing)) return true;
    if (!compatibleKeys(stored, listing)) return false;
    if (!listing.start_date) return listing.date_status === "tba";
    return editionRanges(stored).some((r) => Math.abs(stamp(r.start_date) - stamp(listing.start_date!)) <= 31 * day);
  }
  function candidates(listing: Event) {
    const rows = snapshot.filter((stored) => {
      if (stored.source!.id !== listing.source!.id) return matches(stored, listing);
      if (stored.event_status) return canRelist(stored, listing);
      if (!compatibleKeys(stored, listing)) return false;
      return (sameSubject(stored, listing) && keyMatches(stored, listing)) || matches(stored, listing) ||
        (sameSubject(stored, listing) && (!stored.start_date || !listing.start_date) &&
          (!stored.estimated_month || !listing.estimated_month || stored.estimated_month === listing.estimated_month) &&
          (stored.date_status === "tba" || listing.date_status === "tba" || stored.id === listing.id));
    });
    // A city page may list multiple fully dated stops at the same URL.
    const activeRows = rows.filter((stored) => !stored.scanner_archived);
    const comparable = activeRows.length ? activeRows : rows;
    const exact = comparable.filter((stored) => sameSubject(stored, listing) && ranges(stored).some((r) =>
      r.start_date === listing.start_date && r.end_date === listing.end_date));
    return exact.length ? exact : comparable;
  }
  const claims = new Map(incoming.map((event) => [event, candidates(event)]));
  const known: Record<string, number> = {};
  const byEdition = new Map<number, Notice[]>();
  const applied: Notice[] = [], unmatched: Notice[] = [];
  const blocked = new Set<Event>();
  for (const notice of notices) {
    const matched = snapshot.filter((stored) => {
      if (notice.unknownOriginal || !sameSubject(stored, notice) || !compatibleKeys(stored, notice)) return false;
      const dates = editionRanges(stored);
      if (notice.originalStart)
        return dates.some((r) => r.start_date === notice.originalStart && r.end_date === notice.originalEnd);
      return keyMatches(stored, notice) || (!!stored.city && !!notice.city && !!stored.country_code &&
        !!notice.country_code && (dates.length > 0 || !!stored.estimated_month));
    });
    const activeEditions = matched.filter((event) => !event.scanner_archived);
    const editions = activeEditions.length ? activeEditions : matched;
    if (editions.length !== 1 || incoming.some((card) => card.source!.id === notice.source!.id &&
        (editions.some((stored) => claims.get(card)!.includes(stored)) ||
          (!notice.originalStart && sameSubject(card, notice) && compatibleKeys(card, notice))))) {
      editions.forEach((e) => blocked.add(e));
      unmatched.push(notice);
      continue;
    }
    const index = snapshot.indexOf(editions[0]);
    byEdition.set(index, [...(byEdition.get(index) ?? []), notice]);
  }
  const updates = new Map<number, Notice>();
  for (const [index, group] of byEdition) {
    if (group.length !== 1 || blocked.has(snapshot[index])) {
      unmatched.push(...group);
      continue;
    }
    const notice = group[0];
    updates.set(index, notice);
    applied.push(notice);
    const owner = notice.source!.id;
    known[owner] = (known[owner] ?? 0) + 1;
  }
  const newIds = new Set<string>();
  const ambiguous: Event[] = [];
  const orderedIncoming = [...incoming].sort((a, b) => rank(a.source!.id) - rank(b.source!.id) ||
    a.source!.id.localeCompare(b.source!.id) || (a.start_date ?? "").localeCompare(b.start_date ?? "") ||
    a.id.localeCompare(b.id));
  for (const event of orderedIncoming) {
    const owner = event.source!.id;
    const scannerMatch = scanner.some((s) => s.id === event.id || importMatch(s, event));
    const rows = claims.get(event)!;
    if (rows.length > 1 || rows.some((row) => incoming.some((other) => other !== event &&
        other.source!.id === owner && claims.get(other)!.includes(row)))) {
      ambiguous.push(event);
      continue;
    }
    if (rows.some((row) => blocked.has(row))) continue;
    let i = rows.length ? snapshot.indexOf(rows[0]) : -1;
    // An organizer and a venue may publish a previously unseen show together.
    if (i < 0) i = retained.findIndex((row, j) => j >= snapshot.length && row.source!.id !== owner && matches(row, event));
    // A secondary calendar can continue advertising the pre-postponement
    // schedule even after the owner has published its replacement.
    if (i < 0 && snapshot.some((e) => e.source!.id !== owner && historicalRanges(e).length &&
        matches({ ...e, occurrences: historicalRanges(e), estimated_month: null }, event))) {
      known[owner] = (known[owner] ?? 0) + 1;
      continue;
    }
    if (scannerMatch || i >= 0) known[owner] = (known[owner] ?? 0) + 1;
    if (scannerMatch || byEdition.has(i)) continue;
    if (i >= 0) {
      const earlier = retained[i];
      const oldOwner = earlier.source!.id;
      if (oldOwner === owner || rank(owner) < rank(oldOwner)) {
        // Only a dated re-listing by the owner can withdraw a published notice.
        if (earlier.event_status && (oldOwner !== owner || !event.start_date)) continue;
        const { outreach: _outreach, ...update } = event;
        retained[i] = {
          ...earlier,
          ...update,
          ...(keyMatches(earlier, event) && { vendor_application: event.vendor_application ?? earlier.vendor_application }),
          ...preserveMilestones(earlier, event),
          ...refreshVendorPricing(earlier, event),
          ...(earlier.trip_budget && { trip_budget: earlier.trip_budget }),
          id: earlier.id,
          logo: event.logo ?? earlier.logo,
          logo_kind: event.logo ? event.logo_kind : earlier.logo_kind,
          description: event.description ?? earlier.description,
          vendor_score: earlier.vendor_score ?? event.vendor_score,
          verification: earlier.verification === "verified" ? "verified" : event.verification,
          source: {
            ...earlier.source!,
            ...event.source!,
            ...sourceHistory(earlier, event),
            discovered_at: earlier.source!.discovered_at,
          },
        };
        delete retained[i].event_status;
        delete retained[i].scanner_archived;
      }
    } else {
      // A recurring show can list two different weekends in the same month.
      // Keep the first identity and qualify a colliding slug using the listing.
      let id = event.id;
      if (retained.some((e) => e.id === id)) {
        const edition = slug([event.country_code, event.city, event.start_date?.slice(-2)]
          .filter(Boolean).join(" "));
        const suffix = id.lastIndexOf("-");
        const qualified = id.slice(0, suffix) + "-" + edition + id.slice(suffix);
        id = qualified;
        for (let n = 2; retained.some((e) => e.id === id) || scanner.some((e) => e.id === id); n++)
          id = qualified + "-" + n;
      }
      const location = event.venue ? " at " + event.venue :
        event.city && !fold(event.name).includes(fold(event.city)) ? " in " + event.city : "";
      retained.push({
        ...event, id,
        description: event.description ?? `${event.source!.name} lists ${event.name}${location}.`,
      });
      newIds.add(id);
    }
  }
  for (const [i, notice] of updates) {
    const earlier = retained[i];
    const updated: Event = { ...earlier, event_status: notice.event_status, date_note: notice.date_note };
    if (notice.event_status === "postponed") {
      updated.start_date = notice.start_date;
      updated.end_date = notice.end_date;
      updated.estimated_month = notice.estimated_month;
      updated.date_status = notice.date_status;
      updated.section = notice.section;
      delete updated.occurrences;
    } else if (!earlier.start_date) {
      const history = historicalRanges(earlier);
      const range = notice.originalStart ? history.find((r) => r.start_date === notice.originalStart &&
        r.end_date === notice.originalEnd) : history.at(-1);
      if (range) Object.assign(updated, range, { date_status: "confirmed", estimated_month: null, section: "timeline" });
    }
    updated.source = {
      ...earlier.source!,
      ...sourceHistory(earlier, updated, notice),
      confidence: notice.event_status === "postponed" ? notice.source!.confidence : earlier.source!.confidence,
    };
    retained[i] = updated;
  }
  // Reconcile rescheduled shows before removing past events from the calendar.
  const active = retained.filter((e) =>
    hasSharedPlanning(e) || (!e.scanner_archived && (!e.end_date || stamp(today) - stamp(e.end_date) <= 30 * day)),
  );
  // Insert finds chronologically within the export sections; preserve the original
  // order of all Scanner records, including its manually positioned TBA entries.
  const section = { timeline: 0, recurring_sg: 1, watchlist: 2 };
  const key = (e: Event) =>
    e.start_date ?? (e.estimated_month ? e.estimated_month + "-15" : "9999");
  const ordered = [...scanner];
  for (const e of active.sort(
    (a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id),
  )) {
    const index = ordered.findIndex(
      (other) =>
        section[other.section] > section[e.section] ||
        (other.section === e.section &&
          (other.start_date || other.estimated_month) &&
          key(other) > key(e)),
    );
    ordered.splice(index < 0 ? ordered.length : index, 0, e);
  }
  // The scanner cannot read browser storage. Keep the last listing for any plans
  // attached to a removed ID, without putting that listing back in the calendar.
  const activeIds = new Set(ordered.map((event) => event.id));
  const archived = new Map<string, Event>();
  for (const event of [...existing, ...retained]) {
    if (!activeIds.has(event.id)) archived.set(event.id, { ...event, scanner_archived: true });
  }
  return {
    events: [...ordered, ...archived.values()],
    scannerImport,
    added: ordered.filter((e) => newIds.has(e.id)),
    known,
    applied,
    unmatched,
    ambiguous,
    removed: existing.filter((e) => e.source && !e.scanner_archived && !activeIds.has(e.id)).length,
  };
}
