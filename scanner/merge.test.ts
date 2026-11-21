import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ics } from "../src/utils";
import { merge, matches } from "./merge.ts";
import { normalize } from "./normalize.ts";
import type { Event } from "../src/model.ts";
import { mergeOutreach, normalizeEvents } from "../src/data.ts";
import { scanSource, validate } from "./run.ts";
import sg from "./sources/sg-card-show.ts";
import expo from "./sources/sg-expo.ts";
import oz from "./sources/oz-comic-con.ts";

const now = "2026-11-18T00:00:00.000Z",
  today = now.slice(0, 10);
const base = normalize(
  {
    name: "Singapore Card Show 2026",
    city: "Singapore",
    code: "SG",
    date: "12–13 Dec 2026",
  },
  sg,
  now,
);
const find = (fields: Partial<Event> = {}) => ({ ...base, ...fields });
const scanner = (fields: Partial<Event> = {}) => {
  const e = find({ id: "scanner-id", ...fields });
  delete e.source;
  delete e.verification;
  delete e.is_new_find;
  return e;
};
it("matches year, edition and subtitle variants across overlapping or nearby dates", () => {
  expect(
    matches(
      base,
      scanner({
        name: "SINGAPORE CARD SHOW – WORLD EDITION",
        start_date: "2026-12-16",
        end_date: "2026-12-17",
      }),
    ),
  ).toBe(true);
  expect(
    matches(
      base,
      scanner({
        start_date: null,
        end_date: null,
        estimated_month: "2026-12",
        date_status: "estimated",
      }),
    ),
  ).toBe(true);
  expect(
    matches(
      base,
      scanner({
        start_date: "2026-01-01",
        end_date: "2026-01-01",
        occurrences: [{ start_date: "2026-12-12", end_date: "2026-12-13" }],
      }),
    ),
  ).toBe(true);
});
it.each([
  { city: "Bangkok" },
  { country_code: "HK" },
  { name: "Singapore Comic Con" },
  { start_date: "2027-12-12", end_date: "2027-12-13" },
  { start_date: null, end_date: null, estimated_month: null },
])("distinguishes %j", (fields) =>
  expect(matches(base, scanner(fields))).toBe(false),
);
it("keeps every Scanner object byte-identical and in export order", () => {
  const raw = JSON.parse(readFileSync("data/events.json", "utf8")) as Event[];
  const originals = raw.filter((e) => !e.source);
  const before = JSON.stringify(originals);
  const merged = merge(originals, [base], today);
  expect(JSON.stringify(merged.events.filter((e) => !e.source))).toBe(before);
  expect(JSON.stringify(originals)).toBe(before);
  expect(merge([scanner()], [base], today).added).toEqual([]);
});
it("preserves identity, original discovery and unrelated keys through corrections and retries", () => {
  const first = Object.assign(find(), { custom: "saved" });
  const change = normalize(
    {
      name: "Singapore Card Show – World Edition",
      date: "12-13 Dec 2026",
      city: "Singapore",
      code: "SG",
      vendor_count: 580,
    },
    sg,
    "2026-11-20T00:00:00Z",
  );
  const { events, added } = merge([first], [change], today);
  expect(added).toHaveLength(0);
  expect(events[0]).toMatchObject({
    id: first.id,
    custom: "saved",
    vendor_count: 580,
    source: { discovered_at: now },
  });
  expect(JSON.stringify(merge(events, [change], today).events)).toBe(
    JSON.stringify(events),
  );
});
it("replaces the Scanner portion and drops a find the new export covers", () => {
  const fresh = scanner({
    id: "from-new-export",
    name: "Singapore Card Show World Edition",
  });
  const other = find({ id: "another", name: "Fandom Expo" });
  expect(
    merge([scanner({ id: "obsolete" }), base, other], [], today, [fresh])
      .events,
  ).toEqual([fresh, other]);
});
it("carries only planner outreach onto replacement Scanner records with the same ID", () => {
  const outreach = mergeOutreach(null, { status: "quoted", method: "form", quoted_price: "$200" });
  const previous = scanner({ outreach, vendor_cost: "Old cost", contact: "old@example.com" });
  const imported = scanner({ vendor_cost: "New cost", contact: "new@example.com" });
  const foreign = scanner({ id: "different", outreach });
  const missing = scanner({ id: "removed", name: "Other tracked event", outreach });
  const { events } = merge([previous, missing], [], today, [imported, foreign]);
  expect(events).toEqual([
    { ...imported, outreach },
    scanner({ id: "different" }),
    missing,
  ]);
  expect(merge([previous], [], today, [{ ...imported, outreach: null }]).events[0].outreach).toEqual(outreach);
  expect(imported.outreach).toBeUndefined();
});

it.each([undefined, null, mergeOutreach(null, { notes: "Source default" })])("keeps planner outreach when a scraper update supplies %j", (incomingOutreach) => {
  const outreach = mergeOutreach(null, { status: "replied", method: "email", notes: "Follow up" });
  const previous = find({ outreach });
  const update = find({ vendor_count: 320, outreach: incomingOutreach });
  expect(merge([previous], [update], today).events[0]).toMatchObject({
    id: previous.id,
    outreach,
    vendor_count: 320,
  });
});
it("keeps seeded finds after their dates pass, including when a Scanner row replaces a find", () => {
  const outreach = mergeOutreach(null, { status: "quoted", method: "email", quoted_price: "$200" });
  const saved = find({ outreach });
  expect(merge([saved], [], "2027-12-31").events).toEqual([saved]);

  const imported = scanner({ vendor_count: 320 });
  const promoted = { ...imported, id: saved.id, scanner_export_id: imported.id, outreach };
  expect(merge([saved], [], today, [imported]).events).toEqual([promoted]);
  expect(merge([promoted], [], today, [imported]).events).toEqual([promoted]);
  const rescheduled = { ...imported, start_date: "2027-02-01", end_date: "2027-02-02" };
  expect(merge([promoted], [], today, [rescheduled]).events).toEqual([
    { ...promoted, original_start_date: promoted.start_date, start_date: rescheduled.start_date, end_date: rescheduled.end_date },
  ]);
  expect(merge([promoted], [], today, [imported, { ...imported, id: saved.id }]).events).toEqual([
    imported, { ...imported, id: saved.id, outreach },
  ]);
});

it("never assigns saved outreach to an ambiguous Scanner replacement", () => {
  const saved = find({ outreach: mergeOutreach(null, { notes: "Keep this note" }) });
  const exportRows = [scanner(), scanner({ id: "second" })];
  const { events } = merge([saved], [], today, exportRows);
  expect(events).toHaveLength(3);
  expect(events.filter((event) => event.outreach)).toEqual([saved]);
});
it("retains unlisted finds through day 30 after the end, including confirmed multi-day shows", () => {
  expect(merge([base], [], "2027-01-12").events).toEqual([base]);
  expect(merge([base], [], "2027-01-13").events).toEqual([]);
  expect(merge([scanner()], [], "2027-12-31").events).toHaveLength(1);
});
it("preserves uncertainty and rejects invalid output", () => {
  const tba = normalize(
    { name: "New Card Show", date: null, code: "MY", city: null },
    sg,
    now,
  );
  expect(tba).toMatchObject({
    start_date: null,
    section: "watchlist",
    vendor_cost: null,
    visitors: null,
    priority_market_level: "high",
  });
  const est = normalize(
    {
      name: "New Card Show",
      date: "May 2027",
      date_status: "estimated",
      estimated_month: "2027-05",
      code: "MY",
      city: null,
    },
    sg,
    now,
  );
  expect(est).toMatchObject({
    start_date: null,
    section: "timeline",
    estimated_month: "2027-05",
  });
  expect(() => validate([base, base])).toThrow();
  expect(() =>
    validate([find({ source: { ...base.source!, url: "javascript:bad" } })]),
  ).toThrow();
});
it("keeps two weekends in one city and month with stable IDs when listing order reverses", () => {
  const later = find({ start_date: "2026-12-26", end_date: "2026-12-27" });
  const first = merge([], [base, later], today);
  expect(new Set(first.events.map((e) => e.id)).size).toBe(2);
  expect(merge(first.events, [later, base], today).events).toEqual(
    first.events,
  );
});
it("upgrades a venue discovery when the organizer later supplies booth details", () => {
  const venue = find({
    id: "scan-venue-show-202612",
    source: { ...base.source!, id: "venue" },
  });
  const organizer = find({
    vendor_count: 550,
    source: { ...base.source!, discovered_at: "2026-11-20T00:00:00Z" },
  });
  const result = merge([venue], [organizer, venue], today, undefined, [
    sg.id,
    "venue",
  ]);
  expect(result.added).toHaveLength(0);
  expect(result.events[0]).toMatchObject({
    id: venue.id,
    vendor_count: 550,
    source: { id: sg.id, discovered_at: now },
  });
});

async function scan(name: string, date: string | null) {
  return scanSource({
    ...sg, run: async () => [{ name, date, code: "SG", city: "Singapore" }],
  }, async () => "", new Date(now));
}
it.each([
  ["cancelled", "Singapore Card Show 2026 has been cancelled", "12-13 Dec 2026", "confirmed", base.start_date, null],
  ["cancelled", base.name, "Event has been cancelled", "confirmed", base.start_date, null],
  ["postponed", base.name + " (Postponed)", "12-13 Dec 2026", "tba", null, null],
  ["postponed", base.name, "Postponed until further notice", "tba", null, null],
  ["postponed", base.name + " (Postponed to March 2027)", null, "estimated", null, "2027-03"],
  ["postponed", base.name, "Postponed to 4-5 March 2027", "confirmed", "2027-03-04", null],
])("applies the %s notice %s / %s and restores the same row on re-listing", async (kind, name, date, status, start, month) => {
  const old = find({ outreach: mergeOutreach(null, { notes: "Keep" }) });
  const { notices, events, stats } = await scan(name!, date);
  expect(stats).toMatchObject({ status: "OK", dropped_as_junk: 0, outside_window: 0 });
  expect(events).toEqual([]);
  const result = merge([old], events, today, undefined, [], notices);
  expect(result.applied).toHaveLength(1);
  expect(result.unmatched).toEqual([]);
  expect(result.events[0]).toMatchObject({
    id: old.id, outreach: old.outreach, source: { discovered_at: now },
    event_status: kind, date_status: status, date_note: notices[0].date_note,
    section: status === "tba" ? "watchlist" : "timeline", start_date: start, estimated_month: month,
    end_date: start === "2027-03-04" ? "2027-03-05" : kind === "cancelled" ? base.end_date : null,
  });
  validate(result.events);
  expect(merge(result.events, [], today, undefined, [], notices).events).toEqual(result.events);
  const listing = month || start === "2027-03-04" ? "4-5 March 2027" : "9-10 Jan 2027";
  const relisted = await scan(base.name, listing);
  const restored = merge(result.events, relisted.events, today);
  expect(restored.events).toHaveLength(1);
  expect(restored.added).toEqual([]);
  expect(restored.events[0]).toMatchObject({
    id: old.id, outreach: old.outreach, date_status: "confirmed", start_date: relisted.events[0].start_date,
    end_date: relisted.events[0].end_date, date_note: listing, source: { discovered_at: now },
  });
  expect(restored.events[0]).not.toHaveProperty("event_status");
});

it("reports unmatched or ambiguous notices without creating rows or changing curated events", async () => {
  const { notices } = await scan(base.name, "TBC - postponed");
  for (const existing of [[], [scanner()], [base, find({ id: "second", start_date: "2027-04-05", end_date: "2027-04-05" })]]) {
    const result = merge(existing, [], today, undefined, [], notices);
    expect(result.unmatched).toEqual(notices);
    expect(result.applied).toEqual([]);
    expect(result.events).toEqual(existing);
    expect(result.added).toEqual([]);
  }
});
it("uses the original date to distinguish two editions and prunes cancelled editions normally", async () => {
  const second = find({ id: "second", start_date: "2027-02-05", end_date: "2027-02-05" });
  const { notices } = await scan(base.name + " – Event cancelled", "12-13 Dec 2026");
  const result = merge([base, second], [], today, undefined, [], notices);
  expect(result.events[0].event_status).toBe("cancelled");
  expect(result.events[1]).toEqual(second);
  expect(merge(result.events, [], "2027-01-15").events).toEqual([second]);
});
it("retains reviewed artwork, description and verification when the source supplies no replacement", async () => {
  const old = find({ logo: "logos/art.webp", logo_kind: "logo", description: "Curated", verification: "verified" });
  const { events } = await scan(old.name, "12-13 Dec 2026");
  const [refreshed] = merge([old], events, today).events;
  expect(refreshed).toMatchObject({ logo: old.logo, logo_kind: "logo", description: "Curated", verification: "verified" });
  validate([refreshed]);
});

it("validates optional event status on import and normalizes it for the planner", () => {
  for (const status of ["postponed", "cancelled"]) {
    const raw = [{ ...base, event_status: status }];
    validate(raw);
    expect(normalizeEvents(raw)[0].event_status).toBe(status);
  }
  for (const status of [null, "confirmed", "other"]) {
    const raw = [{ ...base, event_status: status }];
    expect(() => validate(raw)).toThrow();
    expect(normalizeEvents(raw)[0]).not.toHaveProperty("event_status");
  }
  validate([base]);
});

it("applies the owner's notice when a higher-ranked calendar still advertises the original dates", async () => {
  const { notices } = await scan(base.name, "Postponed to March 2027");
  const stale = find({ source: { ...base.source!, id: "calendar" } });
  const result = merge([base], [stale], today, undefined, ["calendar", sg.id], notices);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({ id: base.id, source: { id: sg.id }, event_status: "postponed", estimated_month: "2027-03" });
});

it("uses the city stop's named edition to match a move across calendar years", async () => {
  const source = { ...sg, id: "oz-comic-con" };
  const name = "Oz Comic-Con Sydney 2027";
  const make = (date: string) => normalize({ name, date, city: "Sydney", code: "AU" }, source, now);
  const original = make("12 Dec 2026");
  const changed = make("15 Jan 2027");
  expect(merge([original], [changed], today).events).toMatchObject([{ ...changed, id: original.id }]);
});

// Freeze the shipped unversioned row. The live dataset ages out past editions.
const sydney = JSON.parse(readFileSync("scanner/fixtures/oz-sydney-2027.json", "utf8")) as Event;

it("keeps the December edition identity on two scans with its March notice and stale EXPO card", async () => {
  const html = readFileSync("scanner/fixtures/sg-card-show.html", "utf8");
  const previous = await scanSource(sg, async () => html, new Date(now));
  const { notices } = await scanSource(sg, async () => html.replace("12th - 13th December 2026", "Postponed to March 2027"), new Date(now));
  const venue = await scanSource(expo, async () => readFileSync("scanner/fixtures/sg-expo.html", "utf8"), new Date(now));
  const refresh = (rows: Event[]) => merge(rows, venue.events, today, undefined, [expo.id, sg.id], notices);
  const first = refresh(previous.events);
  const [original] = previous.events;
  expect(venue.events.map((e) => e.name)).toContain("SINGAPORE CARD SHOW – WORLD EDITION");
  expect(first.events).toHaveLength(1);
  expect(first.events[0]).toMatchObject({
    id: original.id, event_status: "postponed", estimated_month: "2027-03",
    source: { original_dates: [{ start_date: original.start_date, end_date: original.end_date }] },
  });
  expect(refresh(JSON.parse(JSON.stringify(first.events))).events).toEqual(first.events);
});

it("applies a later cancellation naming the dates removed by an undated postponement", async () => {
  const first = await scan(base.name, "Postponed");
  const second = await scan(base.name + " (Cancelled)", "12-13 Dec 2026");
  const postponed = merge([base], [], today, undefined, [], first.notices);
  expect(postponed.events[0].start_date).toBeNull();
  const cancelled = merge(postponed.events, [], today, undefined, [], second.notices);
  expect(cancelled.unmatched).toEqual([]);
  expect(cancelled.events[0]).toMatchObject({ id: base.id, event_status: "cancelled", date_status: "confirmed",
    start_date: base.start_date, end_date: base.end_date, section: "timeline" });
  const calendar = ics(cancelled.events).replace(/\r\n /g, "");
  expect(calendar).toContain(`UID:${base.id}-${base.start_date}@tcg-vendor-calendar`);
  expect(calendar).toContain("STATUS:CANCELLED");
  expect(merge(cancelled.events, [], "2028-12-31").events).toEqual([]);
});

it("keeps next season separate from Sydney's cancelled edition and its outreach", () => {
  const old = { ...sydney, event_status: "cancelled" as const, outreach: mergeOutreach(null, { notes: "2027 booking" }) };
  const listing = (date: string) => normalize({ name: old.name, date, city: "Sydney", code: "AU" }, oz, now);
  const replacement = listing("2 Oct 2027");
  const next = listing("18 Sep 2028");
  const nextOnly = merge([old], [next], today);
  expect(nextOnly.events).toHaveLength(2);
  expect(nextOnly.events[0]).toEqual(old);
  expect(nextOnly.added[0]).toMatchObject({ id: next.id });
  expect(nextOnly.added[0].outreach).toBeFalsy();
  const both = merge([old], [next, replacement], today);
  expect(both.events).toHaveLength(2);
  expect(both.events[0]).toMatchObject({ id: old.id, outreach: old.outreach, start_date: replacement.start_date });
  expect(both.events[0].event_status).toBeUndefined();
});

it("corroborates an edition year in a notice against the shipped Sydney row", async () => {
  const html = readFileSync("scanner/fixtures/oz-comic-con.html", "utf8");
  for (const year of [2027, 2028]) {
    const result = await scanSource(oz, async () =>
      '<h1 class="elementor-heading-title">Oz Comic-Con Sydney ' + year + ' has been cancelled</h1>' + html, new Date(now));
    const merged = merge([sydney], [], today, undefined, [], result.notices);
    expect(merged.events[0].event_status).toBe(year === 2027 ? "cancelled" : undefined);
    expect(merged.unmatched).toHaveLength(year === 2027 ? 0 : 1);
  }
});

it.each([
  [base.name, "Postponed indefinitely; now cancelled"],
  [base.name + " (Cancelled)", "Postponed to March 2027"],
])("resolves the final cancellation in %s / %s", async (name, date) => {
  const { notices } = await scan(name, date);
  expect(merge([base], [], today, undefined, [], notices).events[0])
    .toMatchObject({ event_status: "cancelled", start_date: base.start_date, estimated_month: null });
});
it("reports conflicting status fields without updating the row", async () => {
  const { stats, notices, events } = await scan(base.name + " (Postponed)", "Cancelled");
  expect(stats.reason).toContain("Conflicting schedule notices");
  expect(merge([base], events, today, undefined, [], notices).events).toEqual([base]);
});

it("leaves an undated notice unmatched when the owner still lists a separate dated card", async () => {
  const { notices } = await scan(base.name, "Cancelled");
  const result = merge([base], [base], today, undefined, [], notices);
  expect(result.unmatched).toEqual(notices);
  expect(result.applied).toEqual([]);
  expect(result.events).toEqual([base]);
});

it("reports conflicting notices about the same edition in either feed order", async () => {
  const { notices: postponed } = await scan(base.name + " (Postponed)", "12-13 Dec 2026");
  const { notices: cancelled } = await scan(base.name + " (Cancelled)", "12-13 Dec 2026");
  for (const notices of [[...postponed, ...cancelled], [...cancelled, ...postponed]]) {
    const result = merge([base], [], today, undefined, [], notices);
    expect(result.unmatched).toEqual(notices);
    expect(result.applied).toEqual([]);
    expect(result.events).toEqual([base]);
  }
});

it("validates the original schedule before using it to identify a postponed edition", () => {
  const old = find({ source: { ...base.source!, original_dates: [{ start_date: "invalid", end_date: "2027-12-13" }] } });
  expect(() => validate([old])).toThrow("Invalid event output");
});

it.each([
  ["Cancelled", "Cancelled; now postponed to March 2027", "postponed", "2027-03"],
  ["Postponed", "Postponed indefinitely; now cancelled", "cancelled", null],
  ["Cancelled; now postponed to March 2027", "Cancelled", "postponed", "2027-03"],
  ["Postponed; now cancelled", "Postponed to March 2027", "cancelled", null],
])("applies the explicit final transition after a %s title", async (title, field, status, month) => {
  const result = await scan(base.name + " (" + title + ")", field);
  expect(result.stats.status).toBe("OK");
  const updated = merge([base], [], today, undefined, [], result.notices);
  expect(updated.events[0]).toMatchObject({ event_status: status, estimated_month: month });
});

it("leaves the Sydney booking intact when two March weekends claim it in either order", async () => {
  const rows = (date: string) => ({ name: sydney.name, city: "Sydney", code: "AU", date });
  const notice = await scanSource({ ...oz, run: async () => [rows("Postponed to March 2028")] }, async () => "", new Date(now));
  const postponed = merge([sydney], [], today, undefined, [], notice.notices).events;
  const weekends = ["4-5 March 2028", "18-19 March 2028"].map((date) => normalize(rows(date), oz, now));
  for (const feed of [weekends, [...weekends].reverse()]) {
    const result = merge(postponed, feed, today);
    expect(result.ambiguous).toHaveLength(2);
    expect(result.events).toEqual(postponed);
    expect(result.events[0].outreach).toEqual(sydney.outreach);
  }
});

it("remembers both superseded Singapore weekends for venue listings and follow-up notices", async () => {
  const html = readFileSync("scanner/fixtures/sg-card-show.html", "utf8");
  const get = (date: string) => scanSource(sg, async () => html.replace("12th - 13th December 2026", date), new Date(now));
  const previous = await get("12-13 December 2026");
  const march = await get("Postponed to 6-7 March 2027");
  const april = await get("Postponed to 10-11 April 2027");
  const venue = await scanSource(expo, async () => readFileSync("scanner/fixtures/sg-expo.html", "utf8"), new Date(now));
  const moved = merge(previous.events, [], today, undefined, [], march.notices);
  const twice = merge(moved.events, [], today, undefined, [], april.notices);
  const stale = { ...venue.events[0], start_date: "2027-03-06", end_date: "2027-03-07" };
  const result = merge(normalizeEvents(twice.events), [stale], today);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({ id: previous.events[0].id, start_date: "2027-04-10", event_status: "postponed" });
  expect(result.events[0].source?.previous_dates?.map((r) => r.start_date)).toEqual(["2026-12-12", "2027-03-06"]);
  const followup = await get("6-7 March 2027 (Cancelled)");
  expect(merge(result.events, [], today, undefined, [], followup.notices).applied).toEqual(followup.notices);
});

it("keeps the Singapore planner ID and booking notes when the replacement uses a new form", async () => {
  const html = readFileSync("scanner/fixtures/sg-card-show.html", "utf8");
  const get = (s: string) => scanSource(sg, async () => s, new Date(now));
  const old = (await get(html)).events[0];
  old.outreach = mergeOutreach(null, { notes: "Keep booking" });
  const notice = await get(html.replace("12th - 13th December 2026", "Postponed to March 2027"));
  const updated = merge([old], [], today, undefined, [], notice.notices).events;
  const relisted = await get(html.replace("12th - 13th December 2026", "6-7 March 2027").replace("KbYb6E5fMX84Xm3a6", "new-form"));
  const result = merge(updated, relisted.events, today);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({ id: old.id, outreach: old.outreach, start_date: "2027-03-06" });
  expect(result.events[0].source?.aliases).toHaveLength(2);
  expect(result.events[0].event_status).toBeUndefined();
});

it("reuses Sydney's corroborated edition key after the legacy row has lost its dates", async () => {
  const name = sydney.name + " 2027";
  const get = (date: string) => scanSource({ ...oz, run: async () => [{ name, date, city: "Sydney", code: "AU" }] }, async () => "", new Date(now));
  const notice = await get("Postponed until further notice");
  const postponed = normalizeEvents(merge([sydney], [], today, undefined, [], notice.notices).events);
  const listing = await get("4-5 March 2028");
  const result = merge(postponed, listing.events, today);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({ id: sydney.id, outreach: sydney.outreach, name, start_date: "2028-03-04" });
  expect(result.events[0].event_status).toBeUndefined();
});

it("leaves a title notice unmatched if its date field gives only a different edition year", async () => {
  const result = await scan(base.name + " (Cancelled)", "December 2027");
  const merged = merge([base], [], today, undefined, [], result.notices);
  expect(merged.unmatched).toHaveLength(1);
  expect(merged.events).toEqual([base]);
});

it("leaves an unkeyed, never-dated edition alone when its name is the only evidence", async () => {
  const blank = (await scan("City Card Show", null)).events;
  const { notices } = await scan("City Card Show", "Cancelled");
  const merged = merge(blank, [], today, undefined, [], notices);
  expect(merged.unmatched).toHaveLength(1);
  expect(merged.events).toEqual(blank);
});
