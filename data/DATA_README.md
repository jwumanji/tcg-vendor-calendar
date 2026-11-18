# SEA + GCC TCG Vendor Event Calendar: data export

Exported from the Page **"SEA TCG Vendor Event Map 2027+"**
(https://cursor.com/canvas/store-881cd273-a134-4af7-b864-7cd0bb408369/a765aac3-3381-43d9-ae60-e72c275167d9).

- **Last updated:** 16 Nov 2026
- **Refresh:** the weekly scan refreshes the data every Monday at about 9:00 AM Asia/Saigon (UTC+7).
- **Files:** `events.json` (a JSON array with one object per event) and `logos/` (WebP event artwork in its reviewed aspect ratio).

## Counts (97 events)

| Section | Count | What it is |
|---|---|---|
| `timeline` | 78 | Main 2027 timeline: 34 confirmed, 35 estimated, 9 TBA |
| `recurring_sg` | 6 | Recurring smaller Singapore weekend shows with published 2027 dates (Cardian calendar) |
| `watchlist` | 13 | Not yet announced. The Page's grouped HK and MY rows are split into one entry per show. |

On the Page, seven watchlist rows only point back to timeline items: Sandbox Vol 9, FNDM, TCG Con Arabia, Comic Con Arabia / Bahrain Card Show / Geekend, AMAZING CARDNIVAL, the BANDAI Fests and the Pokémon Master Ball Leagues. Those are exported once, under `timeline`. One row is a "nothing found" research note (no Sharjah expo and similar); it is not an event and was not exported.

By country (all sections): Singapore 24, Hong Kong 15, Malaysia 15, Thailand 11, United Arab Emirates 10, Indonesia 9, Vietnam 3, Saudi Arabia 3, Qatar 2, Kuwait 1, Bahrain 1, and 3 region-wide or location-TBA watch items.

## Fields

Unknown values are `null`; nothing is invented.

- `id`, `name`
- `games`: array (split from `games_note`, the original text)
- `section`: `timeline`, `recurring_sg` or `watchlist`
- **Dates**
  - `start_date`, `end_date`: ISO `YYYY-MM-DD`. Set only for confirmed dates; `null` for estimated and TBA events.
  - `date_status`: `confirmed`, `estimated` or `tba`
  - `date_note`: the Page's date text, including the estimate basis (for example "Est. Mar 2027 (2026: 14–15 Mar)")
  - `estimated_month`: `YYYY-MM`, only when `date_status` is `estimated`. It is the expected month and should not be used as a booking date.
  - `occurrences`: for `recurring_sg` only; every 2027 date pair. `start_date`/`end_date` hold the first one.
- **Location**
  - `city`, `country`, `country_code` (ISO 3166-1 alpha-2), `venue`
  - `region_group`: `SEA/HK`, `UAE` or `GCC (other)`
- `organizer`, `event_type` (Card show, Official play, Pop-culture con, Trade fair)
- **Size**
  - `expected_size`: text with its source year (for example "20,000+ visitors and 100+ vendors at the Sep 2025 edition")
  - `size_note`: longer size text from the Page
  - `size_tier`: S (<2k visitors), M (2–10k), L (10–30k), XL (30k+)
  - `size_tier_estimated`: true when the tier is inferred from venue or format
  - `visitors`, `vendor_count`: numbers from the latest published edition
- **History**
  - `previous_editions`: text
  - `previous_editions_count`, `first_year`
- **Vendor info**
  - `vendor_booths`: whether booths are offered
  - `vendor_application`: how to apply (contact or link)
  - `vendor_deadline`
  - `vendor_cost`: text in local currency. A past year's rate is labelled with its year.
  - `booth_detail`, `contact`
- **Scoring**
  - `vendor_score`: 0–100, the Page's Vendor Score; timeline only
  - `shortlist_priority`: 1–3 from the Page
  - `priority_market`: true for Hong Kong, Singapore and Malaysia
  - `priority_market_level`: `top` for HK/SG, `high` for MY
- **Links**
  - `website`
  - `instagram`: profile URL
  - `instagram_followers`: only when independently verified
  - `source_urls`: array
- `description`, `audience`, `fit`: notes from the Page
- **Logo**
  - `logo`: relative path such as `logos/hobbycon.webp`, or `null` (THE SUNDAY CARD SHOW has none)
  - `logo_kind`: `logo` or `poster_or_photo`

Thumbnails can be shared, so one file may serve several events (for example CAPS and NEXUS).

## App metadata and publishing

`meta.json` records the source data's `updatedAt` date (ISO `YYYY-MM-DD`).
Update it alongside `events.json` on each data refresh; it drives the displayed
last-updated date and calendar `LAST-MODIFIED` values. It is the source snapshot
date, not the build date or an event's future date. The current value comes from
the export date above. The app deploys on pushes to `main` or a manual workflow
run. There is no scheduled data fetch or rebuild in this repository.

## Scraper discoveries

The 97-event breakdown above describes the 16 November 2026 Scanner export. The merged planner also includes discoveries from public calendars and organisers. On a content change the scanner sets `meta.json.updatedAt` to the refresh date in Asia/Saigon.

| Optional field | Meaning |
| --- | --- |
| `source.id`, `source.name`, `source.url` | Stable adapter ID, source display name and public evidence page. |
| `source.discovered_at` | ISO timestamp of the first sighting, preserved through updates. |
| `source.confidence`, `source.relevance` | Parser confidence and keyword relevance, each on a 0–1 scale. |
| `is_new_find` | True for scraper discoveries; the badge persists across runs. The run report counts first sightings separately. |
| `verification` | Scraped records are `unverified`. Scanner records may omit this field or use `scanner`. |
| `region_group` | Also accepts `Other` for lower-priority expansion markets, including the Philippines for this planner. |

Dated discoveries enter the timeline. Estimated months are recorded separately from confirmed travel dates. Undated finds enter the watchlist. For a published forecast range, the numeric field holds its lower bound and `expected_size` retains the range and forecast wording. `previous_editions_count` can count documented past listings. A year on the earliest available listing alone does not establish `first_year`. Scraper `vendor_score` and `logo` are null. A vendor link can be an enquiry or expression of interest; a blank application field means the source did not supply one.

Scanner records retain export key order and IDs during import. Existing scraper IDs and their first discovery timestamps survive parser corrections. Schedule and deploy commands are in the [scanner instructions](../README.md#scanners).
