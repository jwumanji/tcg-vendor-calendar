export interface EventSource {
  /** Scraper module id, e.g. "sg-expo". */
  id: string;
  name: string;
  /** Public page the event was found on. */
  url: string;
  /** ISO timestamp of the first scan that found it. */
  discovered_at: string;
  /** Published ranges of this edition before its first postponement. */
  original_dates?: { start_date: string; end_date: string }[];
  previous_dates?: { start_date: string; end_date: string }[];
  aliases?: string[];
  /** 0-1: how sure the scraper is that the parsed fields are right. */
  confidence: number | null;
  /** 0-1: how relevant the event is to a TCG vendor. */
  relevance: number | null;
}
export const outreachStatuses = ["not_contacted", "contacted", "replied", "quoted", "declined"] as const;
export const outreachMethods = ["email", "form", "instagram_dm", "other"] as const;
export const outreachContactTypes = ["email", "form", "DM", "none"] as const;
export type OutreachStatus = (typeof outreachStatuses)[number];
export type OutreachMethod = (typeof outreachMethods)[number];
export type OutreachContactType = (typeof outreachContactTypes)[number];

export interface Outreach {
  status: OutreachStatus;
  method: OutreachMethod | null;
  contact: string | null;
  contact_type: OutreachContactType | null;
  contacted_at: string | null;
  response_at: string | null;
  message_ref: string | null;
  quoted_price: string | null;
  notes: string;
  published_booth_price: string | null;
  price_source_url?: string | null;
  research_notes?: string;
}
export type OutreachPatch = Partial<Outreach>;
export const emptyOutreach: Outreach = {
  status: "not_contacted",
  method: null,
  contact: null,
  contact_type: null,
  contacted_at: null,
  response_at: null,
  message_ref: null,
  quoted_price: null,
  notes: "",
  published_booth_price: null,
};

export const milestoneTypes = ["booking_opens", "application_closes", "payment_due", "other"] as const;
export type MilestoneType = (typeof milestoneTypes)[number];

export interface VendorMilestone {
  /** Stable within an event, including when its booking date is corrected. */
  id: string;
  type: MilestoneType;
  /** ISO datetime with UTC offset, or YYYY-MM-DD when only the date is known. */
  at: string;
  timeZone: string;
  label: string;
  source: string;
  verified: boolean;
  notes?: string;
}

export interface Event {
  id: string;
  /** Scanner's ID when a replacement uses an existing planner ID to keep its history. */
  scanner_export_id?: string;
  name: string;
  games: string[];
  games_note: string | null;
  section: "timeline" | "recurring_sg" | "watchlist";
  start_date: string | null;
  end_date: string | null;
  event_status?: "cancelled" | "postponed";
  date_status: "confirmed" | "estimated" | "tba";
  date_note: string | null;
  estimated_month: string | null;
  original_start_date?: string;
  occurrences?: { start_date: string; end_date: string; original_start_date?: string }[];
  /** Display-only intersection with active filters. Published dates remain available for export. */
  visible_ranges?: { start_date: string; end_date: string }[];
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
  vendor_milestones?: VendorMilestone[];
  vendor_cost: string | null;
  booth_detail: string | null;
  contact: string | null;
  outreach?: Outreach | null;
  vendor_score: number | null;
  shortlist_priority: number | null;
  priority_market: boolean;
  priority_market_level: string | null;
  website: string | null;
  tickets?: string | null;
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
  verification?: "scanner" | "unverified" | "verified";
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
  notGoing: boolean;
  next90: boolean;
  newOnly: boolean;
  minTier: "any" | "strong" | "must";
  status: string;
  outreach: "" | "contacted" | "not_contacted";
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
  notGoing: false,
  next90: false,
  newOnly: false,
  minTier: "any",
  status: "",
  outreach: "",
  stages: [],
};
