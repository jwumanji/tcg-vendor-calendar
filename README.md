# Holo Vault — TCG Vendor Calendar

A mobile-first, static season planner for the 2027 TCG vendor circuit across Southeast Asia, Hong Kong and the GCC. Built with React, strict TypeScript and Vite; no backend or account required.

## Local development

Use Node.js 22.12+ and npm:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The development and preview URLs include `/vendor-planner/` (or the configured `VITE_BASE`).

## Features

- Hero summary with live counts (events, countries, confirmed dates, open deadlines) computed from `data/events.json`; its buttons jump to the calendar and the top picks.
- Month calendar (agenda on mobile), chronological timeline, sortable cards, watchlist, recurring Singapore shows and a seven-stage Pipeline board whose cards show logo, game-coloured edge, dates, location, date status, score rarity, note indicator and a stage picker.
- Country/game multi-select, market, size, date, status, score and multi-select pipeline filters; free-text search and removable filter chips.
- Confirmed, estimated and TBA dates have distinct labels and styling. Estimates never become booking dates or calendar exports.
- Top vendor picks and application radar with original deadline notes. Notices can describe player registration, booking openings or historical dates; verify vendor terms with the organizer.
- Accessible event detail drawer, source links, all recurring occurrences, autosaved notes with edit times, stage picker and light/dark themes.
- "Holo Vault" visual design: dark-first (default when no theme is saved; a saved light/dark choice is respected), vendor scores shown as card-rarity tiers (Common <30, Uncommon 30–49, Rare 50–64, Ultra 65–79, Secret 80+) with the numeric score always visible, per-game colour accents, foil/tilt hover effects that are disabled under `prefers-reduced-motion`. Fonts (Unbounded, Figtree, Space Mono) are self-hosted latin subsets under `src/fonts/` (SIL OFL licences included).
- Individual or filtered ICS export, exclusive all-day end dates, UTF-8 line folding and CSV export. Filtered export includes all occurrences of matching recurring shows.

Filters, theme, notes, stages and the passed-event visibility toggle are stored in this browser’s localStorage. They do not sync between devices. Exports use the complete filtered set across views; a view tab or calendar month does not further narrow the export. Use the date filters to narrow the set. Unknown scores stay visible until a positive minimum score is selected.

Notes and stages use the versioned `tcg-pipeline-v1` key. Refreshes never prune saved IDs absent from the dataset. The old `tcg-plans` key is retained and migrated on first load: Interested → Interested, Planning to vend → Interested, Applied → Contacted, Accepted → Need to pay, Skip → Pass. Old entries have no recorded timestamps.

Use **Export backup** for a JSON backup before switching devices. Import validates version 1 and previews absent IDs before confirmation. Merge takes the newest note and stage independently for each ID, retaining local edits on timestamp ties; Replace explicitly discards entries outside the backup. Unknown JSON fields are ignored. Pass and Too expensive are hidden by default outside Pipeline; use the persisted visibility toggle to include them. Pipeline always renders every stage column and honors search and filters. Timeline can group by stage; card views can sort by stage. CSV includes stage and notes. Storage errors leave edits in memory and display a warning so they can be exported.

## Views

The List opens in **Grid**. Switch to **Rows** to compare dates, locations, stages, notes, sources and both scores in one table. Rows starts with the highest Priority score first. Select a column heading to sort, then select it again to reverse direction. On a phone, the sort menu and direction button sit above the two-line rows. With an event name focused, use ↑/↓ to move, Home/End to jump and Enter or Space to open its details. The browser remembers the layout in `tcg-list-view` and the column and direction in `tcg-rows-sort`.

**New finds** filters to scraper discoveries. Cards show the source, and event details include the discovery date, extraction confidence, relevance and a link to the listing when available. Check the organiser page before applying. Dated discoveries appear in their calendar month and on the timeline. Undated discoveries join the watchlist. Each discovery uses its stable ID for notes and pipeline stages. The new-finds toggle and minimum Priority tier are saved with the other filters in `tcg-filters`.

## Priority score

Priority rates each event from 0 to 100. It drives the upcoming top picks, the Priority sort and the minimum-tier filter. **Score weights** adjusts the relative importance of seven factors. The effective percentages always total 100. A factor earns its weight multiplied by its rating.

| Factor | Default weight | What contributes |
| --- | ---: | --- |
| Scale | 20% | Reported attendance or capacity and vendor counts. A recognised large venue or size tier can supply an estimate. |
| Track record | 10% | Documented prior editions or years running. An established publisher or recurring series can supply an estimate. |
| TCG fit | 20% | Event format, featured games, card-show naming and evidence that vendors can take part. |
| Market | 15% | Host country, with the highest ratings for Singapore and Hong Kong, followed by Malaysia. |
| Commercial potential | 15% | Quoted booth cost per thousand attendees, attendees per vendor, booth availability and applications. Size and market supply proxies when comparable prices are unavailable. |
| Logistics | 10% | Date certainty, travel from Singapore and time until the vendor deadline. The available inputs share this factor’s weight. |
| Scanner score | 10% | The original vendor score, with shortlist priority as a fallback estimate. The separate Scanner score filter still uses the original vendor score. |

The model labels each factor **real**, **estimated** or **missing**. Real factors have direct supporting evidence. Most proxy ratings are capped at 75% of the factor’s weight, with an 80% cap for the Scanner shortlist proxy. Missing factors receive 40% of their weight. Confidence measures the share of total weight backed by real factors. **High** starts at 65%, **medium** at 40%, and **low** falls below 40%. A dashed score chip and a tilde identify low confidence. Expand a factor in event details to see its signals and assumptions.

The model rounds the weighted total, then deducts one point per higher-scored confirmed event with overlapping dates or adjacent Friday–Saturday or Saturday–Sunday dates, up to four points. Recurring shows use their published occurrences. Clash comparisons use the calculated scores before penalties and overrides. The final tiers are **Must-do 77–100**, **Strong 64–76**, **Maybe 52–63** and **Skip 0–51**.

Use **Use my score** in event details to override an individual event. The pencil identifies your score wherever it appears. Details retain the calculated score, factor breakdown and confidence. **Reset to calculated** removes the override. **Copy explanation** copies the score, confidence and supporting signals.

Effective weights are saved in `tcg-priority-weights` and event-ID overrides in `tcg-priority-overrides`. JSON backups include both alongside the existing notes and stages. Importing a backup with score settings applies its weights. Merge adds imported overrides and uses the imported value for matching IDs. Replace restores the imported override set, including IDs absent from the current snapshot. Older version-1 backups restore notes and stages and preserve the current score settings.

## Refresh data

Read [the data guide](data/DATA_README.md) before editing. Replace `data/events.json` with the refreshed array, preserving the documented schema and stable event IDs (notes and stages use IDs). Copy the matching WebP logos into `public/logos/`; event paths should remain relative, e.g. `logos/mtg.webp`. Assets resolve against Vite’s deployment base. Null logos receive an initials placeholder.

Update the visible “Data last updated” note in `src/App.tsx` when refreshing. Run `npm test` and `npm run build` after changes. The app reads the JSON at build time; redeploy to publish new data. No live scraping occurs.

## Deploying to grailfoxtcg.com/vendor-planner

The planner lives at https://www.grailfoxtcg.com/vendor-planner/. It is unlisted: a noindex meta tag and an X-Robots-Tag header discourage indexing, and it is not added to the sitemap, robots.txt or navigation. Anyone with the link can reach it; this is not access control.

With Node.js/npm, Python 3, curl and an authenticated Vercel CLI installed, run from this checkout:

```sh
scripts/deploy-grailfox.sh        # preview deployment
scripts/deploy-grailfox.sh --prod # production deployment
```

The script first re-syncs the current production site's Build Output files, verifying their SHA-1 hashes, so newer changes to other site pages are preserved. It then runs tests, builds the planner, replaces only its static directory, adds scoped routes and deploys the prebuilt site. It keeps the site's Vercel project link and does not edit robots.txt, sitemap.xml or other site pages. A final smoke check verifies the planner response and indexing header; protected previews returning 401, 302 or 403 produce a warning. Production checks use the real www host and retry briefly for alias propagation. The script prints the current production deployment ID and rollback command, and aborts if production changes between sync and deploy.

Configuration is available through environment variables:

| Variable | Default |
| --- | --- |
| `GRAILFOX_SITE` | `/workspace/grailfox-site` |
| `VERCEL_SCOPE` | `justin-9436s-projects` |
| `VERCEL_TEAM_ID` | `team_E7PuNgRyzGwto2cmIFZZcrUX` |
| `VERCEL_PROJECT` | `grailfoxtcg` (project label) |
| `VERCEL_PROJECT_ID` | `prj_7k0k6RI7FbvlSAYGrNcLsM8vzroU` |
| `PLANNER_PATH` | `vendor-planner` (relative URL path, without surrounding slashes) |

The planner only exists in deployments made by this script. If the main Grailfox site is deployed another way (another CLI upload or a Git-connected pipeline), the planner disappears until this script is re-run. The script always re-syncs the live site first to preserve other site changes.

Vite defaults to `/vendor-planner/`; set `VITE_BASE` to override it for local builds. The deployment script sets `VITE_BASE` from `PLANNER_PATH`. Bases are normalized to start and end with `/`.

Application code lives in `src/App.tsx`, `src/components/`, `src/storage.ts`, `src/style.css`, `src/model.ts` and `src/utils.ts`; `src/main.tsx` is the bootstrap; the original event dataset remains in `data/`.
