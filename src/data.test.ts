import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import raw from "../data/events.json";
import meta from "../data/meta.json";
import { normalizeEvents, validDate } from "./data";
import { normalizeFilters } from "./hooks/useFilters";
import { emptyFilters } from "./model";

describe("source data integrity", () => {
  it("has a valid source snapshot date and unique nonempty identities", () => {
    expect(validDate(meta.updatedAt)).toBe(true);
    expect(new Set(raw.map((e) => e.id)).size).toBe(raw.length);
    expect(raw.every((e) => e.id.trim() && e.name.trim())).toBe(true);
  });
  it.each(raw.map((e) => [e.id, e] as const))(
    "%s satisfies dates, sections, assets and URLs",
    (_id, e) => {
      expect(["timeline", "recurring_sg", "watchlist"]).toContain(e.section);
      expect(["confirmed", "estimated", "tba"]).toContain(e.date_status);
      expect(Array.isArray(e.games)).toBe(true);
      expect(Array.isArray(e.source_urls)).toBe(true);
      for (const value of [e.start_date, e.end_date])
        if (value !== null) expect(validDate(value)).toBe(true);
      if (e.start_date && e.end_date)
        expect(e.end_date >= e.start_date).toBe(true);
      if (e.date_status === "confirmed") {
        expect(validDate(e.start_date)).toBe(true);
        expect(validDate(e.end_date)).toBe(true);
      } else {
        expect(e.start_date).toBeNull();
        expect(e.end_date).toBeNull();
      }
      if (e.date_status === "estimated")
        expect(e.estimated_month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      else expect(e.estimated_month).toBeNull();
      if (e.section === "watchlist") expect(e.date_status).toBe("tba");
      if (e.section === "recurring_sg") {
        expect(e.date_status).toBe("confirmed");
        expect(e.country_code).toBe("SG");
        expect("occurrences" in e && e.occurrences?.length).toBeTruthy();
      }
      if ("occurrences" in e)
        for (const r of e.occurrences || []) {
          expect(validDate(r.start_date) && validDate(r.end_date)).toBe(true);
          expect(r.end_date >= r.start_date).toBe(true);
        }
      if (e.logo) {
        expect(e.logo).toMatch(/^logos\/[\w.-]+$/);
        expect(existsSync("public/" + e.logo)).toBe(true);
      }
      for (const url of [e.website, e.instagram, ...e.source_urls].filter(
        Boolean,
      ))
        expect(["http:", "https:"]).toContain(new URL(url!).protocol);
    },
  );
  it("normalizes missing arrays and invalid date fields at runtime", () => {
    const e = normalizeEvents([
      {
        ...raw[0],
        games: null,
        source_urls: null,
        start_date: "2027-02-30",
        end_date: "bad",
        estimated_month: "2027-13",
      },
    ])[0];
    expect(e.games).toEqual([]);
    expect(e.source_urls).toEqual([]);
    expect(e.start_date).toBeNull();
    expect(e.end_date).toBeNull();
    expect(e.estimated_month).toBeNull();
  });
});
describe("stored filters", () => {
  it.each([
    null,
    [],
    "bad",
    {
      countries: 42,
      games: "MTG",
      stages: {},
      score: "80",
      priority: true,
      tba: 1,
    },
  ])("ignores corrupt fields %j", (value) =>
    expect(normalizeFilters(value)).toEqual(emptyFilters),
  );
  it("salvages stable fields while dropping session search and date ranges", () => {
    expect(
      normalizeFilters({
        countries: ["Singapore", null, "Singapore"],
        stages: ["Pass", "invalid"],
        score: 200,
        from: "2027-01-01",
        search: "hidden",
        priority: "top",
      }),
    ).toEqual({
      ...emptyFilters,
      countries: ["Singapore"],
      stages: ["Pass"],
      score: 100,
      priority: "top",
    });
  });
});
