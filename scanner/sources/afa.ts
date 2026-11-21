import { titleSubject } from "../listing.ts";
import { clean, document, required, urlOf } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://animefestival.asia/afasg26/";
export function parse(html: string): RawFind[] {
  const $ = document(html);
  const fact = (label: string) =>
    $(".et_pb_blurb_container")
      .filter(
        (_, e) => $(e).find(".et_pb_module_header").text().trim() === label,
      )
      .find(".et_pb_blurb_description")
      .first()
      .text()
      .trim();
  const booth = $(".et_pb_promo").filter((_, el) =>
    /exhibitor applications are open/i.test($(el).text()),
  );
  const name = required(fact("EVENT NAME"), "event name");
  const date = clean(fact("DATES").replace(/\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s*[-–]\s*(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b/gi, ""));
  if (titleSubject(name) === name) required(date, "dates");
  return [
    {
      name,
      date,
      venue: fact("VENUE") || null,
      city: "Singapore",
      code: "SG",
      event_type: "Pop-culture con",
      vendor_application: urlOf(
        booth.find("a[href]").first().attr("href"),
        url,
      ),
      vendor_booths: booth.length
        ? "Yes, exhibitor applications advertised."
        : null,
    },
  ];
}
export default pageSource("afa", "Anime Festival Asia", url, parse);
