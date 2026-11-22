import finds from "../tests/fixtures/new-finds.json";
import { flagFile, ics, matches } from "./utils";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import raw from "../data/events.json";
import meta from "../data/meta.json";
import { mergeOutreach, normalizeEvents, outreachContactHref, validDate } from "./data";
import { normalizeFilters } from "./hooks/useFilters";
import { emptyFilters, emptyOutreach, outreachStatuses } from "./model";
import { emptyEntry } from "./storage";

describe("source data integrity", () => {
  it.each([...new Set(raw.map((e) => e.country_code).filter(Boolean))])(
    "ships a flag for %s",
    (code) => {
      expect(
        existsSync(`public/flags/${flagFile(code)}`),
        `Missing flag for ${code}`,
      ).toBe(true);
    },
  );
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
  it("exports the current live snapshot date in calendar downloads", () => {
    const dated = normalizeEvents(raw).filter(
      (e) => e.date_status === "confirmed",
    );
    expect(ics(dated)).toContain(
      `LAST-MODIFIED:${meta.updatedAt.replaceAll("-", "")}T000000Z`,
    );
  });
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
        stages: ["Pass", "Passed", "New", "Interested", "Paid / attending", "Quote received", "invalid"],
        score: 200,
        from: "2027-01-01",
        search: "hidden",
        priority: "top",
      }),
    ).toEqual({
      ...emptyFilters,
      countries: ["Singapore"],
      stages: ["Passed", "Not reviewed", "Considering", "Booked", "Quote received"],
      score: 100,
      priority: "top",
    });
  });
});

describe("outreach records and filters", () => {
  it("validates dates, route types and links while preserving outreach and event fields", () => {
    const [valid, invalid, missing, absent] = normalizeEvents([
      {
        id: "valid", name: "Valid", contact: "Original organizer", vendor_cost: "Original cost",
        outreach: {
          status: "quoted", method: "form", contact: "https://example.com/contact",
          contact_type: "form", contacted_at: "2026-11-19", response_at: "2026-11-21",
          message_ref: "confirmation", quoted_price: "$200", notes: "Includes a table",
          published_booth_price: "$160", price_source_url: "https://example.com/booths",
          research_notes: "Includes two badges", unrelated: true,
        },
      },
      {
        id: "invalid", name: "Invalid",
        outreach: {
          status: "waiting", method: "fax", contact: "javascript:alert(1)",
          contact_type: "phone", contacted_at: "2026-02-30", response_at: 5,
          quoted_price: 200, notes: false, price_source_url: "file:///tmp/data",
        },
      },
      { id: "missing", name: "Missing" },
      { id: "absent", name: "Absent", outreach: null },
    ]);
    expect(valid).toMatchObject({
      contact: "Original organizer", vendor_cost: "Original cost",
      outreach: {
        status: "quoted", method: "form", contact: "https://example.com/contact",
        contact_type: "form", contacted_at: "2026-11-19", response_at: "2026-11-21",
        message_ref: "confirmation", quoted_price: "$200", notes: "Includes a table",
        published_booth_price: "$160", price_source_url: "https://example.com/booths",
        research_notes: "Includes two badges",
      },
    });
    expect(valid.outreach).not.toHaveProperty("unrelated");
    expect(invalid.outreach).toEqual(emptyOutreach);
    expect(missing.outreach).toBeUndefined();
    expect(absent.outreach).toBeNull();
    expect(mergeOutreach(null, { method: "email" }).method).toBeNull();
    expect(outreachContactHref("sales+booths@example.com")).toBe("mailto:sales%2Bbooths@example.com");
  });

  it("restores supported outreach filters and matches them independently of the pipeline stage", () => {
    const contacted = normalizeFilters({ outreach: "contacted" });
    const notContacted = normalizeFilters({ outreach: "not_contacted" });
    expect(normalizeFilters({ outreach: true })).toEqual(emptyFilters);
    expect(contacted.outreach).toBe("contacted");
    expect(notContacted.outreach).toBe("not_contacted");
    const [event] = normalizeEvents([{ id: "outreach", name: "Outreach" }]);
    const pipeline = { [event.id]: { ...emptyEntry, stage: "Contacted" as const } };
    expect(matches(event, contacted, pipeline)).toBe(false);
    expect(matches(event, notContacted, pipeline)).toBe(true);
    for (const status of outreachStatuses) {
      const withStatus = { ...event, outreach: mergeOutreach(null, { status }) };
      expect(matches(withStatus, contacted, {})).toBe(status !== "not_contacted");
      expect(matches(withStatus, notContacted, {})).toBe(status === "not_contacted");
      expect(matches(withStatus, { ...contacted, stages: ["Contacted"] }, {})).toBe(false);
    }
  });
});

describe("scanner discoveries and priority filters", () => {
  it("defaults old and malformed preferences and restores valid preferences", () => {
    expect(
      normalizeFilters({ ...emptyFilters, minTier: "unknown", newOnly: 1 }),
    ).toEqual(emptyFilters);
    expect(normalizeFilters({ score: 82 })).toEqual({
      ...emptyFilters,
      score: 82,
    });
    expect(normalizeFilters({ newOnly: true, minTier: "must" })).toEqual({
      ...emptyFilters,
      newOnly: true,
      minTier: "must",
    });
  });
  it("preserves discovery metadata and places dated and undated finds", () => {
    const events = normalizeEvents(finds);
    expect(events.map((e) => e.section)).toEqual([
      "timeline",
      "timeline",
      "watchlist",
    ]);
    expect(events[0]).toMatchObject({
      source: finds[0].source,
      verification: "unverified",
      is_new_find: true,
    });
    expect(
      events.every((e) => matches(e, { ...emptyFilters, newOnly: true }, {})),
    ).toBe(true);
    expect(
      matches(
        normalizeEvents(raw).find((e) => !e.source)!,
        { ...emptyFilters, newOnly: true },
        {},
      ),
    ).toBe(false);
    const e = { ...events[0], vendor_score: 72 };
    expect(
      matches(
        e,
        { ...emptyFilters, newOnly: true, score: 72, minTier: "strong" },
        {},
        64,
      ),
    ).toBe(true);
    expect(
      matches(e, { ...emptyFilters, score: 73, minTier: "strong" }, {}, 100),
    ).toBe(false);
    expect(matches(e, { ...emptyFilters, minTier: "must" }, {}, 76)).toBe(
      false,
    );
    expect(matches(e, { ...emptyFilters, minTier: "must" }, {}, 77)).toBe(true);
  });
  it("keeps incomplete discovery records usable", () => {
    const [e] = normalizeEvents([
      { ...finds[0], source: { confidence: "0", relevance: 2 } },
    ]);
    expect(e.source).toMatchObject({
      name: "",
      confidence: null,
      relevance: null,
      url: "",
    });
    expect(
      normalizeEvents([{ ...finds[2], source: null }])[0].is_new_find,
    ).toBe(true);
  });
});

it("restores only a boolean Going filter", () => {
  expect(normalizeFilters({ going: true }).going).toBe(true);
  for (const going of [undefined, false, "true", 1])
    expect(normalizeFilters({ going }).going).toBe(false);
});

it("normalizes saved quick filters and resolves contradictory Going filters", () => {
  expect(normalizeFilters({ next90: true, notGoing: true })).toEqual({
    ...emptyFilters,
    next90: true,
    notGoing: true,
  });
  expect(normalizeFilters({ next90: "true", notGoing: 1 })).toEqual(
    emptyFilters,
  );
  expect(normalizeFilters({ going: true, notGoing: true }).notGoing).toBe(
    false,
  );
});
