import { merge } from "./merge.ts";
import { scheduleNotice } from "./listing.ts";
import { scanSource } from "./run.ts";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { sources } from "./sources/index.ts";
import { parseDetail } from "./sources/bandai.ts";
import { normalize } from "./normalize.ts";
import { normalizeEvents } from "../src/data.ts";
import { parseDates, localDay } from "./dates.ts";
import { relevance } from "./relevance.ts";

const fixture = (id: string) =>
  readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");
const samples: Record<string, [string, string]> = {
  "sg-card-show": ["Singapore Card Show 2026", "2026-12-12"],
  "sg-expo": ["SINGAPORE CARD SHOW – WORLD EDITION", "2026-12-12"],
  suntec: ["Asia Comic Expo 005", "2027-01-23"],
  hkcec: ["Amazing Toy Show 2026", "2026-12-11"],
  afa: ["Anime Festival Asia Singapore 2026", "2026-11-27"],
  sgcc: ["Singapore Comic Con", "2026-12-04"],
  magic: ["CommandFest Melbourne", "2026-12-04"],
  bandai: ["BANDAI CARD GAMES Fest 26-27 in Tokyo", "2027-02-20"],
  "jump-festa": ["JUMP FESTA 2027", "2026-12-19"],
  supanova: ["Supanova Comic Con & Gaming – Gold Coast", "2027-04-10"],
  "oz-comic-con": ["Oz Comic-Con Sydney", "2027-09-18"],
};
it.each(sources)(
  "reads the real $id fixture and normalizes the dated result",
  async (source) => {
    const { parse } = await import(`./sources/${source.id}.ts`);
    const raw = parse(fixture(source.id)).find(
      (r: { name: string }) => r.name === samples[source.id][0],
    );
    expect(raw).toBeDefined();
    const e = normalize(raw, source, "2026-11-18T01:00:00.000Z");
    expect(normalizeEvents([e])[0]).toMatchObject({
      start_date: samples[source.id][1],
      date_status: "confirmed",
      section: "timeline",
      is_new_find: true,
      verification: "unverified",
      source: e.source,
      logo: null,
      vendor_score: null,
    });
    if (source.id === "sg-card-show")
      expect(e).toMatchObject({
        visitors: 30000,
        vendor_count: 550,
        size_tier: "XL",
        vendor_cost: null,
        previous_editions_count: 5,
        end_date: "2026-12-13",
        priority_market_level: "top",
        vendor_application: expect.stringContaining("forms.gle"),
      });
    if (source.id === "hkcec")
      expect(e).toMatchObject({
        organizer: "Exhibition Group Limited",
        contact: "amazingtoyshow@amaz.hk",
      });
    if (source.id === "supanova")
      expect(e).toMatchObject({
        priority_market: false,
        region_group: "Other",
      });
  },
);
it("reads games and venue from the Singapore edition's detail page", () => {
  expect(parseDetail(fixture("bandai-sg"))).toMatchObject({
    venue: "SANDS Expo Convention Centre",
    games: expect.arrayContaining(["DIGIMON CARD GAME"]),
  });
});
it.each([
  ["12th - 13th December 2026", "2026-12-12", "2026-12-13"],
  ["12-13 Dec 2026", "2026-12-12", "2026-12-13"],
  ["Dec 12, 2026", "2026-12-12", "2026-12-12"],
  ["2028-02-29", "2028-02-29", "2028-02-29"],
  ["31 Dec 2026 – 2 Jan 2027", "2026-12-31", "2027-01-02"],
  ["29/11/2026 - 01/12/2026", "2026-11-29", "2026-12-01"],
])("parses %s", (raw, start, end) =>
  expect(parseDates(raw)).toEqual({ start, end }),
);
it.each([
  "31 Feb 2027",
  "Summer 2027",
  "2-1 Dec 2026",
  "May 2027",
  "2026-02-29",
])("rejects ambiguous/impossible dates %s", (s) =>
  expect(parseDates(s)).toBeNull(),
);
it("uses Saigon midnight", () =>
  expect(localDay(new Date("2026-11-17T17:01:00Z"))).toBe("2026-11-18"));
it.each([
  "Stock Market Traders Expo",
  "Greeting-card workshop",
  "Friday Night Magic: The Gathering",
  "Pokémon weekly league night",
  "Figure Skating Expo",
  "Furniture Show",
])("rejects %s", (s) => expect(relevance(s)).toBeLessThan(0.5));
it.each([
  "Trading Card Show",
  "Anime Fest",
  "Pokémon weekly tournament at the vendor expo",
  "Amazing Toy Show",
])("keeps %s", (s) => expect(relevance(s)).toBeGreaterThanOrEqual(0.5));

it.each([
  ["[Postponed] Card Expo", null, "postponed"],
  ["Cancelled: Card Expo", null, "cancelled"],
  ["Card Expo – Event cancelled", null, "cancelled"],
  ["Card Expo has been canceled", null, "cancelled"],
  ["Card Expo has been postponed", null, "postponed"],
  ["Card Expo (Postponed to March 2027)", null, "postponed"],
  ["Card Expo postponed until further notice", null, "postponed"],
  ["Card Expo", "Event has been postponed", "postponed"],
  ["Card Expo", "TBC - postponed", "postponed"],
])("reads an event status from %s / %s", (name, date, kind) => {
  expect(scheduleNotice(name!, date)).toMatchObject({ name: "Card Expo", kind });
});

it.each([
  ["Card Expo with cancelled workshops", "12 Dec 2026"],
  ["Card Expo – postponed activities", null],
  ["Card Expo", "Concert postponed"],
  ["Card Expo", "TBC"],
])("leaves an ordinary listing alone: %s / %s", (name, date) => {
  expect(scheduleNotice(name!, date)).toBeNull();
});

it.each([
  "30 Dec - 2 Jan 2027",
  "Dec 30 - Jan 2 2027",
])("infers the start year of %s", (raw) => {
  expect(parseDates(raw)).toEqual({ start: "2026-12-30", end: "2027-01-02" });
});

it("reads a postponed date field from the SGCC details block before requiring dates", async () => {
  const source = sources.find((s) => s.id === "sgcc")!;
  const result = await scanSource(source, async () => fixture("sgcc-postponed"), new Date("2026-11-21"));
  expect(result.stats).toMatchObject({ status: "OK", dropped_as_junk: 0 });
  expect(result.notices[0]).toMatchObject({
    name: "Singapore Comic Con", event_status: "postponed", date_status: "estimated",
    estimated_month: "2027-03", date_note: "Postponed to March 2027",
  });
});

it.each([
  ["afa", "27 – 29 November 2026 <span> FRI – SUN </span>", "Event has been postponed"],
  ["magic", "December 4–6, 2026", "Postponed"],
  ["oz-comic-con", "SEPTEMBER 18 &amp; 19 2027", "TBC - postponed"],
  ["jump-festa", "2026年12月19日(土)・12月20日(日)", "Postponed"],
  ["sg-card-show", "12th - 13th December 2026", "Event has been postponed"],
  ["suntec", '<div class="eventlist-datetag-status"></div>', '<div class="eventlist-datetag-status">Postponed</div>'],
  ["hkcec", "11/12/2026", "Postponed"],
])("emits a notice when %s publishes a status in its date field", async (id, before, after) => {
  const source = sources.find((s) => s.id === id)!;
  const html = fixture(id).replaceAll(before, after);
  expect(html).not.toBe(fixture(id));
  const result = await scanSource(source, async () => html, new Date("2026-11-21"));
  expect(result.notices).toContainEqual(expect.objectContaining({ name: samples[id][0], event_status: "postponed" }));
});

it("ignores cancellations mentioned in a show description", async () => {
  const source = sources.find((s) => s.id === "sg-card-show")!;
  const html = fixture(source.id).replace("We take special care", "Postponed activities include the preview night. We take special care");
  const result = await scanSource(source, async () => html, new Date("2026-11-21"));
  expect(result.notices).toEqual([]);
  expect(result.events[0].start_date).toBe("2026-12-12");
});

it.each(["oz-comic-con", "sg-card-show"])("keeps %s scheduled when a separate activity is cancelled", async (id) => {
  const source = sources.find((s) => s.id === id)!;
  const result = await scanSource(source, async () => fixture(id), new Date("2026-11-21"));
  expect(result.notices).toEqual([]);
  expect(result.events[0]).toMatchObject({ name: samples[id][0], start_date: samples[id][1], date_status: "confirmed" });
});

it.each([
  ["afa", "27 – 29 November 2026", "27 – 29 November 2026 (Cancelled)"],
  ["hkcec", "- 13/12/2026", "- 13/12/2026<br/>Cancelled"],
])("matches a %s cancellation after the full date range", async (id, before, after) => {
  const source = sources.find((s) => s.id === id)!;
  const get = (html: string) => scanSource(source, async () => html, new Date("2026-11-21"));
  const previous = await get(fixture(id));
  const current = await get(fixture(id).replace(before, after));
  expect(current.notices[0]).toMatchObject({ name: samples[id][0], originalStart: samples[id][1], event_status: "cancelled" });
  expect(merge(previous.events, current.events, "2026-11-21", undefined, [], current.notices).events[0])
    .toMatchObject({ name: samples[id][0], start_date: samples[id][1], event_status: "cancelled" });
});

async function scanFixture(id: string, html = fixture(id)) {
  const source = sources.find((s) => s.id === id)!;
  return scanSource(source, async () => html, new Date("2026-11-21"));
}
it.each([
  ["sgcc", '<div class="wixui-rich-text"><p>Dates - Cancelled: Friday cosplay workshop</p></div>' + fixture("sgcc")],
  ["sg-card-show", fixture("sg-card-show").replace("13th December 2026", "13th December 2026 (cancelled meet-and-greet)")],
])("keeps the published %s dates when an activity is cancelled in the schedule area", async (id, html) => {
  const result = await scanFixture(id, html);
  expect(result.stats.status).toBe("OK");
  expect(result.notices).toEqual([]);
  expect(result.events[0].start_date).toBe(samples[id][1]);
});

it.each([
  ["sgcc", "5 - 6 December 2026", "5 - 6 December 2026 (Cancelled)", "Singapore Comic Con"],
  ["sg-card-show", "13th December 2026</span>", '13th December 2026</span><span class="color_36">Event cancelled</span>', "Singapore Card Show 2026"],
  ["bandai", "December 12-13, 2026", "December 12-13, 2026<br/>Cancelled", "BANDAI CARD GAMES Fest 26-27 in Kuala Lumpur"],
  ["oz-comic-con", "SEPTEMBER 18 &amp; 19 2027 | SYDNEY SHOWGROUND", "Postponed until further notice", "Oz Comic-Con Sydney"],
])("updates the retained %s edition from its schedule element", async (id, before, after, name) => {
  const previous = await scanFixture(id);
  const current = await scanFixture(id, fixture(id).replace(before, after));
  const old = previous.events.find((e) => e.name === name)!;
  const result = merge(previous.events, current.events, "2026-11-21", undefined, [], current.notices);
  const postponed = id === "oz-comic-con";
  expect(result.applied).toHaveLength(1);
  if (!postponed) expect(result.applied[0].originalStart).toBe(old.start_date);
  expect(result.events.find((e) => e.id === old.id)).toMatchObject({
    event_status: postponed ? "postponed" : "cancelled", start_date: postponed ? null : old.start_date,
  });
});

it.each([
  ["bandai", "December 12-13, 2026", "December 12-13, 2027 (Cancelled)"],
  ["suntec", "Nexus Collectibles Arca 2027", "Friday workshop (Cancelled)"],
])("rejects a %s key match contradicted by the edition date or subject", async (id, before, after) => {
  const prior = await scanFixture(id);
  const current = await scanFixture(id, fixture(id).replace(before, after));
  const result = merge(prior.events, [], "2026-11-21", undefined, [], current.notices);
  expect(current.notices).toHaveLength(1);
  expect(result.unmatched).toEqual(current.notices);
  expect(result.applied).toEqual([]);
  expect(result.events).toEqual(expect.arrayContaining(prior.events));
});

it("reports a conflicting Suntec card as partial and keeps the other card", async () => {
  const result = await scanFixture("suntec", fixture("suntec").replace('datetag-status"></div>', 'datetag-status">Postponed or cancelled</div>'));
  expect(result.stats).toMatchObject({ status: "PARTIAL", fetched: 2, relevant: 1, reason: expect.stringContaining("Conflicting") });
  expect(result.events.map((e) => e.name)).toEqual(["Asia Comic Expo 005"]);
  expect(result.notices).toEqual([]);
});

it("preserves Supanova's undated postponement through a blank owner re-listing", async () => {
  const html = fixture("supanova");
  const prior = await scanFixture("supanova");
  const notice = await scanFixture("supanova", html.replace("April 10-11, 2027", "Postponed"));
  const blank = await scanFixture("supanova", html.replace("April 10-11, 2027", ""));
  const postponed = merge(prior.events, [], "2026-11-21", undefined, [], notice.notices).events;
  expect(postponed[0].event_status).toBe("postponed");
  const result = merge(postponed, blank.events, "2026-11-21");
  expect(result.events).toEqual(postponed);
  expect(result.known.supanova).toBe(1);
});

it("retains conflicting Supanova cards for ambiguity reporting in either feed order", async () => {
  const html = fixture("supanova");
  const original = await scanFixture("supanova");
  const cards = [" (Cancelled)", " (Postponed)"].map((suffix) => html.replace("Gold Coast</h2>", "Gold Coast" + suffix + "</h2>"));
  for (const feed of [cards, [...cards].reverse()]) {
    const current = await scanFixture("supanova", feed.join(""));
    const merged = merge(original.events, [], "2026-11-21", undefined, [], current.notices);
    expect(merged.unmatched).toHaveLength(2);
    expect(merged.events).toEqual(original.events);
  }
});
