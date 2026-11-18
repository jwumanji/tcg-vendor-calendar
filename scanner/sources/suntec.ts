import { clean, urlOf } from "../html.ts";
import { venueParser } from "../venue.ts";
import { pageSource } from "../types.ts";
const url = "https://www.suntecsingapore.com/visit-events";
export const parse = venueParser({
  url,
  venue: "Suntec Singapore Convention & Exhibition Centre",
  city: "Singapore",
  code: "SG",
  cards: ".eventlist-event--upcoming",
  title: (c) => c.find(".eventlist-title").text(),
  website: ".eventlist-title-link",
  date: (c) =>
    c
      .find("time.event-date")
      .toArray()
      .map((t) => t.attribs.datetime)
      .join(" / "),
  details: (c) => {
    const paragraphs = c.find(".eventlist-description p");
    const venue = clean(
      paragraphs
        .filter((i) => /^Venue:/i.test(clean(paragraphs.eq(i).text())))
        .first()
        .text(),
    ).replace(/^Venue:\s*/i, "");
    const anchor = paragraphs
      .filter((i) => /^Event Website:/i.test(clean(paragraphs.eq(i).text())))
      .find("a")
      .first();
    const page =
      urlOf(c.find(".eventlist-title-link").attr("href"), url) ?? url;
    return {
      page,
      website: urlOf(anchor.attr("href"), url) ?? page,
      venue: venue || "Suntec Singapore Convention & Exhibition Centre",
      vendor_booths: /booths from local card shops and vendors/i.test(
        c.find(".eventlist-description").text(),
      )
        ? "Yes, local card shops and vendors."
        : null,
    };
  },
});
export default pageSource("suntec", "Suntec Singapore", url, parse);
