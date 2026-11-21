import { scheduleField } from "../listing.ts";
import { parseDates } from "../dates.ts";
import { clean, document, required, urlOf } from "../html.ts";
import { type RawFind, type Source } from "../types.ts";
const url = "https://www.bandaicardgames-fest.com/26-27/en/";
const locations: Record<string, string> = {
  Jakarta: "ID",
  Manila: "PH",
  Bangkok: "TH",
  "Hong Kong S.A.R.": "HK",
  Singapore: "SG",
  "Kuala Lumpur": "MY",
  Taipei: "TW",
  Shanghai: "CN",
  Tokyo: "JP",
};
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const series = required(
    $("title")
      .text()
      .match(/BANDAI CARD GAMES Fest [\d-]+/i)?.[0],
    "Bandai series",
  );
  const cards = $(".locationListBox a");
  if (!cards.length) throw Error("Missing Bandai city schedule");
  return cards.toArray().flatMap((el) => {
    const card = $(el);
    const place = clean(card.find(".place").text());
    if (!locations[place]) return [];
    const city = place.replace(" S.A.R.", "");
    const dates: string[] = [];
    for (const line of card.find(".date").text().split(/\n+/).map(clean).filter(Boolean)) {
      if (!dates.length || parseDates(scheduleField(line).date)) dates.push(line);
      else dates[dates.length - 1] += " " + line;
    }
    return dates
      .map((date) => ({
        name: series + " in " + city,
        code: locations[place],
        city,
        date: clean(date),
        website: urlOf(card.attr("href"), url),
        event_type: "Official play",
        organizer: "Bandai",
      }));
  });
}
export function parseDetail(html: string) {
  const $ = document(html);
  const venue =
    clean(
      $("h5")
        .filter((_, e) => clean($(e).text()) === "VENUE")
        .next("p")
        .text(),
    ) || null;
  const titles = $(".js_btnGnMenuBtn")
    .filter((_, a) => clean($(a).text()) === "TITLES")
    .next(".navchildMenu");
  const games = [
    ...new Set(
      titles
        .find("a[href]")
        .toArray()
        .map((a) => clean($(a).text()))
        .filter(Boolean),
    ),
  ];
  return { venue, games };
}
export default {
  id: "bandai",
  name: "BANDAI CARD GAMES Fest",
  url,
  async run(ctx) {
    const finds = parse(await ctx.get(url));
    // The Singapore detail page publishes a single English venue for this stop.
    const sg = finds.find((f) => f.code === "SG");
    if (sg?.website) {
      try {
        Object.assign(sg, parseDetail(await ctx.get(sg.website)));
      } catch (error) {
        ctx.warn(`Singapore detail: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return finds;
  },
} satisfies Source;
