import { describe, expect, it } from "vitest";
import fixtures from "../tests/fixtures/new-finds.json";
import { normalizeEvents } from "./data";
import {
  defaultRowSort,
  groupSortedRows,
  loadSort,
  SORT_STORAGE_KEY,
  ROW_SORT_LABELS,
  groupRowsByMonth,
  groupRowsByCountry,
  normalizeColumns,
  nextRowSort,
  normalizeListView,
  normalizeRowSort,
  rowDateLabel,
  sortRows,
  selectRange,
  selectAllVisible,
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
  size_tier: ["XL", "M", null][i],
}));
const entries = {
  a: {
    ...emptyEntry,
    stage: "Paid / attending" as const,
    going: true,
    note: "Ask about booth",
  },
  b: { ...emptyEntry, stage: "Interested" as const, note: "  " },
};
const scores = { a: { score: 0 }, b: { score: 95 }, c: { score: 83 } };
const events = [a, b, c];
describe("row ordering", () => {
  it.each<[RowKey, string, string]>([
    ["going", "bca", "abc"],
    ["name", "bca", "abc"],
    ["dates", "abc", "bac"],
    ["city", "bca", "acb"],
    ["status", "abc", "cba"],
    ["priority", "acb", "bca"],
    ["scanner", "bac", "abc"],
    ["size", "bac", "abc"],
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
    const tentative = {
      ...c,
      date_status: "estimated" as const,
      estimated_month: "2027-02",
    };
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
  it("defaults to rows and validates the shared sort preference", () => {
    for (const value of [null, {}, "other"])
      expect(normalizeListView(value)).toBe("rows");
    expect(normalizeListView("grid")).toBe("grid");
    expect(nextRowSort(defaultRowSort, "going").direction).toBe("desc");
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
    expect(nextRowSort(defaultRowSort, "priority").direction).toBe("desc");
    expect(nextRowSort(defaultRowSort, "scanner").direction).toBe("desc");
    expect(nextRowSort(defaultRowSort, "name").direction).toBe("asc");
  });
});

it("selects visible IDs and toggles ranges in the current sort order", () => {
  const ids = ["d", "c", "a", "b"];
  expect([...selectAllVisible(ids, true)]).toEqual(ids);
  expect(selectAllVisible(ids, false).size).toBe(0);
  const first = selectRange(ids, new Set(["hidden"]), "c", null);
  expect([...first]).toEqual(["c"]);
  const range = selectRange(ids, first, "b", "c");
  expect([...range]).toEqual(["c", "a", "b"]);
  expect([...selectRange(ids, range, "c", "b")]).toEqual([]);
  expect([...selectRange(ids, first, "b", "hidden")]).toEqual(["c", "b"]);
});

it("groups recurring and estimated dates by displayed month and always puts undated events last", () => {
  const recurring = {
    ...a,
    occurrences: [
      { start_date: "2025-12-30", end_date: "2025-12-31" },
      { start_date: "2027-03-31", end_date: "2027-04-02" },
    ],
  };
  const tba = { ...c, estimated_month: "2027-01" };
  const noMonth = { ...b, estimated_month: null };
  const list = [noMonth, tba, recurring, b, a, c];
  for (const direction of ["asc", "desc"] as const) {
    const sorted = sortRows(list, { key: "dates", direction }, entries, scores, today);
    const groups = groupRowsByMonth(sorted, today);
    expect([...groups]).toEqual(direction === "asc" ? [
      ["2027-01", [a, tba]],
      ["2027-03", [recurring, b]],
      ["tba", [noMonth, c]],
    ] : [
      ["2027-03", [b, recurring]],
      ["2027-01", [tba, a]],
      ["tba", [noMonth, c]],
    ]);
    expect([...groups.values()].flat()).toEqual(sorted);
  }
  expect(groupRowsByMonth([], today).size).toBe(0);
});

it("restores only recognized optional columns, once and in display order", () => {
  expect(normalizeColumns(null)).toEqual([]);
  expect(normalizeColumns(["notes", "unexpected", "scanner", "notes"])).toEqual(
    ["scanner", "notes"],
  );
});

describe("country sort", () => {
  const mk = (id: string, country: string | null, date: string, name = id) => ({
    ...a,
    id,
    name,
    country,
    country_code: country ? country.slice(0, 2).toUpperCase() : null,
    date_status: "confirmed" as const,
    start_date: date,
    end_date: date,
  });
  const list = [
    mk("sg2", "Singapore", "2027-05-01"),
    mk("hk", "Hong Kong", "2027-09-01"),
    mk("sg1", "Singapore", "2027-02-01"),
    mk("sg1b", "Singapore", "2027-02-01"),
    mk("my", "Malaysia", "2027-01-10"),
    mk("none", null, "2027-01-01"),
  ];
  const sc = { sg1: { score: 40 }, sg1b: { score: 90 } } as never;
  it("orders alphabetically by country, then date, then priority", () => {
    const ids = sortRows(list, { key: "country", direction: "asc" }, {}, sc, today).map((e) => e.id);
    expect(ids.slice(0, 5)).toEqual(["hk", "my", "sg1b", "sg1", "sg2"]);
  });
  it("reverses the country order but keeps date order inside a country", () => {
    const ids = sortRows(list, { key: "country", direction: "desc" }, {}, sc, today).map((e) => e.id);
    expect(ids.indexOf("sg2")).toBeLessThan(ids.indexOf("my"));
    expect(ids.indexOf("sg1b")).toBeLessThan(ids.indexOf("sg2"));
  });
  it("groups by country and accepts the key as a saved sort", () => {
    const sorted = sortRows(list, { key: "country", direction: "asc" }, {}, sc, today);
    expect([...groupRowsByCountry(sorted).keys()]).toEqual(["Hong Kong", "Malaysia", "Singapore", "Unknown"]);
    expect(normalizeRowSort({ key: "country", direction: "asc" })).toEqual({ key: "country", direction: "asc" });
  });
  it("keeps country groups contiguous and treats empty countries as missing", () => {
    const mixed = [
      mk("lower", "singapore", "2027-04-01"),
      mk("early", "Singapore", "2027-01-01"),
      mk("late", "Singapore", "2027-05-01"),
      mk("empty", "", "2027-01-01"),
      mk("missing", null, "2027-02-01"),
    ];
    for (const direction of ["asc", "desc"] as const) {
      const sorted = sortRows(mixed, { key: "country", direction }, {}, {}, today);
      const groups = groupRowsByCountry(sorted);
      expect([...groups.values()].flat()).toEqual(sorted);
      expect([...groups.keys()].at(-1)).toBe("Unknown");
      expect(groups.get("Unknown")?.map((e) => e.id)).toEqual(["empty", "missing"]);
    }
  });
});

it.each(Object.keys(ROW_SORT_LABELS) as RowKey[])("preserves grid order in row groups for %s", (key) => {
  const filtered = events.filter((event) => event.vendor_score !== 0);
  for (const direction of ["asc", "desc"] as const) {
    const grid = sortRows(filtered, { key, direction }, entries, scores, today);
    const rows = [...groupSortedRows(grid, key, today).values()].flat();
    expect(rows.map((e) => e.id)).toEqual(grid.map((e) => e.id));
  }
});

it("discards legacy sorts, preserves the layout and reads only valid v2 preferences", () => {
  const data = new Map([
    ["tcg-rows-sort", '{"key":"priority","direction":"desc"}'],
    ["tcg-sort-v1", '"name"'],
    ["tcg-list-view", '"grid"'],
  ]);
  const storage = { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => data.delete(k) };
  expect(loadSort(storage)).toEqual({ key: "dates", direction: "asc" });
  expect([...data.keys()]).toEqual(["tcg-list-view"]);
  for (const invalid of ["broken JSON", '{"key":"size","direction":"up"}', '"score"']) {
    data.set(SORT_STORAGE_KEY, invalid);
    expect(loadSort(storage)).toEqual({ key: "dates", direction: "asc" });
  }
  data.set(SORT_STORAGE_KEY, '{"key":"size","direction":"desc"}');
  expect(loadSort(storage)).toEqual({ key: "size", direction: "desc" });
});
