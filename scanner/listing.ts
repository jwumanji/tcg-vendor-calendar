import type { Event } from "../src/model.ts";
import { fold } from "./relevance.ts";

// These parsers expose an edition-specific listing, booking form or detail URL.
// A calendar page, annual organizer homepage or social profile is shared.
export function listingKey(e: Event): string | null {
  const source = e.source;
  if (!source) return null;
  let key: string | null = null;
  switch (source.id) {
    case "sg-card-show":
      // The organizer reuses its homepage and can run several shows a year.
      if (e.vendor_application && URL.canParse(e.vendor_application))
        key = fold(e.name) + "|" + e.vendor_application;
      break;
    case "suntec":
      if (new URL(source.url).pathname.startsWith("/visit-events/")) key = source.url;
      break;
    case "sg-expo":
    case "bandai":
    case "magic":
      if (e.website && e.website !== source.url && new URL(e.website).pathname !== "/")
        key = e.website;
      break;
    case "afa":
      if (/\/afasg\d+\//i.test(source.url)) key = source.url;
      break;
    case "hkcec":
    case "jump-festa":
      if (/\b20\d\d\b/.test(e.name)) key = fold(e.name);
      break;
  }
  return key && JSON.stringify([source.id, e.country_code, e.city, key]);
}

export const noticeWord = /\b(?:cancelled|canceled|postponed)\b/i;
export function scheduleNotice(name: string, date: string | null) {
  // Only an explicit event status in its title or date field. Descriptions can
  // mention cancellations of individual activities or earlier editions.
  const title = name.match(/^(?:\[(cancelled|canceled|postponed)\]|(cancelled|canceled|postponed))\s*[:–—-]?\s+(.+)$/i)
    ?? name.match(/^(.+?)\s*[-–—:(\[]\s*(cancelled|canceled|postponed)\s*[)\]]?$/i);
  const dateStatus = date?.match(/^(?:event\s+)?(cancelled|canceled|postponed)\b/i);
  if (!title && !dateStatus) return null;
  const clean = title ? name.replace(/^\[?(?:cancelled|canceled|postponed)\]?\s*[:–—-]?\s+/i, "")
    .replace(/\s*[-–—:(\[]\s*(?:cancelled|canceled|postponed)\s*[)\]]?$/i, "").trim() : name;
  return { name: clean, note: (dateStatus ? date! : name).trim() };
}
