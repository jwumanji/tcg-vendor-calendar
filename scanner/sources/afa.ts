import { document, required, urlOf } from "../html.ts";
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
      .trim()
      .split("\n")[0];
  const booth = $(".et_pb_promo").filter((_, el) =>
    /exhibitor applications are open/i.test($(el).text()),
  );
  return [
    {
      name: required(fact("EVENT NAME"), "event name"),
      date: required(fact("DATES").match(/^.*?20\d\d/)?.[0], "dates"),
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
