import {
  emptyOutreach,
  budgetCategories,
  type BudgetAmount,
  type BudgetDefaults,
  type CustomBudgetCost,
  type TripBudget,
  milestoneTypes,
  outreachContactTypes,
  outreachMethods,
  outreachNextActions,
  outreachStatuses,
  vendorEligibilities,
  vendorRateStatuses,
  type Event,
  type Outreach,
  type OutreachPatch,
  type OutreachStatus,
  type MilestoneType,
  type VendorMilestone,
  type VendorDocument,
  type VendorOption,
  type VendorPricingPatch,
} from "./model.ts";
import { milestoneInstantInRange } from "./milestones.ts";
import { findHomeBase } from "./homeBase.ts";
const nullableStrings = [
  "games_note",
  "date_note",
  "city",
  "country",
  "country_code",
  "venue",
  "region_group",
  "organizer",
  "expected_size",
  "size_note",
  "size_tier",
  "previous_editions",
  "first_year",
  "vendor_booths",
  "vendor_application",
  "vendor_deadline",
  "vendor_cost",
  "booth_detail",
  "contact",
  "priority_market_level",
  "website",
  "tickets",
  "instagram",
  "description",
  "audience",
  "fit",
  "logo",
  "logo_kind",
] as const;
const nullableNumbers = [
  "visitors",
  "vendor_count",
  "previous_editions_count",
  "vendor_score",
  "shortlist_priority",
  "instagram_followers",
] as const;
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const httpUrl = (value: unknown): value is string =>
  isText(value) && /^https?:\/\//i.test(value) && URL.canParse(value);

const recordId = /^[a-z0-9][a-z0-9-]*$/;
const offsetDateTime = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const amount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function normalizeVendorOption(value: unknown): VendorOption {
  if (!record(value) || !isText(value.id) || !recordId.test(value.id))
    throw new Error("Booth option needs a stable ID.");
  const { id, name, size, includes, notes, source, currency, fx_rate, fx_as_of, fx_source,
    vat_rate, amount_incl_vat, kind, basis, early_bird, valid_until } = value;
  const eligibility = value.eligibility as VendorOption["eligibility"];
  const rate_status = value.rate_status as VendorOption["rate_status"];
  if (!isText(name) || !name.trim() || !isText(size) || !isText(includes) || !isText(notes) ||
      !isText(source) || !source.trim() || !isText(fx_source) || !fx_source.trim())
    throw new Error("Enter an option name, price source and FX source.");
  if (!amount(value.amount) || !isText(currency) || !/^[A-Z]{3}$/.test(currency) ||
      !amount(fx_rate) || fx_rate === 0 || !validDate(fx_as_of))
    throw new Error("Enter a valid local amount, a currency code, and a positive dated FX rate.");
  if (vat_rate !== undefined && (!amount(vat_rate) || vat_rate > 1 || !amount(amount_incl_vat) ||
      amount_incl_vat !== Math.round(value.amount * (1 + vat_rate) * 100) / 100))
    throw new Error("Enter a VAT rate and matching tax-inclusive amount.");
  if (vat_rate === undefined && amount_incl_vat !== undefined)
    throw new Error("A tax-inclusive amount requires a VAT rate.");
  const payable = amount(amount_incl_vat) ? amount_incl_vat : value.amount;
  const usd_amount = Math.round(payable / fx_rate * 100) / 100;
  if (!amount(usd_amount))
    throw new Error("The local amount and FX rate must yield a finite USD amount.");
  if (!vendorEligibilities.includes(eligibility) || !vendorRateStatuses.includes(rate_status) ||
      (kind !== "package" && kind !== "add_on") || (basis !== "quote" && basis !== "published"))
    throw new Error("Choose an eligibility, kind, price source type and rate status.");
  if (early_bird !== undefined && typeof early_bird !== "boolean")
    throw new Error("Early-bird status must be true or false.");
  if (valid_until !== undefined && (!isText(valid_until) || !offsetDateTime.test(valid_until) ||
      !validDate(valid_until.slice(0, 10)) || !Number.isFinite(Date.parse(valid_until))))
    throw new Error("Enter a cutoff as an ISO datetime with a UTC offset.");
  return {
    id, name: name.trim(), size: size.trim(), includes: includes.trim(), amount: value.amount, currency,
    fx_rate, fx_as_of, fx_source: fx_source.trim(), usd_amount,
    ...(vat_rate !== undefined && { vat_rate, amount_incl_vat: payable }),
    notes: notes.trim(), eligibility, kind, basis, source: source.trim(), rate_status,
    ...(early_bird !== undefined && { early_bird }),
    ...(valid_until !== undefined && { valid_until }),
  };
}

export function normalizeVendorDocument(value: unknown): VendorDocument {
  if (!record(value) || !isText(value.id) || !recordId.test(value.id))
    throw new Error("Vendor document needs a stable ID.");
  const { id, label, path, source, received_at, kind, notes } = value;
  if (!isText(label) || !label.trim() || !isText(source) || !source.trim() || !validDate(received_at))
    throw new Error("Enter a document label, source and received date.");
  if (!isText(path) || !/^vendor-docs\/[a-z0-9][a-z0-9._-]*\.(?:pdf|jpe?g|png|webp)$/i.test(path))
    throw new Error("Enter a PDF or image path under vendor-docs/.");
  if (kind !== undefined && kind !== "reference" && kind !== "organizer_proposal")
    throw new Error("Unknown vendor document type.");
  return { id, label: label.trim(), path, source: source.trim(), received_at,
    ...(kind && { kind }),
    ...(isText(notes) && notes.trim() && { notes: notes.trim() }) };
}

function normalizeVendorRecords<T extends { id: string }>(
  value: unknown, normalize: (row: unknown) => T, strict: boolean,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    if (strict) throw new Error("Expected a list of booth options or vendor documents.");
    return undefined;
  }
  const rows = new Map<string, T>();
  for (const entry of value) {
    try {
      const row = normalize(entry);
      if (rows.has(row.id)) throw new Error(`Duplicate vendor item ID ${row.id}.`);
      rows.set(row.id, row);
    } catch (error) {
      if (strict) throw error;
    }
  }
  return [...rows.values()];
}

export function normalizeVendorPricing(value: unknown, strict = false): VendorPricingPatch {
  if (!record(value)) {
    if (strict) throw new Error("Expected an object with booth options or vendor documents.");
    return {};
  }
  const vendor_options = normalizeVendorRecords(value.vendor_options, normalizeVendorOption, strict);
  const vendor_documents = normalizeVendorRecords(value.vendor_documents, normalizeVendorDocument, strict);
  return { ...(vendor_options && { vendor_options }), ...(vendor_documents && { vendor_documents }) };
}

export function mergeVendorPricing(base: VendorPricingPatch = {}, incoming: VendorPricingPatch = {}): VendorPricingPatch {
  function merge<T extends { id: string }>(previous: T[] = [], next: T[]) {
    return [...new Map([...previous, ...next].map((row) => [row.id, row])).values()];
  }
  const documents = incoming.vendor_documents?.map((document) => {
    // A document edit saved before document types existed inherits the shared type.
    const kind = base.vendor_documents?.find(({ id }) => id === document.id)?.kind;
    return kind && !document.kind ? { ...document, kind } : document;
  });
  return {
    ...(base.vendor_options && { vendor_options: base.vendor_options }),
    ...(base.vendor_documents && { vendor_documents: base.vendor_documents }),
    ...(incoming.vendor_options && { vendor_options: merge(base.vendor_options, incoming.vendor_options) }),
    ...(documents && { vendor_documents: merge(base.vendor_documents, documents) }),
  };
}

export function normalizeBudgetAmount(value: unknown): BudgetAmount {
  if (!record(value) || !amount(value.amount) || !isText(value.currency) || !/^[A-Z]{3}$/.test(value.currency))
    throw new Error("Enter a nonnegative amount and a three-letter currency code.");
  return { amount: value.amount, currency: value.currency };
}

export function normalizeBudgetDefaults(value: unknown): BudgetDefaults {
  if (!record(value)) throw new Error("Expected an object with trip budget defaults.");
  const defaults: BudgetDefaults = {};
  for (const key of ["lodging", "meals"] as const)
    if (value[key] !== undefined) defaults[key] = normalizeBudgetAmount(value[key]);
  return defaults;
}

export function normalizeTripBudget(value: unknown): TripBudget {
  if (!record(value)) throw new Error("Expected a trip budget object.");
  const budget: TripBudget = {};
  if (value.costs !== undefined) {
    if (!record(value.costs)) throw new Error("Expected an object with trip costs.");
    const costs: TripBudget["costs"] = {};
    for (const key of budgetCategories)
      if (value.costs[key] !== undefined) costs[key] = normalizeBudgetAmount(value.costs[key]);
    budget.costs = costs;
  }
  const travelBase = findHomeBase(value.travelHomeBase);
  if (budget.costs?.travel && travelBase) budget.travelHomeBase = travelBase.id;
  if (value.custom !== undefined) {
    if (!Array.isArray(value.custom)) throw new Error("Expected a list of custom costs.");
    const seen = new Set<string>();
    budget.custom = value.custom.map((line: unknown): CustomBudgetCost => {
      if (!record(line) || !isText(line.id) || !recordId.test(line.id) || seen.has(line.id) ||
          !isText(line.label) || !line.label.trim())
        throw new Error("Custom costs need a name and a unique ID.");
      seen.add(line.id);
      return { id: line.id, label: line.label.trim(), ...normalizeBudgetAmount(line) };
    });
  }
  if (value.walkAway !== undefined) budget.walkAway = normalizeBudgetAmount(value.walkAway);
  for (const key of ["nights", "mealDays"] as const) {
    const count = value[key];
    if (count === undefined) continue;
    if (!amount(count) || !Number.isSafeInteger(count)) throw new Error("Enter whole nights and meal days.");
    budget[key] = count;
  }
  const margin = value.contributionMarginBps;
  if (margin !== undefined) {
    if (!amount(margin) || !Number.isInteger(margin) || margin > 10_000)
      throw new Error("Enter a contribution margin from 0% to 100% with up to two decimal places.");
    budget.contributionMarginBps = margin;
  }
  return budget;
}

export function milestoneSourceHref(source: string): string | undefined {
  return httpUrl(source) ? source : undefined;
}

const zones = new Set<string>();
function validTimeZone(zone: string) {
  if (zones.has(zone)) return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    zones.add(zone);
    return true;
  } catch {
    return false;
  }
}

export function normalizeMilestone(value: unknown): VendorMilestone {
  if (!record(value) || !isText(value.id) || !recordId.test(value.id))
    throw new Error("Booking milestone needs a stable ID.");
  if (!milestoneTypes.includes(value.type as MilestoneType))
    throw new Error("Choose a booking milestone type.");
  const at = isText(value.at) ? value.at.trim() : "";
  const timed = offsetDateTime.test(at);
  if (!(timed && validDate(at.slice(0, 10)) && Number.isFinite(Date.parse(at))) && !validDate(at))
    throw new Error("Enter a valid date or an ISO datetime with a UTC offset.");
  const timeZone = isText(value.timeZone) ? value.timeZone.trim() : "";
  if (!/^(?:UTC|[a-z][\w+-]*(?:\/[\w+-]+)+)$/i.test(timeZone) || !validTimeZone(timeZone))
    throw new Error("Enter a valid organizer time zone, such as Asia/Singapore.");
  if (at.startsWith("0000-") || (timed && !milestoneInstantInRange(Date.parse(at), timeZone)))
    throw new Error("Use years 0001–9999 in the entered date, UTC, Saigon and the organizer time zone.");
  const label = isText(value.label) ? value.label.trim() : "";
  const source = isText(value.source) ? value.source.trim() : "";
  if (!label || !source) throw new Error("Enter a label and a source for the milestone.");
  if (typeof value.verified !== "boolean") throw new Error("Milestone verification must be true or false.");
  const notes = isText(value.notes) ? value.notes.trim() : "";
  return { id: value.id, type: value.type as MilestoneType, at, timeZone, label, source, verified: value.verified, ...(notes && { notes }) };
}

export function normalizeMilestones(value: unknown, strict = false): VendorMilestone[] {
  if (!Array.isArray(value)) {
    if (strict) throw new Error("Expected an array of booking milestones.");
    return [];
  }
  const milestones = new Map<string, VendorMilestone>();
  for (const item of value) {
    try {
      const milestone = normalizeMilestone(item);
      if (milestones.has(milestone.id)) throw new Error(`Duplicate booking milestone ID ${milestone.id}.`);
      milestones.set(milestone.id, milestone);
    } catch (error) {
      if (strict) throw error;
    }
  }
  return [...milestones.values()];
}

/** Incoming records replace matching milestones and keep unrelated dates. */
export function mergeMilestones(
  base: readonly VendorMilestone[] = [],
  incoming: readonly VendorMilestone[] = [],
): VendorMilestone[] {
  return [...new Map([...base, ...incoming].map((milestone) => [milestone.id, milestone])).values()];
}

export function outreachContactHref(value: unknown): string | undefined {
  if (httpUrl(value)) return value;
  if (isText(value) && /^[a-z\d.!#$%&'*+/=?^`{|}~-]+@[a-z\d.-]+\.[a-z\d-]+$/i.test(value))
    return "mailto:" + encodeURIComponent(value).replace("%40", "@");
}

const oneOf = (allowed: readonly string[]) =>
  (value: unknown) => isText(value) && allowed.includes(value);
const nullable = (valid: (value: unknown) => boolean) =>
  (value: unknown) => value === null || valid(value);
const outreachFields: Record<keyof Outreach, (value: unknown) => boolean> = {
  status: oneOf(outreachStatuses),
  method: nullable(oneOf(outreachMethods)),
  contact: nullable((value) => Boolean(outreachContactHref(value))),
  contact_type: nullable(oneOf(outreachContactTypes)),
  contacted_at: nullable(validDate),
  response_at: nullable(validDate),
  acknowledgement_at: nullable(validDate),
  next_action: nullable(oneOf(outreachNextActions)),
  follow_up_due_at: nullable(validDate),
  message_ref: nullable(isText),
  quoted_price: nullable(isText),
  notes: isText,
  published_booth_price: nullable(isText),
  price_source_url: nullable(httpUrl),
  research_notes: isText,
};

export function normalizeOutreachPatch(value: unknown, strict = false): OutreachPatch {
  if (!record(value)) {
    if (strict) throw new Error("Expected an outreach object.");
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(([key, field]) => {
      if (!Object.hasOwn(outreachFields, key)) return false;
      if (outreachFields[key as keyof Outreach](field)) return true;
      if (strict) throw new Error(`Invalid outreach field ${key}.`);
      return false;
    }),
  );
}

export function mergeOutreach(base?: Outreach | null, patch?: OutreachPatch): Outreach {
  const outreach = { ...emptyOutreach, ...base, ...patch };
  if (outreach.status === "not_contacted") outreach.method = null;
  return outreach;
}

export const outreachExchangeFields = [
  "status", "contacted_at", "response_at", "acknowledgement_at", "message_ref",
  "next_action", "follow_up_due_at",
] as const;

export function hasOutreachResponse(status: OutreachStatus) {
  return status === "replied" || status === "quoted" || status === "declined";
}

export function recordOutreachExchange(base: Outreach | null | undefined, patch: OutreachPatch): Outreach {
  return mergeOutreach(base, { next_action: null, follow_up_due_at: null, ...patch });
}

export function reconcileOutreachOverlay(shared: Outreach | null | undefined, saved?: OutreachPatch): OutreachPatch {
  if (!shared || !saved) return saved ?? {};
  const sharedHasResponse = hasOutreachResponse(shared.status);
  const sharedDate = sharedHasResponse ? shared.response_at : shared.acknowledgement_at;
  if (!sharedDate) return saved;

  const savedAwaitingReply = saved.status === "contacted" || saved.status === "not_contacted";
  const savedHasResponse = saved.status ? hasOutreachResponse(saved.status) : Boolean(saved.response_at);
  const savedContact = saved.contacted_at ?? "";
  const savedAck = saved.acknowledgement_at ?? "";
  const savedDate = (!savedAwaitingReply && saved.response_at) || (savedAck > savedContact ? savedAck : savedContact);
  const savedSentReference = !saved.status && !saved.response_at && savedDate === sharedDate &&
    saved.message_ref && saved.message_ref !== shared.message_ref;
  // An unanswered enquiry precedes a verified human reply on the same planner date.
  const sharedIsNewer = ((sharedHasResponse || !savedHasResponse) && savedDate && savedDate < sharedDate) ||
    (sharedHasResponse && (savedAwaitingReply || savedSentReference) && savedDate <= sharedDate);
  if (!sharedIsNewer) {
    // Older versions of the editor cleared this field when switching to a human reply.
    if (shared.acknowledgement_at && saved.acknowledgement_at === null &&
        hasOutreachResponse(saved.status ?? shared.status)) {
      return { ...saved, acknowledgement_at: shared.acknowledgement_at };
    }
    return saved;
  }

  const edits = { ...saved };
  for (const field of outreachExchangeFields) delete edits[field];
  if (!shared.acknowledgement_at && saved.acknowledgement_at)
    edits.acknowledgement_at = saved.acknowledgement_at;
  return edits;
}

export function normalizeEvents(value: unknown): Event[] {
  if (!Array.isArray(value)) throw new Error("Event data must be an array.");
  const ids = new Set<string>();
  return value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.id !== "string" ||
      !v.id ||
      typeof v.name !== "string" ||
      ids.has(v.id)
    )
      throw new Error("Event data contains an invalid or duplicate identity.");
    ids.add(v.id);
    const e: Record<string, unknown> = {
      id: v.id,
      name: v.name,
      event_type: typeof v.event_type === "string" ? v.event_type : "Unknown",
      section: ["timeline", "recurring_sg", "watchlist"].includes(v.section)
        ? v.section
        : "watchlist",
      date_status: ["confirmed", "estimated", "tba"].includes(v.date_status)
        ? v.date_status
        : "tba",
    };
    if (v.event_status === "cancelled" || v.event_status === "postponed")
      e.event_status = v.event_status;
    if (typeof v.scanner_export_id === "string" && v.scanner_export_id)
      e.scanner_export_id = v.scanner_export_id;
    if (v.scanner_archived === true) e.scanner_archived = true;
    for (const key of nullableStrings)
      e[key] = typeof v[key] === "string" ? v[key] : null;
    if (record(v.outreach)) e.outreach = mergeOutreach(null, normalizeOutreachPatch(v.outreach));
    else if (v.outreach === null) e.outreach = null;
    const milestones = normalizeMilestones(v.vendor_milestones);
    if (milestones.length) e.vendor_milestones = milestones;
    Object.assign(e, normalizeVendorPricing(v));
    if (v.trip_budget !== undefined) {
      try {
        e.trip_budget = normalizeTripBudget(v.trip_budget);
      } catch {
        // Invalid shared planning data must not prevent other events from loading.
      }
    }
    for (const key of nullableNumbers)
      e[key] =
        typeof v[key] === "number" && Number.isFinite(v[key]) ? v[key] : null;
    for (const key of ["games", "source_urls"])
      e[key] = Array.isArray(v[key])
        ? [...new Set(v[key].filter((s: unknown) => typeof s === "string"))]
        : [];
    for (const key of ["priority_market", "size_tier_estimated"])
      e[key] = v[key] === true;
    e.start_date = validDate(v.start_date) ? v.start_date : null;
    e.end_date =
      validDate(v.end_date) && e.start_date && v.end_date >= e.start_date
        ? v.end_date
        : null;
    e.estimated_month =
      typeof v.estimated_month === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(v.estimated_month)
        ? v.estimated_month
        : null;
    const validRange = (r: { start_date?: unknown; end_date?: unknown } | null) =>
      r && validDate(r.start_date) && validDate(r.end_date) && r.end_date >= r.start_date;
    if (validDate(v.original_start_date)) e.original_start_date = v.original_start_date;
    e.occurrences = Array.isArray(v.occurrences) ? v.occurrences.filter(validRange).map((r: Record<string, unknown>) => ({
      start_date: r.start_date, end_date: r.end_date,
      ...(validDate(r.original_start_date) && { original_start_date: r.original_start_date }),
      ...(typeof r.venue === "string" && r.venue.trim() && { venue: r.venue.trim() }),
    })) : undefined;
    if (v.source && typeof v.source === "object" && !Array.isArray(v.source)) {
      const src = v.source;
      const ratio = (n: unknown) =>
        typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1
          ? n
          : null;
      e.source = {
        id: typeof src.id === "string" ? src.id : "",
        name: typeof src.name === "string" ? src.name.trim() : "",
        url:
          typeof src.url === "string" &&
          URL.canParse(src.url) &&
          /^https?:\/\//i.test(src.url)
            ? src.url
            : "",
        ...(Array.isArray(src.original_dates) && { original_dates: src.original_dates.filter(validRange) }),
        ...(Array.isArray(src.previous_dates) && { previous_dates: src.previous_dates.filter(validRange) }),
        ...(Array.isArray(src.aliases) && { aliases: src.aliases.filter((key: unknown) => typeof key === "string" && key) }),
        discovered_at:
          typeof src.discovered_at === "string" &&
          /^\d{4}-\d{2}-\d{2}T/.test(src.discovered_at) &&
          Number.isFinite(Date.parse(src.discovered_at))
            ? src.discovered_at
            : "",
        confidence: ratio(src.confidence),
        relevance: ratio(src.relevance),
      };
    }
    e.is_new_find = v.is_new_find === true;
    if (e.is_new_find) {
      e.verification = v.verification === "verified" ? "verified" : "unverified";
      const dated =
        e.date_status === "estimated"
          ? e.estimated_month
          : e.date_status === "confirmed" &&
            (e.start_date ||
              (Array.isArray(e.occurrences) && e.occurrences.length));
      e.section = dated
        ? e.section === "recurring_sg"
          ? "recurring_sg"
          : "timeline"
        : "watchlist";
    } else if (
      v.verification === "verified" || v.verification === "scanner" ||
      v.verification === "unverified"
    ) {
      e.verification = v.verification;
    }
    return e as unknown as Event;
  });
}
