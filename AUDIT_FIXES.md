# Audit resolution

All requested High and Medium findings, and the selected Low findings, are addressed. There were no Critical findings. Personal planner strings remain; the HTML description is generic. No scheduled workflow, commit, or push was added.

| ID | Status | Resolution |
| --- | --- | --- |
| H1 | Fixed | Neutralize formula-leading CSV strings, including imported notes; numeric values stay numeric. |
| H2 | Fixed | Salvage entries individually, preserve the original raw backup, report dropped entries, and pause saving until explicit recovery acknowledgment. If preservation fails, the recovery action exports the original before enabling saves. |
| H3 | Fixed | Validate stored filters field by field, persist only stable filters, and provide an error boundary with raw local-data export and reset. |
| H4 | Fixed | Expose the current view, make the background inert, trap dialog focus, and restore it with a stable fallback. |
| H5 | Fixed | Merge stage and note independently by timestamp (local wins ties), stash current entries before replace, and announce import counts. Existing preview/confirmation retained. |
| M1 | Fixed | Include undated events without date bounds, keep them upcoming, and put them in the undated calendar/timeline group. |
| M2 | Fixed | Build timeline groups from overlapping occurrences without dropping events merely because their start month precedes the filter. |
| M3 | Fixed | Explicit month/ISO parsing with UTC construction and validity checks; prefer nearby vendor/application labels over player registration. |
| M4 | Fixed | Refresh the local day on visibility, focus, and a minute timer; choose the nearest upcoming month with a current-month fallback. |
| M5 | Fixed | Explicit stage selections override the default hiding of Pass/Too expensive. |
| M6 | Fixed | Search location, country code/UAE alias, fit, audience and games notes; normalize diacritics. |
| M7 | Fixed | Memoize derived lists and day lookup, memoize event cards, and save local note drafts after 400 ms or on blur/close/backgrounding. Debounce saved announcements. |
| M8 | Fixed | Stage inputs no longer open details or move focus; Too expensive offers an explicit booth-price prompt. Restore focus to the workspace heading when needed. |
| M9 | Fixed | Event-specific stage control names and an associated detail-stage label. |
| M10 | Fixed | Raise small text to 12px, darken muted/gold colors, fix dark estimated-strip contrast and today colors. |
| M11 | Fixed | Fixed-body scroll lock, safe-area-aware header/tabs, 16px mobile fields, tab scroll snapping/fades, and filter-panel focus/Escape/return. Existing drawer overscroll and inset sizing retained. |
| M12 | Fixed | Self-host DM Sans and Manrope via @fontsource; no Google Fonts requests. |
| M13 | Fixed | Event cards and top picks are articles with headings and real buttons; accessible button names include date/stage. |
| M14 | Fixed | Prevent empty ICS exports, label confirmed-only export, attach download anchors and retain object URLs for 30 seconds. |
| M15 | Fixed | Read snapshot date from data/meta.json, document its refresh process, show years in date labels, remove the occurrence's hardcoded year, and use a generic description. |
| M16 | Fixed | Normalize runtime fields/arrays/dates and test all source events for identity, dates, status/section combinations, assets and URLs. |
| L1 | Fixed | Production CSP permits self-hosted Vite modules/fonts/images and inline styles. Development omits it for Vite refresh/HMR; production retains it. |
| L2 | Skipped | HTTP links and mailto improvements were outside the requested Low scope. |
| L3 | Fixed | Calendar day groups expose their full dates. |
| L4 | Fixed | Stable chip IDs, descriptive removal labels and readable date/priority chips. |
| L5 | Fixed | Polite result-count live region. |
| L6 | Fixed | Brand targets the main content anchor. |
| L7 | Fixed | Omit empty ICS properties, escape lone CR, add official URL and source-date LAST-MODIFIED, and include vendor deadlines. |
| L8 | Skipped | CSV occurrence expansion and estimated-month spreadsheet formatting were outside the requested Low scope. |
| L9 | Fixed | Sort estimates after confirmed dates within a month, use upcoming recurrences, compare English/numeric text, and place missing countries last explicitly. |
| L10 | Skipped | Contradictory TBA filters and Past badges were outside the requested Low scope. |
| L11 | Skipped | Multi-tab synchronization was outside the requested Low scope. |
| L12 | Fixed | Cap imports at 5 MB before reading, limit unknown-ID previews to 20 with a remainder count, and report invalid entry fields. |
| L13 | Fixed | Explicit image dimensions, visible country codes/decorative flags, Unicode-safe initials, omit empty descriptions, and deduplicate source URLs. |
| L14 | Fixed (requested scope) | Favicon, Apple touch icon, home-screen manifest/icons, color-scheme and light/dark theme-color. Existing Pages base and routing remain suitable. |
| L15 | Fixed | Extract useEntries/useFilters/useToday and CalendarView; extend regression tests and format the changed components. |

## Audit details that did not reproduce

- H5: replace already had a preview and a “Confirm import” button. A second confirmation was unnecessary; the missing safety backup was added.
- M10: a later CSS rule already overrode the cited `#79837c` with `#65716a` (about 4.77:1 on the light page). The small text and gold/dark-theme issues still warranted changes.
- M11: `.drawer` already had `overscroll-behavior: contain`, and `height: 100%` inside a fixed inset overlay; there was no `100vh` drawer to replace. The filters are an inline panel, so focus/Escape/return were added without pretending it is a modal sheet.
- M15: estimated dates already included their year through `monthLabel`. Other date labels and the hardcoded occurrence year needed fixing. Personal strings remain by request; there is no new scheduled workflow.
- L13: React does not render `null` as the literal string “null” in the priority badge. The badge now explicitly handles the optional level, and the other logo/source issues were corrected.
- L14: there is no client-side routing requiring a `404.html`; deployment workflow/dependency automation changes were outside the requested subset.

## Validation

- `npm test`: **166 tests passed**, including checks for every one of the 97 source events.
- `npm run build`: passed; `git diff --check`: passed.
- Historical GitHub Pages check (now superseded by `/vendor-planner/`): built app served at `/tcg-vendor-calendar/`: no JavaScript errors, failed requests, CSP violations, or external requests during mobile smoke checks.
- Chromium with iPhone emulation: no page overflow at widths 320, 375, 390, 430, 1024 and 1440; filter focus/Escape, modal isolation, note-close flushing, storage recovery lock, imports/replacement backups, and downloads passed.
- Automated axe checks: no WCAG A/AA violations in all six views and details under light/dark themes. This is automated Chromium verification, not a physical iPhone/VoiceOver test.
- Development rendering and Vite refresh initialization passed with the development-only CSP exception.

## 2026-11-21 pass (Claude Code audit)

| ID | Status | Resolution |
| --- | --- | --- |
| A / 1 | Fixed | Source parsers and the scan runner recognize cancellation and postponement notices in titles and date fields. A notice updates an existing source-owned edition by listing key or unambiguous identity. Cancellation preserves dates. Postponement uses the announced replacement date or month, or moves the event to the undated watchlist. A dated re-listing linked to that edition restores the record under its original ID. The run report counts applied and unmatched notices per source and in total, and the scanner warns about each unmatched notice. |
| A / planner | Fixed | The data dictionary and runtime validation cover the optional `event_status` field. Views share the filtered, sorted input and display schedule badges. Cancelled finds score zero, produce no clashes and drop out of Top picks and upcoming deadlines. Postponement halves scoring confidence. ICS preserves the event UID and exports `STATUS:CANCELLED`. CSV includes event status alongside date status. |
| B2 | Fixed | Both day-first and month-first December–January ranges infer the previous year when the start year is omitted. |
| B3 | Fixed | The deployment smoke check compares the served JS and CSS references with the local build on both the root and a deep link. It retries propagation on the production alias and custom domain and requires the noindex header on both routes. |
| B4 | Fixed | Weekly refresh checks for staged, unstaged and untracked changes in data and logos before scanning. A failed scan, test or build discards the isolated checkout and preserves the live data, logos and run report. A completed refresh commit remains available for publication retries. |
| B5 | Fixed | Refreshes preserve existing artwork, artwork type, description and verified status when the source supplies no replacement. Generated fallback descriptions are assigned on initial discovery. |
| B6 | Fixed | Space activates the focused row control. G toggles Going outside bulk selection. The table caption and keyboard instructions reflect both behaviors. |
| B7 | Fixed | Rows displays the active sort label and direction whenever its column header is hidden or replaced by bulk selection. |
| B8 | Fixed | The score override draft synchronizes when the event or its displayed score changes. |
| B9 | Fixed | Game tags, pipeline stages, date indicators, clash cues and shared theme accents use violet or neutral tones in both themes. The header mark and app icons use the same violet palette. |
| B10 | Fixed | Removed the stale rainbow priority styles and foil factor-bar background. Priority chips, the legend and score bars use the violet score scale. |

### Codex review

| ID | Status | Resolution and regression coverage |
| --- | --- | --- |
| R1 | Fixed | Oz and Singapore Card Show read the edition title and schedule. Both fixtures keep the real dates alongside a cancelled activity, and both shows remain scheduled. |
| R2 | Fixed | Postponements retain the original ranges. Two identical scans of the Singapore organizer and EXPO fixtures keep one row. A later cancellation can match dates removed by an undated postponement. |
| R3 | Fixed | Weekly refresh hashes live data and logos, scans and tests in a detached worktree, and checks live inputs before applying results. The success and failure fixtures both preserve concurrent edits and the original branch revision. |
| R4 | Fixed | A dated re-listing needs an edition key, a matching schedule, or a unique match within 31 days of the original start. A nearby Sydney move retains its ID and outreach. The next season receives a separate row. |
| R5 | Fixed | A year-qualified notice matches an unversioned legacy title when source, city, country and dates corroborate it. Tests use the shipped Sydney row with the correct and incorrect years. |
| R6 | Fixed | An explicit final cancellation supersedes a postponement. Conflicting signals with no clear successor are reported. Tests cover both reported phrasings and contradictory cards in either order. |
| R7 | Fixed | AFA and HKCEC retain the original range and event title when a cancellation follows the dates, inline or on a new line. Both fixture variants cancel the existing row. |
| R8 | Fixed | Matching an undated notice by name accounts for the owner’s current cards. A separate, still-dated card keeps its schedule and the ambiguous notice is reported as unmatched. |
| R9 | Fixed | Vite stamps each build. Deployment checks the immutable URL and both aliases against that ID on the root and deep link, then fetches each entry asset. Fixtures cover unchanged asset paths on a stale release and missing JS and CSS. |
| R10 | Fixed | Only curl DNS and connection failures qualify for the custom-domain propagation exception. The certificate-error fixture fails with HTTP 000. |
| R11 | Fixed | Rows, Pipeline columns and stage-grouped Timeline follow the selected stage direction. The regression compares the same descending selection in all three. |
| R12 | Fixed | All views receive matching occurrences before sorting. A January/March series shows only March in the calendar grid and agenda, Rows, cards, Pipeline and Timeline under a March or next-90-days filter. |
| R13 | Fixed | ICS UIDs use the event ID and, for recurring shows, the source occurrence index. Moving December to March preserves the appointment, and filtering earlier weekends preserves later UIDs. |
| R14 | Fixed | The calendar header counts dated shows. The cancellation badge test also verifies the singular header and estimated count. |
| R15 | Fixed | Each top-pick title exposes its priority rank to screen readers. A display-order regression places rank 2 before rank 1 and checks both accessible titles. |

### Second Codex review

| ID | Status | Resolution and regression coverage |
| --- | --- | --- |
| S1 | Fixed | An SGCC workshop in a separate dates block and a cancelled meet-and-greet appended to the Singapore Card Show schedule both leave the published convention dates intact. |
| S2 | Fixed | Notice matching checks the subject and original range even when the URL matches. The 2027 Bandai cancellation and the retitled Suntec workshop both count as unmatched. |
| S3 | Fixed | Both sides of each edition claim are checked against the pre-refresh snapshot. Two March weekends in either order leave Sydney’s planner ID and booking notes on the postponed row and count as ambiguous listings. |
| S4 | Fixed | Singapore’s December and March ranges survive the move to April. A stale March EXPO card counts as known, and a follow-up notice can still identify March. |
| S5 | Fixed | A cancellation following an undated postponement restores the identified dates and timeline section. The regression exports the cancellation with the original UID and verifies normal pruning. |
| S6 | Fixed | An explicit final transition in the title or schedule determines the outcome. Tests cover a March replacement and a final cancellation. |
| S7 | Fixed | The SGCC main dates, Singapore Card Show date spans and Bandai line breaks retain attached cancellation text. All three fixtures update the original edition. |
| S8 | Fixed | Sydney’s schedule heading can contain only a postponement. Its stored show moves to the watchlist while a separate workshop heading leaves the show scheduled. |
| S9 | Fixed | Classification runs inside the per-card error handler. A conflicting Suntec card produces a partial scan with a reason, and the other expo remains in the results. |
| S10 | Fixed | Matched edition keys survive on the row. Singapore’s changed booking form and Sydney’s year-qualified re-listing both retain the original ID and outreach. |
| S11 | Fixed | A blank Gold Coast card counts as known after an undated postponement and leaves the single postponed row intact. |
| S12 | Fixed | Deployment fixtures serve distinct JS and CSS files. The check rejects HTTP-200 HTML fallbacks, stale bytes and incorrect content types. |
| S13 | Fixed | A 401 on the immutable Vercel host skips that host and requires the local build ID on both public domains. Tests cover healthy, stale, protected and unreachable public endpoints. |
| S14 | Fixed | Publication lets Git check out the tested revision without resetting the report. Fixtures verify that staged report bytes and a last-moment worktree edit each survive a refused fast-forward. |
| S15 | Fixed | Single events keep the legacy ID-and-first-date UID. Recurring weekends retain their original start through an identifiable move, a filter or upstream removal of the first weekend. |
| S16 | Fixed | Calendar days, agenda membership and month grouping use the filtered intersection. A January–February show appears on February 1 and 2 under a February filter and exports its full published range. |
| S17 | Fixed | Summary views select the same upcoming occurrence for dates and accessible titles. Between Centrepoint weekends, Pipeline and Top picks both show February 13–14. |
| S18 | Fixed | The Rows date cell uses the event’s schedule status in its tooltip and screen-reader text. The cancellation rendering test checks both. |

### Validation

- `npm test` passed with **518 tests across 18 files**. Scanner CLI fixtures exercise persisted event data, run counts and unmatched warnings. Shell fixtures cover stale deployments, missing assets, certificate failures, propagation, concurrent planner edits and failed scans, tests and builds.
- `npm run build` passed. Vite reported its size advisory for the main JavaScript chunk.
- `git diff --check` passed.
