import { describe, expect, it } from "vitest";
import fixtures from "../tests/fixtures/new-finds.json";
import { normalizeEvents } from "./data";
import {
  defaultRowSort,
  nextRowSort,
  normalizeListView,
  normalizeRowSort,
  rowDateLabel,
  sortRows,
  type RowKey,
} from "./rows";
import { emptyEntry } from "./storage";

const today = "2026-11-18";
const finds = normalizeEvents(fixtures);
const [a, b, c] = finds.map((e, i) => ({
  ...e,
  id: ["a", "b", "c"][i],
  name: ["Édition 12", "edition 2", "Edition 2"][i],
  vendor_score: [80, 0, null][i],
}));
const entries = {
  a: {
    ...emptyEntry,
    stage: "Paid / attending" as const,
    note: "Ask about booth",
  },
  b: { ...emptyEntry, stage: "Interested" as const, note: "  " },
};
const scores = { a: { score: 0 }, b: { score: 95 }, c: { score: 83 } };
const events = [a, b, c];
describe("row ordering", () => {
  it.each<[RowKey, string, string]>([
    ["name", "bca", "abc"],
    ["dates", "abc", "bac"],
    ["city", "bca", "acb"],
    ["status", "abc", "cba"],
    ["priority", "acb", "bca"],
    ["scanner", "bac", "abc"],
    ["stage", "cba", "abc"],
    ["notes", "bca", "abc"],
    ["source", "abc", "cba"],
  ])(
    "sorts %s in both directions with stable ties and missing values last",
    (key, asc, desc) => {
      for (const direction of ["asc", "desc"] as const)
        expect(
          sortRows(events, { key, direction }, entries, scores, today)
            .map((e) => e.id)
            .join(""),
        ).toBe(direction === "asc" ? asc : desc);
      expect(events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    },
  );
  it("uses the next recurrence, month estimates and country as a city tiebreak", () => {
    const recurring = {
      ...a,
      occurrences: [
        { start_date: "2025-06-01", end_date: "2025-06-01" },
        { start_date: "2027-04-02", end_date: "2027-04-04" },
      ],
    };
    const tentative = { ...c, estimated_month: "2027-02" };
    expect(
      sortRows(
        [recurring, b, tentative],
        { key: "dates", direction: "asc" },
        entries,
        scores,
        today,
      ),
    ).toEqual([tentative, b, recurring]);
    expect(rowDateLabel(recurring, today)).toBe("2–4 Apr 2027");
    expect(rowDateLabel(tentative, today)).toBe("Est. Feb 2027");
    expect(rowDateLabel(c, today)).toBe("TBA");
    const missing = { ...c, city: null, country: null };
    const sameCity = { ...a, country: "Australia" };
    for (const direction of ["asc", "desc"] as const)
      expect(
        sortRows(
          [missing, a, sameCity],
          { key: "city", direction },
          entries,
          scores,
          today,
        ),
      ).toEqual(
        direction === "asc" ? [sameCity, a, missing] : [a, sameCity, missing],
      );
  });
});
describe("saved row preferences", () => {
  it("defaults to grid with independent highest-priority row ordering", () => {
    for (const value of [null, {}, "other", "grid"])
      expect(normalizeListView(value)).toBe("grid");
    expect(normalizeListView("rows")).toBe("rows");
    for (const value of [
      null,
      [],
      { key: "__proto__", direction: "asc" },
      { key: "name", direction: "up" },
    ])
      expect(normalizeRowSort(value)).toEqual(defaultRowSort);
    expect(normalizeRowSort({ key: "scanner", direction: "asc" })).toEqual({
      key: "scanner",
      direction: "asc",
    });
    expect(nextRowSort(defaultRowSort, "priority").direction).toBe("asc");
    expect(nextRowSort(defaultRowSort, "scanner").direction).toBe("desc");
    expect(nextRowSort(defaultRowSort, "name").direction).toBe("asc");
  });
});
