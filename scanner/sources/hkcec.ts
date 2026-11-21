import { clean, document } from "../html.ts";
import { venueParser, type Card } from "../venue.ts";
import type { Source, RawFind } from "../types.ts";
const url = "https://www.hkcec.com/en/event-calendar";
function fields(c: Card) {
  const text = c.find(".event-title").text().trim();
  // A range can share the title line or start after a line break. Keep any
  // subsequent status line in the date field along with that original range.
  const numericDate = /\d{2}\/\d{2}\/\d{4}/;
  const lines = text.replace(numericDate, "\n$&").split(/\n/).map(clean).filter(Boolean);
  const split = lines.findIndex((line, i) => i > 0 && (numericDate.test(line) || /^(?:event |TBC - )?(?:cancell?ed|postponed)\b/i.test(line)));
  if (split < 0) return { name: text, date: "" };
  return { name: lines.slice(0, split).join(" "), date: lines.slice(split).join(" ") };
}
export const parse = venueParser({
  url,
  venue: "Hong Kong Convention and Exhibition Centre",
  city: "Wan Chai",
  code: "HK",
  cards: ".event-table",
  title: (c) => fields(c).name,
  date: (c) => fields(c).date,
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
