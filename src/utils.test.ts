import { describe, it, expect } from "vitest";
import raw from "../data/events.json";
import type { Event } from "./model";
import { emptyFilters } from "./model";
import {
  ics,
  csv,
  foldLine,
  matches,
  games,
  deadlineDate,
  monthEnd,
  ranges,
} from "./utils";
const event = raw[0] as Event;
describe("all-day calendar exports", () => {
  it("uses exclusive end dates and escapes user-facing text", () => {
    const result = ics([
      {
        ...event,
        name: "Cards, friends; games\\fun\nWelcome",
        start_date: "2027-12-31",
        end_date: "2027-12-31",
      },
    ]);
    expect(result).toContain("DTEND;VALUE=DATE:20280101");
    expect(result).toContain(
      "SUMMARY:Cards\\, friends\\; games\\\\fun\\nWelcome",
    );
    expect(result.endsWith("\r\n")).toBe(true);
  });
  it("exports every occurrence with unique IDs, never estimates", () => {
    const recurring = raw.find((e) => e.section === "recurring_sg") as Event;
    const result = ics([
      recurring,
      { ...event, date_status: "estimated", start_date: null, end_date: null },
    ]);
    expect(result.match(/BEGIN:VEVENT/g)?.length).toBe(
      ranges(recurring).length,
    );
    expect(new Set(result.match(/UID:.*/g)).size).toBe(
      ranges(recurring).length,
    );
  });
  it("folds by UTF-8 octets without splitting Unicode", () => {
    const s = "SUMMARY:" + "🎴Pokémon".repeat(25);
    const folded = foldLine(s);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(s);
  });
});
describe("filter semantics", () => {
  it("matches overlapping ranges and later recurring occurrences", () => {
    const e = {
      ...event,
      occurrences: [
        { start_date: "2027-01-01", end_date: "2027-01-03" },
        { start_date: "2027-06-01", end_date: "2027-06-02" },
      ],
    };
    expect(
      matches(e, { ...emptyFilters, from: "2027-06-02", to: "2027-06-02" }, {}),
    ).toBe(true);
  });
  it("uses the whole estimated month and handles TBA separately", () => {
    const e = {
      ...event,
      date_status: "estimated" as const,
      start_date: null,
      end_date: null,
      estimated_month: "2027-02",
    };
    expect(
      matches(e, { ...emptyFilters, from: "2027-02-28", to: "2027-03-01" }, {}),
    ).toBe(true);
    expect(
      matches(
        { ...e, date_status: "tba" },
        { ...emptyFilters, tba: false },
        {},
      ),
    ).toBe(false);
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });
  it("combines game, country, score and planning criteria", () => {
    expect(games(event)).toContain("MTG");
    const f = {
      ...emptyFilters,
      games: ["MTG"],
      countries: ["Thailand"],
      stages: ["Contacted" as const],
      score: 10,
    };
    expect(matches(event, f, { [event.id]: { stage: "Contacted", note: "", noteUpdatedAt: null, stageUpdatedAt: null } })).toBe(true);
    expect(matches(event, { ...f, score: 99 }, { [event.id]: { stage: "Contacted", note: "", noteUpdatedAt: null, stageUpdatedAt: null } })).toBe(
      false,
    );
  });
});
describe("deadline notices", () => {
  it("only recognizes full dates and preserves unavailable dates", () => {
    expect(deadlineDate("closes 27 Dec 2026, 23:30")).toBe("2026-12-27");
    expect(deadlineDate("due 2027-01-04")).toBe("2027-01-04");
    expect(deadlineDate("Not published for 2027")).toBe(null);
    expect(deadlineDate("2026: 16 Oct")).toBe(null);
  });
});

describe("pipeline CSV export", () => {
  it("includes default stages and safely quotes multiline notes", () => {
    const note = 'Quoted "USD 250"\nFollow up';
    const result = csv([event], { [event.id]: { stage: 'Too expensive', note, noteUpdatedAt: null, stageUpdatedAt: null } });
    expect(result).toContain('"Pipeline stage","Notes"');
    expect(result).toContain('"Too expensive","Quoted ""USD 250""\nFollow up"');
    expect(csv([event])).toContain('"New",""');
  });
});
