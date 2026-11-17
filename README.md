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

Use **Export notes + stages** for a JSON backup before switching devices. Import validates version 1 and previews absent IDs before confirmation. Merge overwrites matching IDs and keeps other entries; Replace explicitly discards entries outside the backup. Unknown JSON fields are ignored. Pass and Too expensive are hidden by default outside Pipeline; use the persisted visibility toggle to include them. Pipeline always renders every stage column and honors search and filters. Timeline can group by stage; card views can sort by stage. CSV includes stage and notes. Storage errors leave edits in memory and display a warning so they can be exported.

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
