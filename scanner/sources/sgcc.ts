import { titleSubject } from "../listing.ts";
import { clean, document, required, link } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://www.singaporecomiccon.com/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const headings = $("h1,h2").toArray().map((el) => clean($(el).text()));
  const edition = /^Singapore Comic Con(?: 20\d\d)?$/i;
  const name = headings.find((heading) => heading !== titleSubject(heading) && edition.test(titleSubject(heading))) ??
    headings.find((heading) => edition.test(heading)) ?? "Singapore Comic Con";
  const blocks = $(".wixui-rich-text").toArray().map((e) => clean($(e).text()));
  const facts = blocks.find((t) => /^Dates\s*[-:]/i.test(t) && /Venue:/i.test(t)) ?? "";
  const field = facts.replace(/^Dates\s*[-:]\s*/i, "").split(/Venue:|Opening Hours:/i)[0].trim();
  const preview = field.match(/(\d{1,2} [A-Za-z]+ 20\d\d): Ultimate Preview Night/i)?.[1];
  const main = field.match(/(\d{1,2}\s*[-–]\s*\d{1,2} [A-Za-z]+ 20\d\d)(.*)$/i);
  const date = preview && main
    ? preview + " - " + main[1].split(/[-–]/)[1].trim() + main[2]
    : field;
  if (titleSubject(name) === name) required(date, "convention dates");
  const application = link($, /^Exhibit with Us$/i, url);
  return [
    {
      name,
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
