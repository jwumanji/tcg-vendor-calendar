import { parseDates } from "../dates.ts";
import { titleSubject } from "../listing.ts";
import { clean, document, link, required } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://ozcomiccon.com/sydney/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const headings = $(".elementor-heading-title").toArray().map((el) => clean($(el).text()));
  const edition = /^Oz Comic-Con Sydney(?: 20\d\d)?$/i;
  const titles = headings.filter((heading) => /\bOz Comic-Con Sydney\b/i.test(heading));
  const name = titles.find((heading) => heading !== titleSubject(heading) && edition.test(titleSubject(heading))) ??
    titles.find((heading) => edition.test(heading)) ?? "Oz Comic-Con Sydney";
  const headingsWithScheduleStyle = $(".elementor-heading-title.elementor-size-default").toArray()
    .map((el) => clean($(el).text()));
  const schedule = headingsWithScheduleStyle.find((field) => /\|\s*Sydney Showground$/i.test(field)) ??
    headingsWithScheduleStyle.find((field) => field.includes("|") && parseDates(field.split("|")[0])) ??
    headingsWithScheduleStyle.find((field) => /^(?:event |TBC - )?(?:postponed|cancell?ed)\b/i.test(field));
  const [date, venue] = (schedule ?? "").split("|").map(clean);
  if (titleSubject(name) === name) required(date, "Sydney dates and venue");
  const application = link($, /^Exhibitor Expression of Interest$/i, url);
  return [
    {
      name,
      date,
      venue,
      code: "AU",
      city: "Sydney",
      event_type: "Pop-culture con",
      vendor_application: application,
      vendor_booths: application
        ? "Yes, exhibitor expressions of interest."
        : null,
    },
  ];
}
export default pageSource("oz-comic-con", "Oz Comic-Con", url, parse);
