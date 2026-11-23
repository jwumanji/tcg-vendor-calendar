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

The development and preview URLs are served at `/` (or the configured `VITE_BASE`).

## Features

- List opens directly in Rows for fast scanning. Top picks ranks up to 12 upcoming dated events by Priority and includes the tier legend. Vendor dates and outreach follow-ups start collapsed. Open a reminder to see the first three items and reveal the rest.
- Month calendar (agenda on mobile), chronological timeline, sortable cards, watchlist, recurring Singapore shows and a nine-stage Pipeline board whose cards show logo, violet edge, dates, location, date status, score rarity, note indicator and a stage picker.
- Country/game multi-select, market, size, date, status, score and multi-select pipeline filters; free-text search and removable filter chips.
- Confirmed, estimated and TBA dates have distinct labels and styling. Going calendar downloads identify estimated months as tentative.
- Top vendor picks and application radar with original deadline notes. Yellow **Apply** and **Register interest** links open published vendor routes from event pages, lists and upcoming deadlines.
- Full-page event details at `/event/<id>`, source links, all recurring occurrences, autosaved notes with edit times, stage picker and light/dark themes.
- "Holo Vault" visual design: dark-first (default when no theme is saved; a saved light/dark choice is respected), vendor scores shown as card-rarity tiers (Common <30, Uncommon 30–49, Rare 50–64, Ultra 65–79, Secret 80+) with the numeric score always visible, violet game accents, foil/tilt hover effects that are disabled under `prefers-reduced-motion`. Fonts (Unbounded, Figtree, Space Mono) are self-hosted latin subsets under `src/fonts/` (SIL OFL licences included).
- Individual or filtered ICS export, exclusive all-day end dates, UTF-8 line folding and CSV export. Filtered export includes all occurrences of matching recurring shows.

Filters, theme, notes, stages and the passed-event visibility toggle are stored in this browser’s localStorage. They do not sync between devices. Filtered exports use the complete filtered set across views; a view tab or calendar month does not further narrow the export. Use the date filters to narrow the set. Unknown scores stay visible until a positive minimum score is selected.

Going choices, notes and stages use the versioned `tcg-pipeline-v1` key. Refreshes retain saved IDs absent from the dataset. Older entries, backups and saved filters migrate New to Not reviewed, Interested to Considering, Pass to Passed, and Paid / attending to Booked. The older `tcg-plans` key also migrates Planning to vend to Considering, Applied to Applied, Accepted to Need to pay, and Skip to Passed. Entries from that key have no recorded timestamps.

Use **Export backup** for a JSON backup before switching devices. Import validates version 1 and previews absent IDs before confirmation. Merge takes the newest Going choice, note and stage independently for each ID, retaining local edits on timestamp ties. Replace discards entries outside the backup. Unknown JSON fields are ignored. Passed and Too expensive are hidden by default. Use the visibility toggle or select those stages in Filters to include them. Pipeline shows every stage and honors search and filters. Each stage page shows up to six events. Use **Show N more** and **Previous** to go through the stage. Timeline can group by stage. Grid and Rows share stage filters and sort order. CSV includes stage and notes. Storage errors leave edits in memory and display a warning so they can be exported.

Change the pipeline stage in Decide, Grid, Rows or Pipeline. An untouched Not reviewed entry can show a suggestion based on outreach, a this-edition booth quote or an organizer proposal. Published catalogue rates alone leave the entry untouched. Japan Expo Thailand’s organizer proposal suggests Quote received, with booth pricing still pending. Local storage and JSON backups save explicit stage choices and any local evidence. Suggestions are recalculated from that evidence and the current event data. Choose a stage in the picker to save it, including when it matches the suggestion.

## Views

The List opens in **Rows**, soonest dates first. Grid and Rows use the same filtered, sorted events, with one item per recurring show ordered by its next occurrence for date sorts. Recurring SG lists the published dates beneath each card. Timeline shows the event in each matching occurrence month and retains the shared order within each group. Use **Sort by** and its direction button in either layout. Desktop Rows shows the active sort in the corresponding column header when visible. Dates group events under sticky month headings, show an **Est.** marker on month estimates, and put events awaiting dates at the end. Grid and Rows both show date and status, country, priority, stage, Going, and Apply when an application route is published and open for the event. **Columns** adds Fit score, Source, Notes, or a dedicated Outreach field in either layout. New finds show a badge by default, and the Source option adds the source name and link when available. This browser remembers the layout, sort and optional columns in `tcg-list-view`, `tcg-sort-v2` and `tcg-rows-columns`.

Open an event by tapping the row or pressing Enter on its name. Back or Escape returns to the previous view. Each event has a shareable URL, including shows hidden by the season filter. Use ↑/↓ or Home/End to move between names. **Grid** switches to cards. **Top picks** ranks upcoming dated events, **Calendar** shows a monthly agenda on phones, and **Timeline** can group by month or pipeline stage. Watchlist and Recurring SG have their own tabs.

**Going** marks events you plan to attend. Tap the bookmark or press G on a focused row button outside bulk selection. Space activates the focused control. Marking Going moves a Not reviewed event to Considering. Removing Going keeps the current stage. A warning icon identifies a scored date clash with a Going event. In **Bulk select**, tap a row or card, Shift-click a range or check **Select all visible**, then choose **Mark Going** or **Unmark**. Applying clears the selection. **Undo** is available for eight seconds after a single or bulk change. It restores the previous Going choices and any stage changed automatically, preserving subsequent note and stage edits.

**Quick filters** let you combine Confirmed, Singapore, Hong Kong, Malaysia, Next 90 days and Not yet Going with the other filters. Selected countries match any of those markets. Next 90 days includes today and checks for overlap with published occurrences or estimated months. Clear in the quick-filter strip resets its active chips. The Filters panel also contains **Show passed / too expensive**. Past dates carry a Past tag.

The **Going** count in the toolbar filters the view to your attendance list. Its download bar exports all marked events across filters. **Tools** puts the same Going downloads first, followed by all filtered events, backup and restore, and score weights. Going calendars include confirmed occurrences and a tentative, free all-day placeholder on the first of each estimated month. Undated events appear in the CSV. The all-filtered calendar and individual event calendars use confirmed dates. Version-1 backups created before Going import with Going off. Merging one preserves newer local Going choices.

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
| Logistics | 10% | Date certainty, estimated travel from your home base and time until the vendor deadline. The available inputs share this factor’s weight. |
| Scanner score | 10% | The original vendor score, with shortlist priority as a fallback estimate. The separate Scanner score filter still uses the original vendor score. |

The model labels each factor **real**, **estimated** or **missing**. Real factors have direct supporting evidence. Most proxy ratings are capped at 75% of the factor’s weight, with an 80% cap for the Scanner shortlist proxy. Missing factors receive 40% of their weight. Confidence measures the share of total weight backed by real factors. **High** starts at 65%, **medium** at 40%, and **low** falls below 40%. A dashed score chip and a tilde identify low confidence. Expand a factor in event details to see its signals and assumptions.

The model rounds the weighted total, then deducts one point per higher-scored confirmed event with overlapping dates or adjacent Friday–Saturday or Saturday–Sunday dates, up to four points. Recurring shows use their published occurrences. Clash comparisons use the calculated scores before penalties and overrides. The final tiers are **Must-do 77–100**, **Strong 64–76**, **Maybe 52–63** and **Skip 0–51**.

Use **Use my score** in event details to override an individual event. The pencil identifies your score wherever it appears. Details retain the calculated score, factor breakdown and confidence. **Reset to calculated** removes the override. **Copy explanation** copies the score, confidence and supporting signals.

**Tools → Priority and travel → Home base** defaults to Ho Chi Minh City, Vietnam (`Asia/Saigon`). Changing it immediately updates calculated Priority in Grid, Rows, Top picks and event details. Logistics uses qualitative city and country bands for local, domestic and international trips. The score explanation shows the selected origin and estimated band when travel can be estimated.

The home base is saved in this browser’s `tcg-priority-home-base` localStorage key. JSON backups include it along with the weights (`tcg-priority-weights`), event overrides (`tcg-priority-overrides`) and planner data. Merge and Replace apply a recognized imported home base. The preview flags an unknown home base ID and the current selection is kept. Older backups without a home base also preserve the current selection. Merge adds imported overrides and uses the imported value for matching IDs. Replace restores the imported override set, including IDs absent from the current snapshot.

## Refresh data

Read [the data guide](data/DATA_README.md) before editing. Replace `data/events.json` with the refreshed array, preserving the documented schema and stable event IDs (notes and stages use IDs). Copy the matching WebP logos into `public/logos/`; event paths should remain relative, e.g. `logos/mtg.webp`. Assets resolve against Vite’s deployment base. Country flags are self-hosted Twemoji graphics by Twitter, Inc. and other contributors, licensed under CC BY 4.0. [Flag attribution and licence](public/flags/LICENSE.txt)

Grid, Rows, event pages, Top picks, Pipeline and Calendar use the same artwork. Store logos at their natural aspect with transparent margins and neutral mattes removed. Set `logo_kind` to `logo` for a contained mark over a dark blurred backdrop or `poster_or_photo` for edge-to-edge cover. These modes apply before image decode and require no canvas work. For unlabelled art, the planner samples transparency and edge uniformity once per URL, trims detected logo margins and caches the result. [Artwork contact sheet and dimensions](docs/event-artwork.md)

Events without artwork get a generated cover immediately, including new scanner finds. A hash of the stable event ID selects a single violet hue, gradient and geometric motif. Grid cards and event pages show the event name in Unbounded with game glyphs and a country badge. Rows and compact views use the same design with a monogram.

Update the visible “Data last updated” note in `src/App.tsx` when refreshing. Run `npm test` and `npm run build` after changes. The app reads the JSON at build time; redeploy to publish new data. No live scraping occurs.

## Deploying to planner.grailfoxtcg.com

The planner is served at the root of https://planner.grailfoxtcg.com from its own Vercel project, `vendor-planner` (scope `justin-9436s-projects`). The main grailfoxtcg.com store is on Shopify and is not touched. The planner is unlisted: a noindex meta tag plus an `X-Robots-Tag: noindex, nofollow, noarchive` header (from `public/vercel.json`, copied into `dist/`) discourage indexing. Anyone with the link can reach it; this is not access control.

```bash
export PATH=$HOME/.local/bin:$PATH
scripts/deploy.sh               # tests, build, vercel deploy --prod of dist/ to project vendor-planner
scripts/deploy.sh --skip-tests
```

`public/vercel.json` also sets the SPA fallback (deep links rewrite to `/index.html`, assets and logos are served as files) and long-lived caching for hashed assets. After deployment the script checks the immutable deployment URL, the project alias and the custom domain. The root and a deep link must serve the local build ID and noindex header. Entry assets must match the local files byte for byte, with the expected JavaScript and CSS content types. A protected immutable URL returning HTTP 401 requires successful verification on both public domains. After a successful immutable check, the custom domain can still be propagating if DNS or the connection fails.

| Variable | Default |
|---|---|
| `VERCEL_SCOPE` | `justin-9436s-projects` |
| `VERCEL_PROJECT` | `vendor-planner` |
| `PLANNER_URL` | `https://planner.grailfoxtcg.com` |

Vite's base defaults to `/`; set `VITE_BASE` (for example `/vendor-planner/`) to host under a sub-path. Bases are normalized to start and end with `/`.

Application code lives in `src/App.tsx`, `src/components/`, `src/storage.ts`, `src/style.css`, `src/model.ts` and `src/utils.ts`; `src/main.tsx` is the bootstrap; the original event dataset remains in `data/`.

## Scanners

Use Node 24 and install dependencies with `npm ci`. Run from the repository root.

| Command | Effect |
| --- | --- |
| `npm run scan:dry` | Fetch live listings, validate and print the proposed changes. Writes no files. |
| `npm run scan` | Merge live finds, update the snapshot date when records change, and save the run report. |
| `node scanner/run.ts --import-scanner /workspace/tcg-calendar/events.json` | Add events, fill empty fields on matched records, install usable logos at new paths, and run all sources. Add `--dry-run` to preview. |
| `scripts/weekly-refresh.sh --no-push --no-deploy` | Refresh locally and run tests and the production build. |
| `scripts/weekly-refresh.sh` | Refresh, test, build, commit changed data, rebase, push to main and deploy (`scripts/deploy.sh`). `--force-deploy` deploys even with no data changes. |

The active sources are Singapore Card Show, Singapore EXPO, Suntec, HKCEC, Anime Festival Asia, Singapore Comic Con, Bandai Card Games Fest, Wizards’ Magic Play Events, Jump Festa, Supanova and Oz Comic-Con Sydney. The live window starts today in Asia/Saigon and extends 18 months. Smaller store events and unrelated venue bookings are filtered out. The source report records tested calendars, access failures, examples and the reasons for exclusions. [Source review](scanner/SOURCES.md)

Each scraper-owned event carries a stable `scan-` ID, its source and discovery timestamp, relevance and confidence, `is_new_find` and `verification`. Vendor details require an explicit source statement. Some official events offer merchandise or tournament play without publishing third-party exhibitor terms. These fields stay null until the source supplies them. [Data dictionary](data/DATA_README.md)

To add a source, save a small fragment of its actual public listing in `scanner/fixtures/`, add its pure parser and source module in `scanner/sources/`, and register it in `scanner/sources/index.ts`. Venue calendars can configure `venueParser` with selectors, location and date extraction. Add a dated parser case and document the live result in the source review. Use `ctx.get` for all network access. It checks robots.txt, serializes requests per host with at least a one-second gap, uses a 15-second request timeout, retries transient failures once and sends no-cache headers. The user agent is `Mozilla/5.0 (compatible; GrailfoxEventScanner/1.0; +https://www.grailfoxtcg.com)`. Only public HTML and documented public feeds are eligible.

The report counts new events, listing matches, ambiguous listings, and applied and unmatched schedule notices. Scraper failures appear as warnings, and a valid Scanner export can still be imported when every live scrape fails. Scraper finds without shared planning age out 30 days after their end date. Scanner imports keep omitted events and populated fields. Duplicate or ambiguous export listings, field conflicts, and rejected logos are logged in the report. Existing logo references and files are preserved. [Latest scan](scanner/last-run.json)

## 2027+ focus

The planner hides every event that ends before 1 Jan 2027 (list, top picks, calendar, timeline, pipeline, counts and exports); recurring shows keep only their 2027+ occurrences, and the calendar opens on January 2027. Hidden events stay in `data/events.json`, so notes, stages and Going marks are never lost. Tools has a "Show 2026 events" toggle (saved as `tcg-show-2026-v1`). The cut-off is `SEASON_START` in `src/utils.ts`.
