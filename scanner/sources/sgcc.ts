import { clean, document, required, link } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://www.singaporecomiccon.com/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const text = $(".wixui-rich-text")
    .toArray()
    .map((e) => clean($(e).text()))
    .join("\n");
  const facts = required(
    text.split("\n").find((t) => /Dates\s*-.*Venue:/i.test(t)),
    "event details",
  );
  const main = required(
    facts.match(/(\d{1,2}\s*[-–]\s*\d{1,2} [A-Za-z]+ 20\d\d)/)?.[1],
    "convention dates",
  );
  const preview = facts.match(
    /(\d{1,2} [A-Za-z]+ 20\d\d): Ultimate Preview Night/i,
  )?.[1];
  const date = preview ? preview + " - " + main.split(/[-–]/)[1].trim() : main;
  const application = link($, /^Exhibit with Us$/i, url);
  return [
    {
      name: "Singapore Comic Con",
      date,
      venue: facts.match(/Venue:\s*(.*?)\s*Opening Hours/i)?.[1],
      city: "Singapore",
      code: "SG",
      event_type: "Pop-culture con",
      vendor_application: application,
      vendor_booths: application ? "Yes, exhibitor enquiries." : null,
      description: preview
        ? `The convention opens with Ultimate Preview Night on ${preview}.`
        : null,
    },
  ];
}
export default pageSource("sgcc", "Singapore Comic Con", url, parse);
