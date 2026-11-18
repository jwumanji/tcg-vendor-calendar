import { clean, document, link, required } from "../html.ts";
import { scheduleNotice } from "../listing.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://www.sgcardshow.com/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const text = $("p,h1,h2,h3")
    .toArray()
    .map((el) => clean($(el).text()))
    .join("\n");
  const name = required(
    text.match(/About the Event:\s*(Singapore Card Show[^\n]*)/i)?.[1],
    "event name",
  );
  const notice = text.split("\n").find((s) => /^(?:event )?(?:cancelled|canceled|postponed)\b/i.test(s));
  const date = notice ?? (scheduleNotice(name, null) ? null : required(
    text
      .split("\n")
      .find((s) => /^\d\d?(st|nd|rd|th)?\s*[-–].*20\d\d$/i.test(s)),
    "show date",
  ));
  const venue = text.match(/Singapore Expo Hall[^\n]*/i)?.[0];
  const vendors = text.match(
    /Expected Number of Vendors:\s*([\d,]+(?: and counting|\+)?)/i,
  )?.[1];
  const visitors = text.match(
    /Expected Number of Visitors:\s*([\d,]+(?:\s*[-–]\s*[\d,]+)?)/i,
  )?.[1];
  const lowerBound = (s?: string) =>
    s ? parseInt(s.replaceAll(",", ""), 10) : null;
  const past = [
    ...new Set(
      $("a[href]")
        .toArray()
        .map((a) => clean($(a).text()))
        .filter((t) => /^SGCardShow (?:[A-Za-z]+ )?20\d\d$/i.test(t)),
    ),
  ];
  return [
    {
      previous_editions: past.length
        ? "Past editions listed: " + past.join(", ")
        : null,
      previous_editions_count: past.length || null,
      name,
      date,
      venue,
      code: "SG",
      city: "Singapore",
      event_type: "Card show",
      vendor_count: lowerBound(vendors),
      visitors: lowerBound(visitors),
      expected_size:
        [
          visitors && `${visitors} expected visitors`,
          vendors && `${vendors} expected vendors`,
        ]
          .filter(Boolean)
          .join(", ") || null,
      vendor_application:
        link($, /^Ala-Carte Booking Form$/i, url) ??
        link($, /^Vendor applications$/i, url),
      vendor_booths: /we have booths selling/i.test(text)
        ? "Yes, booths for TCG, sports cards and collectibles."
        : null,
      booth_detail:
        text.match(/All applicants will be limited[^.]*\./i)?.[0] ?? null,
    },
  ];
}
export default pageSource("sg-card-show", "Singapore Card Show", url, parse);
