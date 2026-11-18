import { venueParser } from "../venue.ts";
import { pageSource } from "../types.ts";
const url = "https://www.singaporeexpo.com.sg/events-at-expo/";
export const parse = venueParser({
  url,
  venue: "Singapore EXPO",
  city: "Singapore",
  code: "SG",
  cards: ".expo-event",
  title: (c) => c.find("h3").text(),
  date: (c) => c.find(".expo-icon-label").first().text(),
  website: ".event-btn-primary",
  details: (c) => ({
    venue: ["Singapore EXPO", c.find(".expo-icon-label").eq(1).text().trim()]
      .filter(Boolean)
      .join(", "),
  }),
});
export default pageSource("sg-expo", "Singapore EXPO", url, parse);
