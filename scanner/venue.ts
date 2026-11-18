import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { clean, document, urlOf } from "./html.ts";
import type { RawFind } from "./types.ts";

export type Card = Cheerio<AnyNode>;
interface Venue {
  url: string;
  venue: string;
  city: string;
  code: string;
  cards: string;
  title: (card: Card) => string;
  date: (card: Card) => string;
  details?: (card: Card) => Partial<RawFind>;
  website: string;
}
export function venueParser(config: Venue) {
  return (html: string, page = config.url): RawFind[] => {
    const $ = document(html);
    const cards = $(config.cards);
    if (!cards.length) throw Error(`Missing calendar cards at ${page}`);
    return cards.toArray().map((el) => {
      const card = $(el);
      return {
        city: config.city,
        code: config.code,
        venue: config.venue,
        page,
        name: clean(config.title(card)),
        date: clean(config.date(card)),
        website: urlOf(card.find(config.website).first().attr("href"), page),
        ...config.details?.(card),
      };
    });
  };
}
