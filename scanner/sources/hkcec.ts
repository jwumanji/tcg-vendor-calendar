import { clean, document } from "../html.ts";
import { venueParser } from "../venue.ts";
import type { Source, RawFind } from "../types.ts";
const url = "https://www.hkcec.com/en/event-calendar";
export const parse = venueParser({
  url,
  venue: "Hong Kong Convention and Exhibition Centre",
  city: "Wan Chai",
  code: "HK",
  cards: ".event-table",
  title: (c) =>
    c
      .find(".event-title")
      .text()
      .split(/\d{2}\/\d{2}\/\d{4}/)[0],
  date: (c) =>
    c
      .find(".event-title")
      .text()
      .match(/\d{2}\/\d{2}\/\d{4}[\s\S]*$/)?.[0] ?? "",
  website: ".event_img",
  details: (c) => ({
    organizer: clean(c.find(".event-organiser").first().text()) || null,
    contact: clean(c.find(".event-email").first().text()) || null,
  }),
});
export default {
  id: "hkcec",
  name: "HKCEC",
  url,
  async run(ctx) {
    const finds: RawFind[] = [];
    const seen = new Set<string>();
    let page = url;
    while (page) {
      if (seen.has(page) || seen.size >= 50)
        throw Error("Unexpected HKCEC pagination");
      seen.add(page);
      const html = await ctx.get(page);
      finds.push(...parse(html, page));
      const next = document(html)(".pager a[rel=next]").attr("href");
      page = next ? new URL(next, page).href : "";
      if (page && !page.startsWith(url + "?"))
        throw Error("Unexpected HKCEC pagination URL");
    }
    return finds;
  },
} satisfies Source;
