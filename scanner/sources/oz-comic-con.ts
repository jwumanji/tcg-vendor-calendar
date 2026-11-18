import { clean, document, link, required } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://ozcomiccon.com/sydney/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const info = required(
    $(".elementor-heading-title")
      .toArray()
      .map((el) => clean($(el).text()))
      .find((t) => /20\d\d\s*\|/.test(t)),
    "Sydney dates and venue",
  );
  const [date, venue] = info.split("|").map(clean);
  const application = link($, /^Exhibitor Expression of Interest$/i, url);
  return [
    {
      name: "Oz Comic-Con Sydney",
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
