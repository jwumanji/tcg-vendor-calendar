import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { merge, matches } from "./merge.ts";
import { normalize } from "./normalize.ts";
import type { Event } from "../src/model.ts";
import { mergeOutreach } from "../src/data.ts";
import { validate } from "./run.ts";
import sg from "./sources/sg-card-show.ts";

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
    { ...promoted, start_date: rescheduled.start_date, end_date: rescheduled.end_date },
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
