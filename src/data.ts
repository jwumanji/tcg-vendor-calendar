import {
  emptyOutreach,
  outreachContactTypes,
  outreachMethods,
  outreachStatuses,
  type Event,
  type Outreach,
  type OutreachPatch,
} from "./model.ts";
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
    for (const key of nullableStrings)
      e[key] = typeof v[key] === "string" ? v[key] : null;
    if (record(v.outreach)) e.outreach = mergeOutreach(null, normalizeOutreachPatch(v.outreach));
    else if (v.outreach === null) e.outreach = null;
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
        : e.start_date;
    e.estimated_month =
      typeof v.estimated_month === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(v.estimated_month)
        ? v.estimated_month
        : null;
    e.occurrences = Array.isArray(v.occurrences)
      ? v.occurrences.filter(
          (r: { start_date?: unknown; end_date?: unknown } | null) =>
            r &&
            validDate(r.start_date) &&
            validDate(r.end_date) &&
            r.end_date >= r.start_date,
        )
      : undefined;
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
      e.verification = "unverified";
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
      v.verification === "scanner" ||
      v.verification === "unverified"
    ) {
      e.verification = v.verification;
    }
    return e as unknown as Event;
  });
}
