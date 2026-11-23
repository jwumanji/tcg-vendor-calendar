import type { Event } from "./model";
import { estimateTravel, resolveHomeBase, type HomeBase } from "./homeBase";
import { applicableVendorPrice, formatVendorAmount, formatVendorUsd, legacyVendorPrice } from "./vendorPricing";

export { parseBoothCost } from "./vendorPricing";

export const DEFAULT_WEIGHTS = Object.freeze({
  scale: 20,
  track: 10,
  tcg_fit: 20,
  market: 15,
  commercial: 15,
  logistics: 10,
  scanner_score: 10,
});
export type FactorKey = keyof typeof DEFAULT_WEIGHTS;
export type Weights = Record<FactorKey, number>;
export const FACTOR_META = {
  scale: {
    label: "Scale",
    description:
      "Attendance and vendor counts, with venue and size tier as proxies.",
  },
  track: {
    label: "Track record",
    description:
      "Prior editions, years running and evidence of an established organizer or series.",
  },
  tcg_fit: {
    label: "TCG fit",
    description: "Event format, featured card games and access for vendors.",
  },
  market: {
    label: "Market",
    description:
      "How closely the host country matches the vendor’s priority markets.",
  },
  commercial: {
    label: "Commercial potential",
    description:
      "Booth costs relative to attendance, shoppers per vendor and access to tables.",
  },
  logistics: {
    label: "Logistics",
    description: "Date certainty, estimated travel from your home base and time to apply.",
  },
  scanner_score: {
    label: "Fit score",
    description: "Vendor fit rating or an estimate based on shortlist priority.",
  },
} satisfies Record<FactorKey, { label: string; description: string }>;
const keys = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];
const clamp = (n: number, max = 1) => Math.min(max, Math.max(0, n));
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;

export function normalizeWeights(input?: unknown): Weights {
  const raw = { ...DEFAULT_WEIGHTS } as Weights;
  for (const key of keys) {
    const v =
      input && typeof input === "object" && Object.hasOwn(input, key)
        ? (input as Partial<Weights>)[key]
        : undefined;
    if (finite(v)) raw[key] = Math.round(clamp(v, 100));
  }
  const sum = keys.reduce((s, k) => s + raw[k], 0);
  if (!sum) return { ...DEFAULT_WEIGHTS };
  // Largest remainders preserve whole percentages without losing rounding points.
  const result = { ...raw };
  for (const k of keys) result[k] = Math.floor((raw[k] * 100) / sum);
  const order = [...keys].sort(
    (a, b) => ((raw[b] * 100) % sum) - ((raw[a] * 100) % sum),
  );
  const left = 100 - keys.reduce((s, k) => s + result[k], 0);
  for (const k of order.slice(0, left)) result[k]++;
  return result;
}

// Calibrated on the 97-event November 2026 export. The initial 72/58/42
// cutoffs concentrate too many shows in the upper tiers. Keep cutoffs fixed
// between snapshots so changing filters never changes an event’s tier.
export const TIER_THRESHOLDS = {
  must: 77,
  strong: 64,
  maybe: 52,
  skip: 0,
} as const;
export const TIER_LABELS = {
  must: "Must-do",
  strong: "Strong",
  maybe: "Maybe",
  skip: "Skip",
  cancelled: "Cancelled",
} as const;
export type Tier = keyof typeof TIER_LABELS;
export function tierOf(score: number): Tier {
  if (score >= TIER_THRESHOLDS.must) return "must";
  if (score >= TIER_THRESHOLDS.strong) return "strong";
  return score >= TIER_THRESHOLDS.maybe ? "maybe" : "skip";
}
export const scoreTone = tierOf;

type Evidence = {
  value: number;
  basis: "real" | "estimated" | "missing";
  signals: string[];
  note: string;
};
export interface FactorResult extends Evidence {
  key: FactorKey | "clash";
  label: string;
  weight: number;
  points: number;
}
export interface ClashInfo {
  id: string;
  name: string;
  score: number;
  startDate: string;
}
export interface ScoreResult {
  id: string;
  name: string;
  startDate: string | null;
  score: number;
  computedScore: number;
  tier: Tier;
  confidence: "high" | "medium" | "low";
  confidencePct: number;
  postponed?: boolean;
  factors: FactorResult[];
  clashes: ClashInfo[];
  overridden: boolean;
}
export interface ScoreOptions {
  weights?: unknown;
  overrides?: Readonly<Record<string, number>>;
  today?: string | Date;
  now?: number;
  homeBase?: string;
}
const missing = (note: string): Evidence => ({
  value: 0.4,
  basis: "missing",
  signals: [],
  note,
});
const real = (value: number, signals: string[], note: string): Evidence => ({
  value: clamp(value),
  basis: "real",
  signals,
  note,
});
const estimated = (
  value: number,
  signals: string[],
  note: string,
  cap = 0.75,
): Evidence => ({
  value: clamp(value, cap),
  basis: "estimated",
  signals,
  note,
});

// Interpolate in log-count space between the published scoring anchors.
function curve(n: number, anchors: number[][]) {
  for (let i = 1; i < anchors.length; i++) {
    const [x, y] = anchors[i];
    const [prev, base] = anchors[i - 1];
    if (n <= x)
      return (
        base +
        ((y - base) * Math.log1p((n - prev) / (1 + prev))) /
          Math.log1p((x - prev) / (1 + prev))
      );
  }
  return 1;
}
const hall =
  /\b(expo|convention cent(?:re|er)|marina bay sands|suntec|hkcec|mitec|bitec|dwtc|world trade cent(?:re|er))\b/i;
const sizes: Record<string, number> = { S: 0.2, M: 0.44, L: 0.64, XL: 0.75 };
function scale(e: Event): Evidence {
  const values: number[] = [],
    signals: string[] = [];
  if (count(e.visitors)) {
    values.push(
      curve(e.visitors, [
        [0, 0],
        [500, 0.2],
        [2000, 0.45],
        [10000, 0.8],
        [30000, 1],
      ]),
    );
    signals.push(
      `${e.visitors.toLocaleString("en-US")} reported attendance / capacity`,
    );
  }
  if (count(e.vendor_count)) {
    values.push(
      curve(e.vendor_count, [
        [0, 0],
        [30, 0.4],
        [100, 0.8],
        [200, 1],
      ]),
    );
    signals.push(
      `${e.vendor_count.toLocaleString("en-US")} reported vendors / spaces`,
    );
  }
  if (values.length) {
    if (e.expected_size) signals.push(e.expected_size);
    return real(
      values.reduce((a, b) => a + b) / values.length,
      signals,
      "Mean of available attendance and vendor scales.",
    );
  }
  if (e.venue && hall.test(e.venue))
    return estimated(0.72, [e.venue], "Large hall (estimated scale).");
  if (e.size_tier && Object.hasOwn(sizes, e.size_tier))
    return estimated(
      sizes[e.size_tier],
      [`Show size ${e.size_tier} (estimated)`],
      "Estimated show size used as a proxy.",
    );
  return missing("No count, recognized hall or size tier.");
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function track(e: Event, year: number): Evidence {
  const history = e.previous_editions ?? "";
  const ordinal = /\b(\d+)(?:st|nd|rd|th)\s+(?:edition|fair|show)\b/i.exec(
    history + " " + e.name,
  );
  const first = /^(?:at least\s+)?((?:19|20)\d{2})\b/i.exec(e.first_year ?? "");
  const prior = count(e.previous_editions_count)
    ? e.previous_editions_count
    : ordinal
      ? Math.max(0, +ordinal[1] - 1)
      : null;
  const years = first && year >= +first[1] ? year - +first[1] : null;
  if (prior !== null || years !== null) {
    const signals = [];
    if (prior !== null) signals.push(`${prior} previous editions`);
    if (years !== null) signals.push(`First year: ${e.first_year}`);
    return real(
      0.18 +
        0.82 *
          Math.min(
            1,
            Math.log1p(Math.max(prior ?? 0, years ?? 0)) / Math.log(11),
          ),
      signals,
      "Edition count or documented years running.",
    );
  }
  if (
    /\b(first edition|inaugural|debut)\b/i.test(e.name) ||
    /^(?:first edition|inaugural edition|debut)[.! ]*$/i.test(history)
  )
    return real(0.18, [history || e.name], "First edition.");
  if (
    /\b(pokemon|bandai|bushiroad|konami|wizards|oracle events|disney|ravensburger|riot)\b/.test(
      fold(e.organizer ?? ""),
    )
  )
    return estimated(
      0.75,
      [`Organizer: ${e.organizer} (estimated track record)`],
      "Publisher or official organizer proxy.",
    );
  if (
    /\b(series|annual|recurring|circuit|seasonal)\b/i.test(history) ||
    e.section === "recurring_sg"
  )
    return estimated(
      0.55,
      [history || "Listed as a recurring Singapore show"],
      "Recurring series (estimated track record).",
    );
  return missing("No established edition history.");
}

function boothStatus(e: Event) {
  const text = e.vendor_booths ?? "";
  if (/^(?:no\b|applications closed)/i.test(text)) return -1;
  if (/^yes\b|commercial booths by enquiry/i.test(text)) return 1;
  return 0;
}
const games = [
  /pokemon/,
  /one piece/,
  /\bmtg\b|magic:?[ ]+the gathering/,
  /yu[ -]?gi[ -]?oh/,
  /lorcana/,
  /digimon/,
  /union arena/,
  /wei(?:ss|ß)/,
  /vanguard/,
  /shadowverse/,
  /gundam/,
  /dragon ball|dbs fusion/,
];
function tcgFit(e: Event): Evidence {
  const type = fold(e.event_type);
  const base = type.startsWith("card show")
    ? 1
    : (
        {
          "official play": 0.7,
          "pop-culture con": 0.55,
          "trade fair": 0.4,
        } as Record<string, number>
      )[type];
  const featured = e.games.filter((g) => games.some((rx) => rx.test(fold(g))));
  const n = games.filter((rx) => rx.test(fold(featured.join(" ")))).length;
  const named = /card show|trading card/i.test(e.name);
  const booth = boothStatus(e);
  const signals = [
    e.event_type,
    ...featured,
    named ? e.name : "",
    booth ? e.vendor_booths : "",
  ].filter((s): s is string => !!s);
  const value =
    (finite(base) ? base : 0.4) +
    Math.min(0.16, n * 0.04) +
    (named ? 0.08 : 0) +
    (booth < 0 ? -0.55 : booth * 0.04);
  if (finite(base))
    return real(
      value,
      signals,
      "Format adjusted for featured games, name and vendor access.",
    );
  if (!signals.length)
    return missing("No format, games or vendor information.");
  return estimated(
    value,
    signals,
    "Unknown format, estimated from a neutral 0.4 baseline.",
  );
}

const countries: Record<string, string> = {
  singapore: "SG",
  malaysia: "MY",
  "hong kong": "HK",
  indonesia: "ID",
  thailand: "TH",
  vietnam: "VN",
  philippines: "PH",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  qatar: "QA",
  kuwait: "KW",
  bahrain: "BH",
};
function country(e: Event) {
  return (
    e.country_code?.trim().toUpperCase() ||
    (e.country?.trim() &&
      (countries[fold(e.country.trim())] ?? e.country.trim())) ||
    null
  );
}
const sea = ["TH", "ID", "VN", "PH"],
  gulf = ["AE", "SA", "QA", "KW", "BH"];
function market(e: Event): Evidence {
  const c = country(e);
  if (!c) return missing("Country unknown.");
  return real(
    ["SG", "HK"].includes(c)
      ? 1
      : c === "MY"
        ? 0.8
        : sea.includes(c) || gulf.includes(c)
          ? 0.5
          : 0.3,
    [e.country || c],
    "Country-based vendor market priority.",
  );
}

function commercial(e: Event, now: number): Evidence {
  const cost = applicableVendorPrice(e, now);
  const historical = !cost ? legacyVendorPrice(e) : null;
  const booth = boothStatus(e);
  const app =
    e.vendor_application &&
    !/^(?:no\b|not\b|unknown|tba|players?\b|check organizers|watch organizer)/i.test(
      e.vendor_application,
    );
  const signals: string[] = [];
  let value = 0.5;
  const priced = cost && count(e.visitors) && e.visitors > 0;
  if (cost) signals.push(cost.basis === "listed" ? cost.note :
    `${cost.option.name} · ${formatVendorAmount(cost.amount, cost.currency)} · ${formatVendorUsd(cost.usd)}`);
  if (historical?.status === "past_year") signals.push("Prior-edition rate on file");
  if (priced) {
    const perK = (cost.usd * 1000) / e.visitors!;
    value = 1 / (1 + perK / 45);
    signals.push(
      `Approx. USD ${perK.toFixed(2)} per 1,000 reported attendees / places`,
    );
  } else {
    if (e.size_tier && Object.hasOwn(sizes, e.size_tier)) {
      value += (sizes[e.size_tier] - 0.5) * 0.14;
      signals.push(`Show size ${e.size_tier} (estimated economics)`);
    }
    if (country(e)) {
      value += (market(e).value - 0.5) * 0.08;
      signals.push(`${country(e)} market (estimated economics)`);
    }
  }
  const ratio =
    count(e.visitors) && count(e.vendor_count) && e.vendor_count > 0
      ? e.visitors / e.vendor_count
      : null;
  if (ratio !== null) {
    value = 0.75 * value + (0.25 * ratio) / (ratio + 75);
    signals.push(`${ratio.toFixed(1)} reported attendees / places per vendor`);
  }
  if (booth && e.vendor_booths) signals.push(e.vendor_booths);
  if (app && booth >= 0) signals.push(e.vendor_application!);
  value += booth < 0 ? -0.35 : booth * 0.06 + (app ? 0.04 : 0);
  if (priced)
    return real(
      value,
      signals,
      "Applicable booth price relative to reported attendance, adjusted for vendor access.",
    );
  if (signals.length)
    return estimated(
      value,
      signals,
      historical?.status === "past_year"
        ? `Cost per attendee unavailable. Recorded price is from a prior edition${historical.quoteYear ? " (" + historical.quoteYear + ")" : ""}.`
        : "Cost per attendee unavailable. Estimated from a 0.5 baseline.",
    );
  return missing("No comparable pricing, market, size or booth information.");
}

const dayMs = 86_400_000;
function day(iso?: string | null) {
  if (!iso || !/^\d{4}-\d\d-\d\d$/.test(iso)) return null;
  const ms = Date.parse(iso);
  return finite(ms) && new Date(ms).toISOString().startsWith(iso)
    ? ms / dayMs
    : null;
}
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
function deadlineInClause(text: string) {
  // The export also contains booking opening dates, past-edition examples
  // and player lottery deadlines. Only interpret a vendor closing date.
  if (
    !text ||
    /artist[ -]alley|art(?:ist)? booths?|player|lottery|not published|\bopen(?:s|ed|ing)?\b|past edition/i.test(
      text,
    )
  )
    return null;
  const iso = /\b\d{4}-\d\d-\d\d\b/.exec(text);
  if (iso) return day(iso[0]);
  const d = /\b(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})\b/i.exec(text);
  if (!d) return null;
  const month = months.indexOf(d[2].toLowerCase()) + 1;
  return day(
    `${d[3]}-${String(month).padStart(2, "0")}-${d[1].padStart(2, "0")}`,
  );
}
function deadline(text: string | null) {
  // A single field can describe separate applicant categories, including an
  // expired Artist Alley and a still-open commercial exhibitor application.
  for (const clause of (text ?? "").split(/(?:[;.\n]|,|\band\b)\s*(?=(?:commercial|vendor|exhibitor|artist|player|lottery)|$)|[;.\n]/i)) {
    const date = deadlineInClause(clause);
    if (date !== null) return { date, clause: clause.trim() };
  }
  return null;
}
function logistics(e: Event, today: number | null, homeBase: HomeBase): Evidence {
  const travel = estimateTravel(e, homeBase);
  const certainty = { confirmed: 1, estimated: 0.6, tba: 0.25 }[e.date_status];
  const parts: { v: number; w: number; signal: string }[] = [];
  if (finite(certainty))
    parts.push({ v: certainty, w: 5, signal: `Date status: ${e.date_status}` });
  if (travel) {
    parts.push({
      v: travel.value,
      w: 3,
      signal: travel.signal,
    });
  }
  const due = deadline(e.vendor_deadline);
  if (due !== null && today !== null) {
    const days = due.date - today;
    const v =
      days < 0
        ? 0.1
        : days <= 3
          ? 0.3
          : days >= 14
            ? 1
            : 0.3 + (0.7 * (days - 3)) / 11;
    parts.push({
      v,
      w: 2,
      signal: `${due.clause} (${Math.abs(days)} days ${days < 0 ? "past" : "left"})`,
    });
  }
  const unavailableTravel = "Travel cannot be estimated because the event location is unknown.";
  if (!parts.length)
    return missing(`${unavailableTravel} Date certainty and application deadline are also unavailable.`);
  const value =
    parts.reduce((s, p) => s + p.v * p.w, 0) /
    parts.reduce((s, p) => s + p.w, 0);
  // Date certainty is the primary direct observation. Travel alone is a proxy.
  const basis =
    finite(certainty) || (due !== null && today !== null) ? real : estimated;
  return basis(
    value,
    parts.map((p) => p.signal),
    "Date certainty 50%, travel 30%, deadline 20%, redistributed across available inputs. " +
      (travel ? "Travel estimates use city and country bands." : unavailableTravel),
  );
}
function scanner(e: Event): Evidence {
  if (finite(e.vendor_score))
    return real(
      e.vendor_score / 100,
      [`Vendor fit rating ${e.vendor_score}/100`],
      "Recorded vendor fit rating.",
    );
  const p = e.shortlist_priority;
  if (p === 1 || p === 2 || p === 3)
    return estimated(
      [0.8, 0.55, 0.3][p - 1],
      [`Shortlist priority ${p} (estimated)`],
      "Estimated from shortlist priority.",
      0.8,
    );
  return missing("No fit score or shortlist priority.");
}

function baseScore(
  e: Event,
  weights: Weights,
  today: number | null,
  homeBase: HomeBase,
  now: number,
): ScoreResult {
  if (e.event_status === "cancelled") return {
    id: e.id, name: e.name, startDate: e.start_date ?? e.estimated_month,
    score: 0, computedScore: 0, tier: "cancelled", factors: [], clashes: [],
    confidence: "high", confidencePct: 100, overridden: false,
  };
  const year =
    Number((e.start_date || e.estimated_month || "").slice(0, 4)) ||
    (today === null ? 0 : new Date(today * dayMs).getUTCFullYear());
  const evidence = {
    scale: scale(e),
    track: track(e, year),
    tcg_fit: tcgFit(e),
    market: market(e),
    commercial: commercial(e, now),
    logistics: logistics(e, today, homeBase),
    scanner_score: scanner(e),
  };
  const factors = keys.map((key) => ({
    key,
    label: FACTOR_META[key].label,
    weight: weights[key],
    ...evidence[key],
    points: evidence[key].value * weights[key],
  }));
  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const evidencePct = factors.reduce(
    (s, f) => s + (f.basis === "real" ? f.weight : 0),
    0,
  );
  const postponed = e.event_status === "postponed";
  const confidencePct = postponed ? Math.round(evidencePct / 2) : evidencePct;
  return {
    ...(postponed && { postponed }),
    id: e.id,
    name: e.name,
    startDate: e.start_date ?? e.estimated_month,
    score,
    computedScore: score,
    tier: tierOf(score),
    confidence:
      confidencePct >= 65 ? "high" : confidencePct >= 40 ? "medium" : "low",
    confidencePct,
    factors,
    clashes: [],
    overridden: false,
  };
}
function finish(
  r: ScoreResult,
  overrides?: ScoreOptions["overrides"],
): ScoreResult {
  if (r.tier === "cancelled") return r;
  const override =
    overrides && Object.hasOwn(overrides, r.id) ? overrides[r.id] : undefined;
  const score = finite(override)
    ? Math.round(clamp(override, 100))
    : r.computedScore;
  return { ...r, score, tier: tierOf(score), overridden: finite(override) };
}
// Keep the library clock-free. Without a reference day, omit relative lead time.
function referenceDay(today: ScoreOptions["today"]) {
  if (today === undefined) return null;
  if (typeof today === "string") return day(today);
  return finite(today.getTime()) ? day(today.toISOString().slice(0, 10)) : null;
}
function pricingTime(options: ScoreOptions, today: number | null) {
  if (options.now !== undefined) return options.now;
  if (today === null) return Infinity;
  return options.today instanceof Date ? options.today.getTime() : today * dayMs;
}
export function scoreEvent(e: Event, options: ScoreOptions = {}): ScoreResult {
  const today = referenceDay(options.today);
  return finish(
    baseScore(
      e,
      normalizeWeights(options.weights),
      today,
      resolveHomeBase(options.homeBase),
      pricingTime(options, today),
    ),
    options.overrides,
  );
}
function confirmedRanges(e: Event) {
  if (e.date_status !== "confirmed" || e.event_status === "cancelled") return [];
  const ranges =
    e.section === "recurring_sg" && e.occurrences?.length ? e.occurrences : [e];
  return ranges
    .flatMap((r) => {
      const start = day(r.start_date),
        end = day(r.end_date ?? r.start_date);
      return start !== null && end !== null && end >= start
        ? [{ start, end, date: r.start_date! }]
        : [];
    })
    .sort((a, b) => a.start - b.start);
}
type Range = ReturnType<typeof confirmedRanges>[number];
function overlaps(a: Range, b: Range) {
  if (a.start <= b.end && b.start <= a.end) return true;
  const [early, late] = a.start < b.start ? [a, b] : [b, a];
  const weekday = new Date(early.end * dayMs).getUTCDay();
  return late.start === early.end + 1 && (weekday === 5 || weekday === 6);
}
const alphabetical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function compareByScore(
  a: Pick<ScoreResult, "score" | "startDate" | "name">,
  b: Pick<ScoreResult, "score" | "startDate" | "name">,
) {
  return (
    b.score - a.score ||
    alphabetical(a.startDate ?? "\uffff", b.startDate ?? "\uffff") ||
    alphabetical(a.name, b.name)
  );
}
/** Results retain input order. Compare integer formula scores before penalties or manual overrides. */
export function scoreEvents(
  events: readonly Event[],
  options: ScoreOptions = {},
): ScoreResult[] {
  const weights = normalizeWeights(options.weights),
    today = referenceDay(options.today);
  const homeBase = resolveHomeBase(options.homeBase);
  const now = pricingTime(options, today);
  const base = events.map((e) => baseScore(e, weights, today, homeBase, now));
  const ranges = events.map(confirmedRanges);
  return base.map((r, i) => {
    const clashes: ClashInfo[] = [];
    for (let j = 0; j < base.length; j++) {
      const other = base[j];
      if (other.score <= r.score || !ranges[i].length) continue;
      const match = ranges[j].find((b) =>
        ranges[i].some((a) => overlaps(a, b)),
      );
      if (match)
        clashes.push({
          id: other.id,
          name: other.name,
          score: other.score,
          startDate: match.date,
        });
    }
    if (!clashes.length) return finish(r, options.overrides);
    clashes.sort((a, b) => compareByScore(a, b) || alphabetical(a.id, b.id));
    const penalty = Math.min(4, clashes.length);
    // Signed adjustment outside the seven budgeted weights. value × weight = points.
    const line: FactorResult = {
      key: "clash",
      label: "Timing clash",
      weight: -penalty,
      value: 1,
      points: -penalty,
      basis: "real",
      signals: clashes.map(
        (c) => `${c.name} (${c.startDate}, base score ${c.score})`,
      ),
      note: "One point per higher-scoring confirmed clash, capped at four.",
    };
    return finish(
      {
        ...r,
        computedScore: Math.max(0, r.score - penalty),
        factors: [...r.factors, line],
        clashes,
      },
      options.overrides,
    );
  });
}
export function explainScore(r: ScoreResult): string {
  if (r.tier === "cancelled") return `${r.name}: 0/100 · Cancelled`;
  return [
    `${r.name}: ${r.score}/100 · ${TIER_LABELS[r.tier]}${r.overridden ? ` (manual override, computed ${r.computedScore})` : ""}`,
    `Confidence: ${r.confidence} (${r.confidencePct}% ${r.postponed ? "after postponement adjustment" : "of weight backed by real factors"}).`,
    ...r.factors.map(
      (f) =>
        `${f.label}: ${f.points.toFixed(1)} points (${f.weight}%, ${f.basis}). ${[...f.signals, f.note].join(". ")}`,
    ),
  ].join("\n");
}
