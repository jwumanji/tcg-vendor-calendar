import { clean, document, urlOf } from "../html.ts";
import { pageSource, type RawFind } from "../types.ts";
const url = "https://magic.gg/events";
const cities: Record<string, string> = {
  Singapore: "SG",
  "Hong Kong": "HK",
  "Kuala Lumpur": "MY",
  Bangkok: "TH",
  Jakarta: "ID",
  Manila: "PH",
  Taipei: "TW",
  Tokyo: "JP",
  Seoul: "KR",
  Melbourne: "AU",
  Sydney: "AU",
  Auckland: "NZ",
  Dubai: "AE",
};
export function parse(html: string): RawFind[] {
  const $ = document(html);
  // Read visible schedule cards; titles and their date span share an anchor.
  const cards = $("a[href]").filter(
    (_, a) =>
      (/20\d\d/.test($(a).children("span").text()) ||
        /\b(?:cancell?ed|postponed)\b/i.test($(a).text())) &&
      $(a).children("div").length > 0,
  );
  if (!cards.length) throw Error("Missing Wizards event schedule");
  return cards.toArray().flatMap((el) => {
    const card = $(el);
    const name = clean(card.children("div").first().text());
    const city = Object.keys(cities).find((c) => name.includes(c));
    if (!city || !/CommandFest|MagicCon|Spotlight|MagicFest/i.test(name))
      return [];
    return [
      {
        name,
        date: clean(card.children("span").first().text()),
        code: cities[city],
        city,
        event_type: "Official play",
        games: ["Magic: The Gathering"],
        website: urlOf(card.attr("href"), url),
      },
    ];
  });
}
export default pageSource("magic", "Magic Play Events", url, parse);
