import { describe, it, expect } from "vitest";
import frozen from "../scanner/fixtures/scoring-calibration.json";
import { normalizeEvents } from "./data";
import raw from "../data/events.json";
import type { Event } from "./model";
import {
  DEFAULT_WEIGHTS,
  FACTOR_META,
  TIER_LABELS,
  TIER_THRESHOLDS,
  compareByScore,
  explainScore,
  normalizeWeights,
  parseBoothCost,
  scoreEvent,
  scoreEvents,
  scoreTone,
  tierOf,
  type FactorKey,
} from "./scoring";

const today = "2026-11-18";
const dataset = raw as Event[];
const calibration = normalizeEvents(frozen);
const empty: Event = {
  ...calibration[0],
  id: "test",
  name: "Example",
  games: [],
  event_type: "",
  section: "timeline",
  start_date: null,
  end_date: null,
  date_status: "tba",
  estimated_month: null,
  city: null,
  country: null,
  country_code: null,
  venue: null,
  organizer: null,
  expected_size: null,
  size_tier: null,
  visitors: null,
  vendor_count: null,
  previous_editions: null,
  previous_editions_count: null,
  first_year: null,
  vendor_booths: null,
  vendor_application: null,
  vendor_cost: null,
  vendor_deadline: null,
  vendor_score: null,
  shortlist_priority: null,
  priority_market: false,
  priority_market_level: null,
};
const factor = (key: FactorKey, fields: Partial<Event> = {}) =>
  scoreEvent({ ...empty, ...fields }, { today }).factors.find(
    (f) => f.key === key,
  )!;
const zero = Object.fromEntries(
  Object.keys(DEFAULT_WEIGHTS).map((k) => [k, 0]),
);
const scannerOnly = { ...zero, scanner_score: 100 };

describe("effective weights and confidence", () => {
  it("defaults invalid or absent fields, clamps and apportions integer percentages", () => {
    for (const input of [
      undefined,
      null,
      false,
      3,
      "x",
      [],
      zero,
      { track: NaN, market: Infinity, scale: "20" },
    ])
      expect(normalizeWeights(input)).toEqual(DEFAULT_WEIGHTS);
    expect(
      normalizeWeights({ ...zero, scale: 1e200, track: 99.8, tcg_fit: -10 }),
    ).toEqual({ ...zero, scale: 50, track: 50 });
    const weights = normalizeWeights({
      ...zero,
      scale: 1,
      track: 1,
      commercial: 1,
    });
    expect(weights).toEqual({ ...zero, scale: 34, track: 33, commercial: 33 });
    expect(normalizeWeights(weights)).toEqual(weights);
    expect(Object.keys(FACTOR_META)).toEqual(Object.keys(DEFAULT_WEIGHTS));
  });
  it.each([
    [39, "low"],
    [40, "medium"],
    [64, "medium"],
    [65, "high"],
    [100, "high"],
  ] as const)("%i percent real evidence is %s", (pct, confidence) => {
    const r = scoreEvent(
      { ...empty, vendor_score: 0 },
      { today, weights: { ...zero, scanner_score: pct, scale: 100 - pct } },
    );
    expect([r.confidencePct, r.confidence]).toEqual([pct, confidence]);
  });
});

describe("evidence and proxies", () => {
  it("uses a neutral missing value and describes missing inputs", () => {
    for (const key of [
      "scale",
      "track",
      "tcg_fit",
      "market",
      "commercial",
      "scanner_score",
    ] as const) {
      expect(factor(key)).toMatchObject({
        value: 0.4,
        basis: "missing",
        signals: [],
      });
      expect(factor(key).note).toBeTruthy();
    }
  });
  it("matches the attendance anchors, saturates and is monotone with a second signal", () => {
    for (const [visitors, value] of [
      [0, 0],
      [500, 0.2],
      [2000, 0.45],
      [10000, 0.8],
      [30000, 1],
      [100000, 1],
    ])
      expect(factor("scale", { visitors }).value).toBeCloseTo(value);
    for (const [vendor_count, value] of [
      [30, 0.4],
      [100, 0.8],
      [200, 1],
    ])
      expect(factor("scale", { vendor_count })).toMatchObject({
        basis: "real",
        value,
      });
    let prev = 0;
    for (const visitors of [
      0, 1, 250, 500, 1800, 2000, 8400, 12000, 30000, 60000,
    ]) {
      const { value } = factor("scale", { visitors, vendor_count: 100 });
      expect(value).toBeGreaterThanOrEqual(prev);
      expect(value).toBeCloseTo(
        (factor("scale", { visitors }).value + 0.8) / 2,
      );
      prev = value;
    }
    expect(
      factor("scale", {
        size_tier: "XL",
        visitors: 500,
        expected_size: "500 players (2025)",
      }).signals,
    ).toContain("500 players (2025)");
    for (const fields of [{ venue: "Suntec" }, { size_tier: "XL" }]) {
      const f = factor("scale", fields);
      expect(f.basis).toBe("estimated");
      expect(f.value).toBeLessThanOrEqual(0.75);
    }
  });
  it("distinguishes counted editions and years from organizer and series proxies", () => {
    expect(
      factor("track", { previous_editions_count: 0 }).value,
    ).toBeGreaterThan(0);
    const fifth = factor("track", { previous_editions_count: 4 });
    for (const fields of [
      { name: "5th edition" },
      { previous_editions: "5th edition in 2027" },
      { first_year: "2022" },
    ]) {
      expect(factor("track", fields)).toMatchObject({
        basis: "real",
        value: fifth.value,
      });
    }
    expect(
      factor("track", { previous_editions: "First edition" }).value,
    ).toBeLessThan(fifth.value);
    expect(
      factor("track", {
        first_year:
          "Not independently confirmed (implied by the 19th edition in 2026)",
      }).basis,
    ).toBe("missing");
    for (const fields of [
      { organizer: "The Pokémon Company" },
      { previous_editions: "Annual series" },
    ])
      expect(factor("track", fields).basis).toBe("estimated");
  });
  it("uses the event format and distinguishes card games and vendor access", () => {
    for (const [event_type, value] of [
      ["Card show", 1],
      ["Official play", 0.7],
      ["Trade fair", 0.4],
      ["Pop-culture con", 0.55],
    ] as const)
      expect(factor("tcg_fit", { event_type })).toMatchObject({
        value,
        basis: "real",
      });
    const fields = {
      event_type: "Official play",
      games: ["Pokémon", "One Piece"],
      name: "Trading card weekend",
    };
    expect(factor("tcg_fit", fields).value).toBeGreaterThan(0.7);
    expect(
      factor("tcg_fit", {
        ...fields,
        vendor_booths: "No public vendor program",
      }).value,
    ).toBeLessThan(0.4);
    expect(factor("tcg_fit", { event_type: "Other" })).toMatchObject({
      value: 0.4,
      basis: "estimated",
    });
  });
  it.each([
    ["HK", 1],
    ["SG", 1],
    ["MY", 0.8],
    ["TH", 0.5],
    ["PH", 0.5],
    ["AE", 0.5],
    ["QA", 0.5],
    ["US", 0.3],
  ] as const)("scores known market %s as real", (country_code, value) =>
    expect(factor("market", { country_code })).toMatchObject({
      basis: "real",
      value,
    }),
  );
  it("recognizes country names without codes and ignores priority flags on unknown locations", () => {
    expect(factor("market", { country: "Singapore" }).value).toBe(1);
    expect(factor("market", { priority_market_level: "top" }).basis).toBe(
      "missing",
    );
  });
  it("distinguishes scanner score, shortlist priority, and absent ratings", () => {
    expect(
      factor("scanner_score", { vendor_score: 0, shortlist_priority: 1 }),
    ).toMatchObject({ basis: "real", value: 0 });
    for (const [shortlist_priority, value] of [
      [1, 0.8],
      [2, 0.55],
      [3, 0.3],
    ])
      expect(factor("scanner_score", { shortlist_priority })).toMatchObject({
        basis: "estimated",
        value,
      });
  });
});

describe("booth economics", () => {
  const prices = calibration.flatMap((e) => (e.vendor_cost ? [e.vendor_cost] : []));
  it.each([
    ["HK$1,888 (Area", 1888, "HKD"],
    ["from S$450", 450, "SGD"],
    ["THB 4,800", 4800, "THB"],
    ["AED 1,750", 1750, "AED"],
    ["MYR 5,000", 5000, "MYR"],
    ["community reports about", 500, "SGD"],
    ["Standard SAR 3,500", 3500, "SAR"],
    ["CNY 45,800", 45800, "CNY"],
  ] as const)(
    "extracts an eligible base price from the snapshot with %s",
    (fragment, amount, currency) => {
      const input = prices.find((s) => s.includes(fragment));
      expect(input).toBeTruthy();
      expect(parseBoothCost(input)).toMatchObject({
        amount,
        currency,
        note: input,
      });
    },
  );
  it("converts fixed currency units, excluding years, extras, deposits and sponsorship", () => {
    expect(parseBoothCost("IDR 1,500,000")?.approxUsd).toBeCloseTo(94.5);
    expect(parseBoothCost("USD 250.50 per booth")?.approxUsd).toBe(250.5);
    for (const input of [
      null,
      "HK$ with a refundable table deposit",
      "2027 rate unavailable",
      "extra badges S$30 each",
      "Base rate not published; booth selection +S$100 per booth",
      "AED 300 deposit",
      prices.find((s) => s.includes("sponsorship packages")),
    ])
      expect(parseBoothCost(input)).toBeNull();
  });
  it("rewards cheaper booths, more shoppers per vendor, and access to booking", () => {
    const data = {
      vendor_cost: "S$350 for two days",
      visitors: 5000,
      vendor_count: 100,
    };
    const base = factor("commercial", data);
    expect(base.basis).toBe("real");
    for (const fields of [
      { vendor_cost: "S$250" },
      { vendor_count: 80 },
      { vendor_booths: "Yes" },
      { vendor_application: "Apply via organizer" },
    ])
      expect(
        factor("commercial", { ...data, ...fields }).value,
      ).toBeGreaterThan(base.value);
    expect(
      factor("commercial", {
        ...data,
        vendor_booths: "No public vendor program",
      }).value,
    ).toBeLessThan(base.value);
    for (const fields of [
      { vendor_cost: "S$350" },
      { size_tier: "XL", country_code: "SG" },
      { ...data, vendor_cost: "Unverified: S$100" },
    ]) {
      const f = factor("commercial", fields);
      expect(f.basis).toBe("estimated");
      expect(f.value).toBeLessThanOrEqual(0.75);
    }
  });
});

describe("logistics", () => {
  it("redistributes absent components and labels the travel estimate", () => {
    expect(factor("logistics", { date_status: "estimated" }).value).toBe(0.6);
    expect(factor("logistics").value).toBe(0.25);
    const f = factor("logistics", {
      date_status: "confirmed",
      country_code: "HK",
    });
    expect(f.value).toBeCloseTo((5 + 3 * 0.6) / 8);
    expect(f.signals.join(" ")).toContain("estimated");
    expect(
      factor("logistics", { city: "Hong Kong", date_status: "confirmed" })
        .value,
    ).toBeCloseTo(f.value);
    // Runtime fallbacks for a source that omitted required date_status.
    const date_status = undefined as unknown as Event["date_status"];
    expect(
      factor("logistics", { date_status, country_code: "SG" }),
    ).toMatchObject({ basis: "estimated", value: 0.75 });
    expect(factor("logistics", { date_status })).toMatchObject({
      basis: "missing",
      value: 0.4,
    });
  });
  it("accepts ISO and month-name closing dates, ignores player deadlines and opening dates", () => {
    const calc = (vendor_deadline: string) =>
      factor("logistics", {
        date_status: "confirmed",
        country_code: "SG",
        vendor_deadline,
      }).value;
    expect(calc("Closed 17 Nov 2026")).toBeCloseTo(0.82);
    expect(calc("2026-11-21")).toBeCloseTo(0.86);
    expect(calc("25 Nov 2026")).toBeGreaterThan(calc("21 Nov 2026"));
    expect(calc("2026-12-02")).toBe(1);
    for (const s of [
      "Player lottery registration closes 17 Nov 2026",
      "Booking opens 17 Nov 2026",
      "2026-02-31",
      "TBA",
    ])
      expect(calc(s)).toBe(1);
  });
});

const show = (
  id: string,
  vendor_score: number,
  start_date: string,
  end_date = start_date,
): Event => ({
  ...empty,
  id,
  name: id,
  vendor_score,
  start_date,
  end_date,
  date_status: "confirmed",
});
const options = { today, weights: scannerOnly };
describe("timing, overrides and presentation", () => {
  it("uses confirmed overlap and weekend adjacency, including later recurring occurrences", () => {
    const recurring = {
      ...show("series", 60, "2027-01-01"),
      section: "recurring_sg" as const,
      occurrences: [
        { start_date: "2027-01-01", end_date: "2027-01-01" },
        { start_date: "2027-01-09", end_date: "2027-01-10" },
      ],
    };
    const all = [
      show("Fri", 59, "2027-01-08"),
      recurring,
      show("Sun", 40, "2027-01-10"),
      show("Mon", 90, "2027-01-11"),
      {
        ...show("estimated", 99, "2027-01-09"),
        date_status: "estimated" as const,
      },
      { ...show("TBA", 99, "2027-01-09"), date_status: "tba" as const },
    ];
    const scores = scoreEvents(all, options);
    for (const index of [0, 2])
      expect(scores[index].clashes).toEqual([
        { id: "series", name: "series", score: 60, startDate: "2027-01-09" },
      ]);
    for (const index of [1, 3, 4, 5]) expect(scores[index].clashes).toEqual([]);
    expect(scores[0].score).toBe(58);
    expect(scoreEvent(all[0], options).computedScore).toBe(59);
    expect(scoreEvents([...all].reverse(), options).reverse()).toEqual(scores);
  });
  it("scores pairs once, exempts ties and caps the explicit penalty at four", () => {
    const all = [0, 1, 2, 3, 4, 5, 5].map((n, i) =>
      show(String(i), 50 + n, "2027-01-09", "2027-01-10"),
    );
    const scores = scoreEvents(all, options);
    expect(scores[0].clashes).toHaveLength(6);
    expect(scores[0].score).toBe(46);
    expect(scores[0].factors.at(-1)).toMatchObject({
      key: "clash",
      points: -4,
    });
    expect(scores.slice(-2).map((r) => r.score)).toEqual([55, 55]);
  });
  it("applies manual overrides after clashes and tiers the final score", () => {
    const a = show("a", 71, "2027-01-09"),
      b = show("b", 80, "2027-01-09");
    const [first, second] = scoreEvents([a, b], {
      ...options,
      overrides: { a: 100, b: 0 },
    });
    expect(first).toMatchObject({
      score: 100,
      tier: "must",
      computedScore: 70,
      overridden: true,
    });
    expect(second).toMatchObject({
      score: 0,
      tier: "skip",
      computedScore: 80,
      overridden: true,
      clashes: [],
    });
    expect(explainScore(first)).toMatch(/manual override, computed 70/);
    expect(explainScore(first)).toContain("Timing clash: -1.0");
    expect(
      scoreEvent(a, { ...options, overrides: { a: NaN } }).overridden,
    ).toBe(false);
  });
  it("covers tier boundaries and sorts tied scores by date then name with undated shows last", () => {
    for (const [tier, next] of [
      ["must", "strong"],
      ["strong", "maybe"],
      ["maybe", "skip"],
    ] as const) {
      expect(scoreTone(TIER_THRESHOLDS[tier])).toBe(tier);
      expect(tierOf(TIER_THRESHOLDS[tier] - 1)).toBe(next);
    }
    expect(TIER_LABELS).toEqual({
      must: "Must-do",
      strong: "Strong",
      maybe: "Maybe",
      skip: "Skip",
      cancelled: "Cancelled",
    });
    const a = { name: "A", score: 60, startDate: "2027-03-05" };
    const b = { ...a, name: "B" };
    const c = { ...a, startDate: null };
    const d = { ...a, startDate: "2027-01-01" };
    expect([c, b, a, d].sort(compareByScore)).toEqual([d, a, b, c]);
  });
});

it("scores the entire snapshot consistently, including past events", () => {
  const before = JSON.stringify(dataset);
  const scores = scoreEvents(dataset, { today });
  const sorted = [...scores].sort(compareByScore);
  expect(sorted).toEqual(scoreEvents(dataset, { today }).sort(compareByScore));
  expect(JSON.stringify(dataset)).toBe(before);
  expect(sorted).toHaveLength(dataset.length);
  for (const r of sorted) {
    expect(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100).toBe(
      true,
    );
    expect(r.score).toBe(r.computedScore);
    expect(r.score).toBe(
      Math.max(0, Math.round(r.factors.reduce((s, f) => s + f.points, 0))),
    );
    expect(
      r.factors
        .filter((f) => f.key !== "clash")
        .reduce((s, f) => s + f.weight, 0),
    ).toBe(100);
    for (const f of r.factors) {
      expect(f.value).toBeGreaterThanOrEqual(0);
      expect(f.value).toBeLessThanOrEqual(1);
      expect(f.points).toBeCloseTo(f.value * f.weight);
      if (f.basis === "estimated")
        expect(f.value).toBeLessThanOrEqual(
          f.key === "scanner_score" ? 0.8 : 0.75,
        );
    }
  }
  expect(scoreEvents([show("past", 81, "2026-10-01")], options)[0].score).toBe(
    81,
  );
});

it("preserves tier calibration on the frozen November export", () => {
  const scores = scoreEvents(calibration, { today });
  for (const [tier, min, max] of [
    ["must", 0.08, 0.17],
    ["strong", 0.23, 0.32],
    ["maybe", 0.3, 0.4],
    ["skip", 0.16, 0.28],
  ] as const) {
    const share = scores.filter((r) => r.tier === tier).length / scores.length;
    expect(share).toBeGreaterThan(min);
    expect(share).toBeLessThan(max);
  }
});

it("marks the Dubai prior-edition quote as estimated and retains the quoted year", () => {
  const dubai = calibration.find((e) => e.name.includes("GameExpo"))!;
  const current = { ...dubai, vendor_cost: "2027 rate: AED 1,750" };
  expect(factor("commercial", dubai)).toMatchObject({ basis: "estimated", note: expect.stringContaining("2026") });
  expect(factor("commercial", current).basis).toBe("real");
  expect(scoreEvent(current, { today }).confidencePct - scoreEvent(dubai, { today }).confidencePct)
    .toBe(DEFAULT_WEIGHTS.commercial);
});

it("applies only the commercial category's deadline", () => {
  const color = calibration.find((e) => e.name.includes("Color Fiesta"))!;
  const score = (vendor_deadline: string | null) => factor("logistics", { ...color, vendor_deadline });
  expect(score(color.vendor_deadline)).toEqual(score(null));
  for (const separator of ["; ", ", ", " and "]) {
    const due = "Commercial booths close 21 Nov 2026";
    expect(score("Artist Alley closed 23 Oct 2026" + separator + due)).toEqual(score(due));
  }
});

it("keeps all scores finite with extreme or fractional counts", () => {
  const result = scoreEvent({ ...empty, visitors: Number.MAX_VALUE, vendor_count: Number.MIN_VALUE, vendor_cost: "S$350" }, { today });
  expect(Number.isInteger(result.score)).toBe(true);
  expect(result.factors.every((f) => Number.isFinite(f.points))).toBe(true);
});

it("assigns zero to cancelled events despite overrides and removes them from both sides of a clash", () => {
  const high = { ...calibration[0], id: "high", date_status: "confirmed" as const, start_date: "2027-01-02", end_date: "2027-01-02" };
  const low = { ...empty, id: "low", start_date: high.start_date, end_date: high.end_date, date_status: high.date_status };
  expect(scoreEvents([high, low])[1].clashes).toHaveLength(1);
  for (const id of ["high", "low"]) {
    const list = [high, low].map((e) => e.id === id ? { ...e, event_status: "cancelled" as const } : e);
    const results = scoreEvents(list, { overrides: { [id]: 99 } });
    expect(results.every((r) => !r.clashes.length)).toBe(true);
    expect(results.find((r) => r.id === id)).toMatchObject({ score: 0, computedScore: 0, tier: "cancelled", overridden: false });
    expect(scoreEvent(list.find((e) => e.id === id)!, { overrides: { [id]: 99 } }).score).toBe(0);
  }
  expect(scoreEvent({ ...high, event_status: "postponed" }).confidencePct).toBeLessThan(scoreEvent(high).confidencePct);
});
