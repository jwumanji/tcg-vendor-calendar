import { merge } from "../scanner/merge";
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
  occurrenceOn,
  upcoming,
  timelineGroups,
  ics,
  placeLabel,
  countryOptions,
  selectedFlags,
  flagFile,
  goingEvents,
  csv,
  foldLine,
  matches,
  matchingEvent,
  games,
  deadlineDate,
  monthEnd,
  ranges,
  gameKey,
  gameKeyOf,
  primaryGameKey,
} from "./utils";
const event = raw[0] as Event;
it("opens the full recurring weekend from either calendar day", () => {
  const recurring = { ...event, date_status: "confirmed" as const, occurrences: [
    { start_date: "2027-01-02", end_date: "2027-01-03" },
    { start_date: "2027-03-13", end_date: "2027-03-14" },
  ] };
  expect(occurrenceOn(recurring, "2027-03-14")).toBe("13 Mar 2027 – 14 Mar 2027");
  expect(occurrenceOn(recurring, "2027-03-15")).toBeUndefined();
});

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
          ...emptyEntry,
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
            ...emptyEntry,
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
        ...emptyEntry,
        stage: "Too expensive",
        note,
        noteUpdatedAt: null,
        stageUpdatedAt: null,
      },
    });
    expect(result).toContain('"Pipeline stage","Notes"');
    expect(result).toContain('"Too expensive","Quoted ""USD 250""\nFollow up"');
    expect(csv([event])).toContain('"Not reviewed",""');
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
    expect([...groups.keys()]).toEqual(["2027-02"]);
    expect(groups.get("2027-02")?.[0].label).toContain("2 Feb 2027");
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

describe("game accents", () => {
  it("slugs game names for accent colours", () => {
    expect(gameKey("Pokémon")).toBe("pokemon");
    expect(gameKey("Yu-Gi-Oh!")).toBe("yugioh");
    expect(gameKey("Flesh and Blood")).toBe("fleshandblood");
    expect(gameKeyOf("Pokémon-led")).toBe("pokemon");
    expect(gameKeyOf("Disney Lorcana")).toBe("lorcana");
    expect(gameKeyOf("sports cards")).toBe("other");
    expect(primaryGameKey({ ...event, games: ["Toys"] })).toBe("other");
  });
});

it("labels places and selects local flag assets", () => {
  expect(flagFile("SG")).toBe("1f1f8-1f1ec.svg");
  expect(flagFile("HK")).toBe("1f1ed-1f1f0.svg");
  for (const code of [null, "", "sg", "123", "../SG"])
    expect(flagFile(code)).toBeNull();
  const hk = { city: "Wan Chai", country: "Hong Kong" };
  expect(placeLabel(hk)).toBe("Wan Chai, Hong Kong");
  expect(placeLabel(hk, true)).toBe("Hong Kong");
  expect(placeLabel({ city: "singapore", country: "Singapore" })).toBe(
    "Singapore",
  );
  expect(placeLabel({ city: "Unknown", country: null })).toBe("Location TBA");
});

it("filters to Going and exports only its confirmed occurrences", () => {
  const recurring = raw.find((e) => e.section === "recurring_sg") as Event;
  const tba = { ...event, id: "undated", date_status: "tba" as const };
  const entries = Object.fromEntries(
    [recurring, tba].map((e) => [e.id, { ...emptyEntry, going: true }]),
  );
  const events = [recurring, tba, event];
  const going = goingEvents(events, entries);
  expect(going).toEqual([recurring, tba]);
  expect(
    events.filter((e) => matches(e, { ...emptyFilters, going: true }, entries)),
  ).toEqual(going);
  const calendar = ics(going);
  for (const r of ranges(recurring))
    expect(calendar).toContain(`UID:${recurring.id}-${r.start_date}@tcg-vendor-calendar`);
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(
    ranges(recurring).length,
  );
  expect(() => ics(goingEvents([event, tba], entries))).toThrow("No confirmed");
});

describe("quick filters", () => {
  const confirmed = {
    ...event,
    country: "Singapore",
    occurrences: undefined,
    start_date: "2026-12-01",
    end_date: "2026-12-02",
    date_status: "confirmed" as const,
  };
  const estimated = {
    ...confirmed,
    date_status: "estimated" as const,
    estimated_month: "2027-02",
  };
  it("shares confirmed and country filters and treats missing entries as not yet Going", () => {
    const filters = {
      ...emptyFilters,
      status: "confirmed",
      countries: ["Singapore", "Malaysia"],
      notGoing: true,
    };
    expect(matches(confirmed, filters, {})).toBe(true);
    expect(matches(estimated, filters, {})).toBe(false);
    expect(matches({ ...confirmed, country: "Hong Kong" }, filters, {})).toBe(
      false,
    );
    expect(
      matches(confirmed, filters, {
        [confirmed.id]: { ...emptyEntry, going: true },
      }),
    ).toBe(false);
  });
  it("checks all occurrences and estimated months within 90 calendar days including today", () => {
    const filters = { ...emptyFilters, next90: true };
    const match = (e: Event) => matches(e, filters, {}, 0, "2026-12-01");
    expect(
      match({ ...confirmed, start_date: "2026-10-01", end_date: "2026-12-01" }),
    ).toBe(true);
    expect(
      match({ ...confirmed, start_date: "2026-10-01", end_date: "2026-11-30" }),
    ).toBe(false);
    expect(
      match({
        ...confirmed,
        occurrences: [
          { start_date: "2025-01-01", end_date: "2025-01-01" },
          { start_date: "2027-02-28", end_date: "2027-02-28" },
        ],
      }),
    ).toBe(true);
    expect(match(estimated)).toBe(true);
    expect(match({ ...estimated, estimated_month: "2027-03" })).toBe(false);
    expect(match({ ...confirmed, date_status: "tba" })).toBe(false);
    expect(
      matches(
        confirmed,
        { ...filters, from: "2027-03-01" },
        {},
        0,
        "2026-12-01",
      ),
    ).toBe(false);
  });
});
it("exports a Going month estimate as a transparent tentative placeholder and omits TBA", () => {
  const estimated = {
    ...event,
    date_status: "estimated" as const,
    estimated_month: "2027-02",
  };
  const result = ics([estimated, { ...event, date_status: "tba" }], true);
  expect(result.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(result).toContain("DTSTART;VALUE=DATE:20270201");
  expect(result).toContain("DTEND;VALUE=DATE:20270202");
  expect(result).toContain("STATUS:TENTATIVE");
  expect(result).toContain("SUMMARY:Est. February 2027");
  expect(() => ics([estimated])).toThrow();
});

describe("countryOptions", () => {
  it("lists countries alphabetically with counts and Unknown last", () => {
    const base = (raw as unknown as Event[])[0];
    const mk = (country: string | null, code: string | null) => ({ ...base, country, country_code: code }) as Event;
    const opts = countryOptions([mk("Singapore", "SG"), mk(null, null), mk("Hong Kong", "HK"), mk("Singapore", "SG")]);
    expect(opts.map((o) => [o.name, o.count])).toEqual([["Hong Kong", 1], ["Singapore", 2], ["Unknown", 1]]);
    expect(opts[1].code).toBe("SG");
  });
});

it("previews selected flags in selection order and counts overflow or missing flags", () => {
  const options = ["SG", "HK", "MY", "JP"].map((code) => ({ name: code, code, count: 1 }));
  expect(selectedFlags([], options)).toEqual({ flags: [], more: 0 });
  expect(selectedFlags(["HK", "Unknown", "MY", "SG", "JP"], options)).toEqual({
    flags: ["HK", "MY", "SG"], more: 2,
  });
  expect(selectedFlags(["JP", "HK"], options, 1)).toEqual({ flags: ["JP"], more: 1 });
});

it("exports cancellation on the original calendar UID and includes event and date status in CSV", () => {
  const cancelled: Event = { ...event, event_status: "cancelled" };
  const result = ics([cancelled]);
  expect(result).toContain(`UID:${event.id}-${event.start_date}@tcg-vendor-calendar`);
  expect(result).toContain("\r\nSTATUS:CANCELLED\r\n");
  expect(result).not.toContain("STATUS:TENTATIVE");
  const exported = csv([cancelled, event]);
  expect(exported).toContain('"Date status","Event status"');
  expect(exported).toContain('"confirmed","cancelled"');
  expect(exported).toContain('"confirmed","scheduled"');
});

it("keeps a single appointment's UID when its December dates move to March", () => {
  const before = { ...event, occurrences: undefined, start_date: "2026-12-12", end_date: "2026-12-13" };
  const after = { ...before, event_status: "postponed" as const, start_date: "2027-03-13", end_date: "2027-03-14" };
  const original = ics([before]);
  const updated = ics(merge([before], [], "2026-11-21", [after]).events);
  expect(original).toContain("DTSTART;VALUE=DATE:20261212");
  expect(updated).toContain("DTSTART;VALUE=DATE:20270313");
  expect(updated.match(/^UID:.+$/gm)).toEqual(original.match(/^UID:.+$/gm));
});

it("keeps recurring appointments distinct and stable when a weekend moves or the export is filtered", () => {
  const before = { ...event, occurrences: ["2027-01-09", "2027-03-13"].map((date) => ({ start_date: date, end_date: date })) };
  const after = { ...before, occurrences: [before.occurrences[0], { start_date: "2027-04-10", end_date: "2027-04-10" }] };
  const uids = (e: Event) => ics([e]).match(/^UID:.+$/gm)!;
  expect(new Set(uids(before)).size).toBe(2);
  const [updated] = merge([before], [], "2026-11-21", [after]).events;
  expect(uids(updated)).toEqual(uids(before));
  expect(uids(matchingEvent(updated, { ...emptyFilters, from: "2027-04-01" }, {})!)).toEqual([uids(before)[1]]);
});

it("keeps the legacy UID of a recurring weekend after the first weekend disappears upstream", () => {
  const dates = ["2027-01-30", "2027-02-13", "2027-03-06"].map((date) => ({ start_date: date, end_date: date }));
  const before = { ...event, ...dates[0], occurrences: dates };
  const revised = { ...before, ...dates[1], occurrences: dates.slice(1) };
  const [stored] = merge([before], [], "2026-11-21", [revised]).events;
  expect(stored.occurrences?.map((r) => r.original_start_date)).toEqual(["2027-02-13", "2027-03-06"]);
  const calendar = ics([stored]);
  expect(calendar).not.toContain(`UID:${event.id}-2027-01-30@`);
  for (const date of dates.slice(1)) expect(calendar).toContain(`UID:${event.id}-${date.start_date}@tcg-vendor-calendar`);
});
