import { emptyEntry } from "./storage";
import { describe, it, expect } from "vitest";
import raw from "../data/events.json";
import type { Event } from "./model";
import { emptyFilters } from "./model";
import {
  compareText,
  dateSortKey,
  nextMonth,
  localDate,
  prettyDate,
  upcoming,
  timelineGroups,
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
    expect(
      matches(event, f, {
        [event.id]: {
          stage: "Contacted",
          note: "",
          noteUpdatedAt: null,
          stageUpdatedAt: null,
        },
      }),
    ).toBe(true);
    expect(
      matches(
        event,
        { ...f, score: 99 },
        {
          [event.id]: {
            stage: "Contacted",
            note: "",
            noteUpdatedAt: null,
            stageUpdatedAt: null,
          },
        },
      ),
    ).toBe(false);
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
    const result = csv([event], {
      [event.id]: {
        stage: "Too expensive",
        note,
        noteUpdatedAt: null,
        stageUpdatedAt: null,
      },
    });
    expect(result).toContain('"Pipeline stage","Notes"');
    expect(result).toContain('"Too expensive","Quoted ""USD 250""\nFollow up"');
    expect(csv([event])).toContain('"New",""');
  });
});

describe("audit regressions", () => {
  it.each([
    '=HYPERLINK("http://evil","x")',
    "+SUM(1,2)",
    "-42",
    "@SUM(A1)",
    "\tformula",
    "\rformula",
  ])("neutralizes CSV text %j", (note) => {
    const result = csv([{ ...event, name: note, vendor_score: -5 }], {
      [event.id]: { ...emptyEntry, note },
    });
    const escaped = note.replaceAll('"', '""');
    expect(result).toContain(`"'${escaped}"`);
    expect(result).toContain('"-5"');
    expect(result.match(new RegExp("'", "g"))?.length).toBeGreaterThanOrEqual(
      2,
    );
  });
  it.each(["confirmed", "estimated"] as const)(
    "keeps undated %s events discoverable",
    (date_status) => {
      const e = {
        ...event,
        date_status,
        start_date: null,
        end_date: null,
        estimated_month: null,
      };
      expect(matches(e, emptyFilters, {})).toBe(true);
      expect(matches(e, { ...emptyFilters, from: "2027-01-01" }, {})).toBe(
        false,
      );
      expect(upcoming(e, "2027-01-01")).toBe(true);
      expect(
        timelineGroups([e], emptyFilters, {}, false).get("9999")?.[0].e,
      ).toBe(e);
    },
  );
  it("retains overlapping occurrences in the timeline without unrelated occurrences", () => {
    const e = {
      ...event,
      occurrences: [
        { start_date: "2027-01-30", end_date: "2027-02-02" },
        { start_date: "2027-06-01", end_date: "2027-06-02" },
      ],
    };
    const groups = timelineGroups(
      [e],
      { ...emptyFilters, from: "2027-02-01", to: "2027-02-28" },
      {},
      false,
    );
    expect([...groups.keys()]).toEqual(["2027-01"]);
    expect(groups.get("2027-01")?.[0].label).toContain("2 Feb 2027");
  });
  it.each(["Malaysia", "MY", "pokemon", "collectors", "stock", "special game"])(
    "searches normalized data for %s",
    (search) => {
      const e = {
        ...event,
        country: "Malaysia",
        country_code: "MY",
        name: "Pokémon",
        audience: "Collectors",
        fit: "stock",
        games_note: "special game",
      };
      expect(matches(e, { ...emptyFilters, search }, {})).toBe(true);
    },
  );
  it("supports the UAE country alias", () =>
    expect(
      matches(
        { ...event, country_code: "AE" },
        { ...emptyFilters, search: "UAE" },
        {},
      ),
    ).toBe(true));
  it.each([
    ["5 Jan 2027", "2027-01-05"],
    ["2027-01-05 UTC", "2027-01-05"],
    ["Player reg 1 Dec 2026, vendors 15 Jan 2027", "2027-01-15"],
    ["Player reg 1 Dec 2026 and vendors 15 Jan 2027", "2027-01-15"],
    [
      "1 Dec 2026 (player registration); 15 Jan 2027 (vendor deadline)",
      "2027-01-15",
    ],
    ["2027-01-05", "2027-01-05"],
    ["Apply by 29 February 2028", "2028-02-29"],
    ["31 Feb 2027", null],
    ["2027-13-01", null],
    ["Player reg 1 Dec 2026; vendors 15 Jan 2027", "2027-01-15"],
    ["Player reg 2026-12-01; application deadline 2027-01-15", "2027-01-15"],
  ])("parses Safari-safe deadline %s", (input, expected) =>
    expect(deadlineDate(input)).toBe(expected),
  );
  it("sorts estimates after confirmed dates in the same month and uses future recurrences", () => {
    const recurring = {
      ...event,
      occurrences: [
        { start_date: "2027-01-01", end_date: "2027-01-02" },
        { start_date: "2027-03-03", end_date: "2027-03-04" },
      ],
    };
    expect(dateSortKey(recurring, "2027-02-01")).toBe("2027-03-03");
    expect(
      dateSortKey(
        { ...event, date_status: "estimated", estimated_month: "2027-03" },
        "2027-02-01",
      ),
    ).toBe("2027-03-32");
    expect(compareText("Show 2", "Show 10")).toBeLessThan(0);
  });
  it("chooses the nearest future month and never falls back to January 2027", () => {
    expect(
      nextMonth(
        [{ ...event, start_date: "2028-04-03", end_date: "2028-04-04" }],
        "2028-02-01",
      ),
    ).toBe("2028-04");
    expect(nextMonth([], "2029-12-01")).toBe("2029-12");
    expect(monthEnd("2027-12")).toBe("2027-12-31");
  });
  it("uses local calendar dates across UTC−14 and UTC+14", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["GMT+14", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        const date = new Date(2027, 11, 31, 23, 59);
        expect(Math.abs(date.getTimezoneOffset())).toBe(840);
        expect(localDate(date)).toBe("2027-12-31");
        expect(prettyDate("2028-01-01")).toBe("1 Jan 2028");
        expect(monthEnd("2028-02")).toBe("2028-02-29");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
  it("rejects empty ICS and exports clean optional metadata", () => {
    expect(() => ics([])).toThrow("No confirmed");
    expect(() => ics([{ ...event, date_status: "tba" }])).toThrow();
    const result = ics([
      {
        ...event,
        venue: null,
        city: null,
        country: null,
        description: "one\rtwo",
        vendor_deadline: "Apply 5 Jan 2027",
        website: "https://example.com",
      },
    ]);
    expect(result).not.toContain("LOCATION:");
    expect(result).toContain(
      "DESCRIPTION:one\\ntwo\\nVendor deadline: Apply 5 Jan 2027",
    );
    expect(result).toContain("URL:https://example.com");
    expect(result).toContain("LAST-MODIFIED:20261116T000000Z");
  });
});
