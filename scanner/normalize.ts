import { normalizeEvents } from "../src/data.ts";
import type { Event } from "../src/model.ts";
import type { RawFind, Source } from "./types.ts";
import { parseDates } from "./dates.ts";
import { relevance, fold } from "./relevance.ts";

const countries: Record<string, string> = {
  SG: "Singapore",
  HK: "Hong Kong",
  MY: "Malaysia",
  TH: "Thailand",
  ID: "Indonesia",
  VN: "Vietnam",
  AE: "United Arab Emirates",
  BH: "Bahrain",
  KW: "Kuwait",
  SA: "Saudi Arabia",
  OM: "Oman",
  QA: "Qatar",
  PH: "Philippines",
  TW: "Taiwan",
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  AU: "Australia",
  NZ: "New Zealand",
  IN: "India",
};
export function slug(name: string) {
  return fold(name)
    .replace(/[^\p{L}\d]+/gu, "-")
    .replace(/^-|-$/g, "");
}
export function normalize(
  raw: RawFind,
  source: Source,
  discovered: string,
): Event {
  const { code, name, date, evidence, page = source.url, ...fields } = raw;
  const dates = parseDates(date);
  if (date && !dates && !raw.date_status)
    throw Error(`Unrecognized date "${date}" for ${name}`);
  const status = raw.date_status ?? (dates ? "confirmed" : "tba");
  const estimated = status === "estimated" ? raw.estimated_month : null;
  if (
    !name.trim() ||
    !countries[code] ||
    (status === "confirmed" && !dates) ||
    (status === "estimated" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(estimated ?? ""))
  )
    throw Error(`Invalid find: ${name}`);
  const start = status === "confirmed" ? dates!.start : null;
  const level = ["SG", "HK"].includes(code)
    ? "top"
    : code === "MY"
      ? "high"
      : null;
  const region = ["SG", "HK", "MY", "TH", "ID", "VN"].includes(code)
    ? "SEA/HK"
    : code === "AE"
      ? "UAE"
      : ["BH", "KW", "SA", "OM", "QA"].includes(code)
        ? "GCC (other)"
        : "Other";
  const visitors = raw.visitors;
  const size =
    visitors == null
      ? null
      : visitors >= 30000
        ? "XL"
        : visitors >= 10000
          ? "L"
          : visitors >= 2000
            ? "M"
            : "S";
  const website = raw.website ?? page;
  const source_urls = [...new Set([page, website])];
  for (const u of source_urls)
    if (!["http:", "https:"].includes(new URL(u).protocol))
      throw Error(`Invalid event URL: ${u}`);
  const edition = name.match(/\b(\d+)(?:st|nd|rd|th) edition\b/i);
  const result = normalizeEvents([
    {
      ...fields,
      name,
      id: `scan-${source.id}-${slug(name)}-${(start ?? estimated)?.slice(0, 7).replace("-", "") ?? "tba"}`,
      country_code: code,
      country: countries[code],
      region_group: region,
      priority_market: !!level,
      priority_market_level: level,
      start_date: start,
      end_date: start ? dates!.end : null,
      estimated_month: estimated,
      date_note: date,
      date_status: status,
      section: status === "tba" ? "watchlist" : "timeline",
      event_type:
        raw.event_type ??
        (/card\s?show|trading card|tcg|nexus collectibles/i.test(name)
          ? "Card show"
          : /fair/i.test(name)
            ? "Trade fair"
            : "Pop-culture con"),
      previous_editions: raw.previous_editions ?? edition?.[0],
      previous_editions_count:
        raw.previous_editions_count ?? (edition ? +edition[1] - 1 : null),
      description:
        raw.description ??
        `${source.name} lists ${name}${raw.venue ? " at " + raw.venue : raw.city && !fold(name).includes(fold(raw.city)) ? " in " + raw.city : ""}.`,
      size_tier: raw.size_tier ?? size,
      games: raw.games ?? [],
      website,
      source_urls,
      vendor_score: null,
      logo: null,
      source: {
        id: source.id,
        name: source.name,
        url: page,
        discovered_at: discovered,
        confidence: start ? 0.95 : 0.5,
        relevance: relevance(name, evidence),
      },
      is_new_find: true,
      verification: "unverified",
    },
  ])[0];
  delete result.occurrences;
  return result;
}
