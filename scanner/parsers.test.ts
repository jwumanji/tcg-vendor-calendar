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
