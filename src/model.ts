export interface EventSource {
  /** Scraper module id, e.g. "sg-expo". */
  id: string;
  name: string;
  /** Public page the event was found on. */
  url: string;
  /** ISO timestamp of the first scan that found it. */
  discovered_at: string;
  /** 0-1: how sure the scraper is that the parsed fields are right. */
  confidence: number | null;
  /** 0-1: how relevant the event is to a TCG vendor. */
  relevance: number | null;
}
export interface Event {
  id: string;
  name: string;
  games: string[];
  games_note: string | null;
  section: "timeline" | "recurring_sg" | "watchlist";
  start_date: string | null;
  end_date: string | null;
  date_status: "confirmed" | "estimated" | "tba";
  date_note: string | null;
  estimated_month: string | null;
  occurrences?: { start_date: string; end_date: string }[];
  city: string | null;
  country: string | null;
  country_code: string | null;
  venue: string | null;
  region_group: string | null;
  organizer: string | null;
  event_type: string;
  expected_size: string | null;
  size_note: string | null;
  size_tier: string | null;
  size_tier_estimated: boolean;
  visitors: number | null;
  vendor_count: number | null;
  previous_editions: string | null;
  previous_editions_count: number | null;
  first_year: string | null;
  vendor_booths: string | null;
  vendor_application: string | null;
  vendor_deadline: string | null;
  vendor_cost: string | null;
  booth_detail: string | null;
  contact: string | null;
  vendor_score: number | null;
  shortlist_priority: number | null;
  priority_market: boolean;
  priority_market_level: string | null;
  website: string | null;
  instagram: string | null;
  instagram_followers: number | null;
  source_urls: string[];
  description: string | null;
  audience: string | null;
  fit: string | null;
  logo: string | null;
  logo_kind: string | null;
  /** Present only on events found by a scraper (never on Scanner events). */
  source?: EventSource | null;
  /** True for scraper finds that no Scanner entry matched. */
  is_new_find?: boolean;
  verification?: "scanner" | "unverified";
}
export interface Filters {
  search: string;
  countries: string[];
  games: string[];
  priority: string;
  size: string;
  from: string;
  to: string;
  tba: boolean;
  score: number;
  going: boolean;
  newOnly: boolean;
  minTier: "any" | "strong" | "must";
  status: string;
  stages: import("./storage").Stage[];
}
export const emptyFilters: Filters = {
  search: "",
  countries: [],
  games: [],
  priority: "any",
  size: "",
  from: "",
  to: "",
  tba: true,
  score: 0,
  going: false,
  newOnly: false,
  minTier: "any",
  status: "",
  stages: [],
};
