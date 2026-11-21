import type { Event } from "./model";

interface Location {
  country: string;
  countryCode: string;
  cities: string[];
  timeZone?: string;
}

const locations: Location[] = [
  { country: "Vietnam", countryCode: "VN", cities: ["Ho Chi Minh City", "Hanoi", "Da Nang"], timeZone: "Asia/Saigon" },
  { country: "Australia", countryCode: "AU", cities: ["Adelaide", "Brisbane", "Gold Coast", "Melbourne", "Perth", "Sydney"] },
  { country: "Bahrain", countryCode: "BH", cities: ["Manama"] },
  { country: "Hong Kong", countryCode: "HK", cities: ["Hong Kong"] },
  { country: "Indonesia", countryCode: "ID", cities: ["Jakarta", "Tangerang"] },
  { country: "Japan", countryCode: "JP", cities: ["Osaka", "Tokyo"] },
  { country: "Kuwait", countryCode: "KW", cities: ["Kuwait City", "Mishref"] },
  { country: "Malaysia", countryCode: "MY", cities: ["Johor Bahru", "Kuala Lumpur", "Penang", "Petaling Jaya", "Putrajaya", "Seri Kembangan"] },
  { country: "Philippines", countryCode: "PH", cities: ["Manila"] },
  { country: "Qatar", countryCode: "QA", cities: ["Doha", "Lusail"] },
  { country: "Saudi Arabia", countryCode: "SA", cities: ["Al Khobar", "Jeddah", "Riyadh"] },
  { country: "Singapore", countryCode: "SG", cities: ["Singapore"] },
  { country: "South Korea", countryCode: "KR", cities: ["Seoul"] },
  { country: "Taiwan", countryCode: "TW", cities: ["Taipei"] },
  { country: "Thailand", countryCode: "TH", cities: ["Bangkok"] },
  { country: "United Arab Emirates", countryCode: "AE", cities: ["Abu Dhabi", "Dubai"] },
];

const locationKey = (value: string) =>
  value.normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("đ", "d")
    .trim()
    .replace(/\s+/g, " ");

export const HOME_BASE_GROUPS = locations.map(({ cities, ...location }) => ({
  country: location.country,
  bases: cities.map((city) => ({
    ...location,
    city,
    id: `${location.countryCode.toLowerCase()}-${locationKey(city).replaceAll(" ", "-")}`,
  })),
}));
export const HOME_BASES = HOME_BASE_GROUPS.flatMap(({ bases }) => bases);

export type HomeBase = (typeof HOME_BASES)[number];
const baseById = new Map(HOME_BASES.map((base) => [base.id, base]));
export const DEFAULT_HOME_BASE = baseById.get("vn-ho-chi-minh-city")!;

export function findHomeBase(id: unknown) {
  return typeof id === "string" ? baseById.get(id) : undefined;
}

export function resolveHomeBase(id?: unknown) {
  return findHomeBase(id) ?? DEFAULT_HOME_BASE;
}

export function homeBaseLabel({ city, country }: HomeBase) {
  return city === country ? city : `${city}, ${country}`;
}

const cityAliases = new Map([
  ["hcmc", "ho chi minh city"],
  ["ho chi minh", "ho chi minh city"],
  ["saigon", "ho chi minh city"],
  ["sai gon", "ho chi minh city"],
  ["ha noi", "hanoi"],
  ["chek lap kok", "hong kong"],
  ["kai tak", "hong kong"],
  ["sha tin", "hong kong"],
  ["wan chai", "hong kong"],
  ["jakarta barat", "jakarta"],
]);
const countryByName = new Map(locations.map((loc) => [locationKey(loc.country), loc.countryCode]));
countryByName.set("viet nam", "VN");
const countryByCode = new Map(locations.map((loc) => [loc.countryCode, loc.country]));
const countryByCity = new Map(HOME_BASES.map((base) => [locationKey(base.city), base.countryCode]));
const unknownPlace = /^(?:tba|tbd|unknown|unspecified|n\/a|location (?:tba|tbd))\b/;

const southeastAsia = ["SG", "MY", "ID", "TH", "VN", "PH"];
const eastAsia = ["HK", "TW", "JP", "KR"];
const gulf = ["AE", "BH", "KW", "QA", "SA"];
const regions = [southeastAsia, eastAsia, gulf];
const eastAndSoutheastAsia = [...southeastAsia, ...eastAsia];
const travelBands = {
  local: { label: "Local", value: 1 },
  domestic: { label: "Domestic", value: 0.9 },
  regional: { label: "Regional international", value: 0.8 },
  easternAsia: { label: "East/Southeast Asia international", value: 0.6 },
  international: { label: "Other international", value: 0.3 },
};

export function estimateTravel(e: Pick<Event, "city" | "country" | "country_code">, homeBase: HomeBase) {
  // City fields can include organizer notes or a trailing country name.
  const place = e.city?.split("(", 1)[0].split(",") ?? [];
  const city = place[0]?.trim() ?? "";
  const cityKey = locationKey(city);
  const canonicalCity = cityAliases.get(cityKey) ?? cityKey;
  const countryName = e.country?.trim() ?? "";
  const countryKey = locationKey(countryName);
  const country = unknownPlace.test(countryKey) ? "" : countryName;
  const explicitCode = e.country_code?.trim().toUpperCase() ?? "";
  const trailingCountry = place.length > 1
    ? countryByName.get(locationKey(place.at(-1) ?? ""))
    : undefined;
  const code = (/^[A-Z]{2}$/.test(explicitCode) ? explicitCode : "") ||
    (country && (countryByName.get(countryKey) ?? country.toUpperCase())) ||
    trailingCountry ||
    countryByCity.get(canonicalCity);
  if (!code) return null;

  const sameCountry = code === homeBase.countryCode;
  const local = sameCountry && canonicalCity === locationKey(homeBase.city);
  const regional = regions.some((region) => region.includes(code) && region.includes(homeBase.countryCode));
  const withinEastAndSoutheastAsia = eastAndSoutheastAsia.includes(code) && eastAndSoutheastAsia.includes(homeBase.countryCode);
  const { label, value } = local ? travelBands.local
    : sameCountry ? travelBands.domestic
    : regional ? travelBands.regional
    : withinEastAndSoutheastAsia ? travelBands.easternAsia
    : travelBands.international;
  const destination = city && !unknownPlace.test(cityKey)
    ? city
    : country || countryByCode.get(code) || code;
  return {
    value,
    local,
    signal: `Travel from ${homeBaseLabel(homeBase)} to ${destination} (estimated: ${label})`,
  };
}
