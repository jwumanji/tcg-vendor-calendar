import { titleSubject } from "../listing.ts";
import { clean, document, link } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://www.supanova.com.au/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const application = link($, /^exhibitors$/i, url);
  const cities = $(".location-name .wpb_text_column h2");
  if (!cities.length) throw Error("Missing Supanova schedule");
  const finds = new Map<string, RawFind>();
  for (const el of cities) {
    const title = clean($(el).text());
    const place = titleSubject(title);
    const city = place.replace(/\s+20\d\d$/, "");
    const rows = $(el).siblings("p");
    const date = clean(rows.first().text());
    finds.set(JSON.stringify([title, date, clean(rows.eq(1).text())]), {
      name: title.replace(place, () => "Supanova Comic Con & Gaming – " + place),
      code: "AU",
      city,
      date,
      venue: clean(rows.eq(1).text()) || null,
      organizer: "Supanova",
      event_type: "Pop-culture con",
      vendor_application: application,
      vendor_booths: application ? "Yes, exhibitor portal." : null,
    });
  }
  return [...finds.values()];
}
export default pageSource(
  "supanova",
  "Supanova Comic Con & Gaming",
  url,
  parse,
);
