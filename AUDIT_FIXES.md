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
