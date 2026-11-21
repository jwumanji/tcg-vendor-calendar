import { clean, document, link, required } from "../html.ts";
import { parseDates } from "../dates.ts";
import { scheduleField, titleSubject } from "../listing.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://www.sgcardshow.com/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const text = $("p,h1,h2,h3")
    .toArray()
    .map((el) => clean($(el).text()))
    .join("\n");
  const about = $("h1,h2,h3").filter((_, el) => /^About the Event:/i.test(clean($(el).text()))).first();
  const name = required(clean(about.text()).match(/^About the Event:\s*(.*Singapore Card Show.*)$/i)?.[1], "event name");
  // The organizer prints the date immediately above the venue in the same
  // schedule style. Activity announcements elsewhere on the page are unrelated.
  const lines = $("p.font_7:has(span.color_36)").toArray().map((el) =>
    clean($(el).clone().find("span").append(" ").end().text()));
  const venueIndex = lines.findIndex((line) => /^Singapore Expo Hall\b/i.test(line));
  const venue = lines[venueIndex] ?? null;
  const fields = venue ? lines.slice(0, venueIndex) : lines;
  const dated = fields.filter((line) => parseDates(scheduleField(line).date));
  let date = dated.length === 1 ? dated[0] : null;
  if (venue) {
    const last = fields.at(-1);
    if (last && date && fields.at(-2) === date && /^(?:event |has been |now )*(?:cancell?ed|postponed)\b/i.test(last))
      date += " " + last;
    else date ??= last ?? null;
  }
  if (titleSubject(name) === name) required(date, "show date");
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
