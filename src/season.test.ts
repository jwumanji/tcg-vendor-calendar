import { describe, expect, it } from "vitest";
import events from "../data/events.json";
import { normalizeEvents } from "./data";
import { SEASON_START, nextMonth, seasonEvents } from "./utils";
import type { Event } from "./model";

const base = normalizeEvents(events)[0];
const ev = (patch: Partial<Event>): Event => ({ ...base, occurrences: undefined, ...patch });

describe("seasonEvents (2027+ focus)", () => {
  it("hides events wholly before 2027 and keeps the rest", () => {
    const list = [
      ev({ id: "a", start_date: "2026-12-12", end_date: "2026-12-13", date_status: "confirmed", estimated_month: null }),
      ev({ id: "b", start_date: "2026-12-30", end_date: "2027-01-02", date_status: "confirmed", estimated_month: null }),
      ev({ id: "c", start_date: "2027-03-01", end_date: "2027-03-02", date_status: "confirmed", estimated_month: null }),
      ev({ id: "d", start_date: null, end_date: null, date_status: "estimated", estimated_month: "2026-11" }),
      ev({ id: "e", start_date: null, end_date: null, date_status: "estimated", estimated_month: "2027-06" }),
      ev({ id: "f", start_date: null, end_date: null, date_status: "tba", estimated_month: null }),
    ];
    expect(seasonEvents(list).map((e) => e.id)).toEqual(["b", "c", "e", "f"]);
  });
  it("keeps only 2027+ occurrences of recurring events and drops ones with none", () => {
    const rec = ev({
      id: "r",
      section: "recurring_sg",
      start_date: "2026-12-05",
      end_date: "2026-12-06",
      occurrences: [
        { start_date: "2026-12-05", end_date: "2026-12-06" },
        { start_date: "2027-01-09", end_date: "2027-01-10" },
      ],
    });
    const [kept] = seasonEvents([rec]);
    expect(kept.occurrences).toEqual([{ start_date: "2027-01-09", end_date: "2027-01-10" }]);
    expect(kept.start_date).toBe("2027-01-09");
    expect(rec.occurrences).toHaveLength(2); // input not mutated
    expect(seasonEvents([{ ...rec, occurrences: [rec.occurrences![0]] }])).toEqual([]);
  });
  it("can include earlier events and never changes ids", () => {
    const list = normalizeEvents(events);
    expect(seasonEvents(list, true)).toBe(list);
    const ids = new Set(list.map((e) => e.id));
    for (const e of seasonEvents(list)) expect(ids.has(e.id)).toBe(true);
  });
  it("the shipped data has no 2026 event in the default season and the calendar opens in 2027", () => {
    const visible = seasonEvents(normalizeEvents(events));
    for (const e of visible) {
      const last = e.end_date || e.start_date;
      if (last) expect(last >= SEASON_START).toBe(true);
      if (e.estimated_month) expect(e.estimated_month >= "2027-01").toBe(true);
    }
    expect(nextMonth(visible, "2026-11-18") >= "2027-01").toBe(true);
  });
});
