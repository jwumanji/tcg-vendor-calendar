import { useEventRoute } from "./hooks/useEventRoute";
import { usePriority } from "./hooks/usePriority";
import { DEFAULT_HOME_BASE, HOME_BASE_GROUPS } from "./homeBase";
import { Modal } from "./components/Modal";
import { EventRows, RowColumns, RowSortControl } from "./components/EventRows";
import { normalizeColumns, normalizeListView, loadSort, SORT_STORAGE_KEY, groupSortedRows, orderTimelineGroups, sortRows } from "./rows";
import { CalendarView } from "./components/CalendarView";
import { CardSections } from "./components/ListSections";
import { EventCard } from "./components/EventCard";
import { BrandLockup, BrandMark } from "./components/Brand";
import { EmptyState } from "./components/EmptyState";
import { EventExports } from "./components/EventExports";
import { TopPicks } from "./components/TopPicks";
import { UpcomingMilestones, useMilestoneClock } from "./components/UpcomingMilestones";
import { OutreachFollowUps } from "./components/OutreachFollowUps";
import { Pipeline } from "./components/Pipeline";
import { BackupControls } from "./components/BackupControls";
import { stages, emptyEntry, saveValue } from "./storage";
import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";

import {
  CalendarDays,
  SlidersHorizontal,
  Search,
  X,
  Sun,
  Moon,
  Bookmark,
  Settings2,
  ListChecks,
  SearchX,
  TriangleAlert,
  LayoutList,
  Gem,
  RotateCcw,
  LayoutGrid,
  List,
  Sparkles,
} from "lucide-react";
import raw from "../data/events.json";
import { useEntries } from "./hooks/useEntries";
import { useFilters, stored } from "./hooks/useFilters";
import { CountryFilter } from "./components/CountryFilter";
import { CountryFlag } from "./components/EventIdentity";
import { useToday } from "./hooks/useToday";
import { mergeMilestones, mergeOutreach, mergeVendorPricing, normalizeEvents, reconcileOutreachOverlay } from "./data";
import meta from "../data/meta.json";
import type { Event } from "./model";
import { emptyFilters } from "./model";
import {
  nextMonth,
  seasonEvents,
  countryOptions,
  SEASON_START,
  timelineGroups,
  gameRules,
  ranges,
  matchingEvent,
  goingEvents,
  monthLabel,
  prettyDate,
} from "./utils";
import "./style.css";
const Detail = lazy(async () => ({
  default: (await import("./components/Detail")).Detail,
}));
const ScoreSettings = lazy(async () => ({
  default: (await import("./components/ScoreSettings")).ScoreSettings,
}));

const defaultTitle = document.title;
function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus({ preventScroll: true });
}
const quickCountries = [
  { country: "Singapore", code: "SG" },
  { country: "Hong Kong", code: "HK" },
  { country: "Malaysia", code: "MY" },
];

export default function App() {
  const shippedEvents = useMemo(() => normalizeEvents(raw), []);
  const {
    entries,
    outreach,
    milestones,
    vendorPricing,
    update,
    updateOutreach,
    updateMilestone,
    resetMilestone,
    updateVendorPricing,
    resetVendorPricing,
    applyEntries,
    setGoing,
    undo,
    undoGoing,
    saved,
    storageError,
    setStorageError,
    canSave,
    acknowledgeRecovery,
  } = useEntries();
  const allEvents = useMemo(
    () => shippedEvents.map((event) => ({
      ...event,
      ...(Object.hasOwn(outreach, event.id) && {
        outreach: mergeOutreach(event.outreach, reconcileOutreachOverlay(event.outreach, outreach[event.id])),
      }),
      ...(Object.hasOwn(milestones, event.id) && {
        vendor_milestones: mergeMilestones(event.vendor_milestones, milestones[event.id]),
      }),
      ...(Object.hasOwn(vendorPricing, event.id) && mergeVendorPricing(event, vendorPricing[event.id])),
    })),
    [shippedEvents, outreach, milestones, vendorPricing],
  );
  const [show2026, setShow2026] = useState(
    () => stored("tcg-show-2026-v1") === true,
  );
  const events = useMemo(
    () => seasonEvents(allEvents, show2026),
    [allEvents, show2026],
  );
  const today = useToday();
  const now = useMilestoneClock();
  // The calendar opens on the first month of the season (January 2027).
  const firstMonth = nextMonth(events, today);
  const initialMonth =
    show2026 || firstMonth >= SEASON_START.slice(0, 7)
      ? firstMonth
      : SEASON_START.slice(0, 7);
  const { route, openEvent, back, listContext } = useEventRoute();
  const { filters, setFilters, set } = useFilters(setStorageError, listContext?.sessionFilters);
  const priority = usePriority(allEvents, today, now, setStorageError);
  const { scores } = priority;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listView, setListView] = useState(() =>
    normalizeListView(stored("tcg-list-view")),
  );
  const [columns, setColumns] = useState(() =>
    normalizeColumns(stored("tcg-rows-columns")),
  );
  useEffect(() => {
    const error = saveValue("tcg-rows-columns", columns);
    if (error) setStorageError(error);
  }, [columns, setStorageError]);
  const [sort, setSort] = useState(() => loadSort());
  useEffect(() => {
    const error = saveValue("tcg-list-view", listView);
    if (error) setStorageError(error);
  }, [listView, setStorageError]);
  useEffect(() => {
    const error = saveValue(SORT_STORAGE_KEY, sort);
    if (error) setStorageError(error);
  }, [sort, setStorageError]);
  const [showPassed, setShowPassed] = useState(
    () => stored("tcg-show-passed-v1") === true,
  );
  const visible = useCallback(
    (e: Event) =>
      showPassed ||
      filters.stages.includes((entries[e.id] || emptyEntry).stage) ||
      !["Pass", "Too expensive"].includes((entries[e.id] || emptyEntry).stage),
    [showPassed, filters.stages, entries],
  );
  const onEventPage = route.page === "event";
  const selected = onEventPage
    ? events.find((event) => event.id === route.id) ?? allEvents.find((event) => event.id === route.id)
    : null;
  const sharedSelection = selected && shippedEvents.find((event) => event.id === selected.id);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = onEventPage
      ? (selected?.name ?? "Event not found") + " – Holo Vault"
      : defaultTitle;
  }, [onEventPage, selected]);
  const [view, setView] = useState(listContext?.view ?? "List");
  const [month, setMonth] = useState(listContext?.month ?? initialMonth);
  const [filterOpen, setFilterOpen] = useState(listContext?.filterOpen ?? false);
  const [groupByStage, setGroupByStage] = useState(listContext?.groupByStage ?? false);
  const { search, from, to } = filters;
  const open = useCallback((event: Event, occurrence?: string, focusFallback?: () => HTMLElement | null) => {
    openEvent(event.id, occurrence, {
      view, month, filterOpen, groupByStage, sessionFilters: { search, from, to },
    }, focusFallback);
  }, [openEvent, view, month, filterOpen, groupByStage, search, from, to]);
  const [theme, setTheme] = useState(
    () =>
      ["light", "dark"].includes(String(stored("tcg-theme")))
        ? String(stored("tcg-theme"))
        : "dark", // dark is the default look; an explicit saved choice always wins
  );
  useEffect(() => {
    const error = saveValue("tcg-show-2026-v1", show2026);
    if (error) setStorageError(error);
  }, [show2026, setStorageError]);
  useEffect(() => {
    const error = saveValue("tcg-show-passed-v1", showPassed);
    if (error) setStorageError(error);
  }, [showPassed]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .getElementById("theme-color")
      ?.setAttribute("content", theme === "light" ? "#f2ead9" : "#0a0914");
    const error = saveValue("tcg-theme", theme);
    if (error) setStorageError(error);
  }, [theme]);
  const filtered = useMemo(
    () =>
      events.flatMap((e) => {
        const match = visible(e) && matchingEvent(e, filters, entries, scores[e.id].score, today);
        return match ? [match] : [];
      }),
    [events, filters, entries, visible, scores, today],
  );
  const attending = useMemo(
    () => goingEvents(events, entries),
    [events, entries],
  );
  const chips: { id: string; label: string; clear: () => void }[] = [];
  for (const c of filters.countries)
    chips.push({
      id: `country:${c}`,
      label: c,
      clear: () =>
        set(
          "countries",
          filters.countries.filter((x) => x !== c),
        ),
    });
  for (const c of filters.games)
    chips.push({
      id: `game:${c}`,
      label: c,
      clear: () =>
        set(
          "games",
          filters.games.filter((x) => x !== c),
        ),
    });
  if (filters.search)
    chips.push({
      id: "search",
      label: filters.search,
      clear: () => set("search", ""),
    });
  for (const k of ["priority", "size", "from", "to", "status"] as const)
    if (filters[k] && filters[k] !== "any")
      chips.push({
        id: k,
        label:
          k === "from"
            ? `From ${prettyDate(filters.from)}`
            : k === "to"
              ? `Until ${prettyDate(filters.to)}`
              : k === "priority"
                ? filters.priority === "top"
                  ? "Top priority markets"
                  : "High or top priority markets"
                : `${k === "size" ? "Size" : "Status"}: ${filters[k]}`,
        clear: () => set(k, emptyFilters[k]),
      });
  for (const stage of filters.stages)
    chips.push({
      id: `stage:${stage}`,
      label: stage,
      clear: () =>
        set(
          "stages",
          filters.stages.filter((s) => s !== stage),
        ),
    });
  if (filters.going)
    chips.push({
      id: "going",
      label: `Going ${attending.length}`,
      clear: () => set("going", false),
    });
  if (filters.newOnly)
    chips.push({
      id: "newOnly",
      label: "New finds",
      clear: () => set("newOnly", false),
    });
  if (filters.minTier !== "any")
    chips.push({
      id: "minTier",
      label:
        filters.minTier === "must"
          ? "Priority · Must-do only"
          : "Priority · Strong+",
      clear: () => set("minTier", "any"),
    });
  if (filters.score)
    chips.push({
      id: "score",
      label: `Scanner score ≥ ${filters.score}`,
      clear: () => set("score", 0),
    });
  if (!filters.tba)
    chips.push({
      id: "tba",
      label: "TBA excluded",
      clear: () => set("tba", true),
    });
  const quick = [
    ...([
      ["contacted", "Contacted"],
      ["not_contacted", "Not contacted"],
    ] as const).map(([status, label]) => ({
      id: status,
      label,
      outreach: true,
      active: filters.outreach === status,
      toggle: () => set("outreach", filters.outreach === status ? "" : status),
    })),
    {
      id: "status",
      label: "Confirmed",
      active: filters.status === "confirmed",
      toggle: () =>
        set("status", filters.status === "confirmed" ? "" : "confirmed"),
    },
    ...quickCountries.map(({ country, code }) => ({
      code,
      id: "country:" + country,
      label: country,
      active: filters.countries.includes(country),
      toggle: () =>
        set(
          "countries",
          filters.countries.includes(country)
            ? filters.countries.filter((c) => c !== country)
            : [...filters.countries, country],
        ),
    })),
    {
      id: "next90",
      label: "Next 90 days",
      active: filters.next90,
      toggle: () => set("next90", !filters.next90),
    },
    {
      id: "notGoing",
      label: "Not yet Going",
      active: filters.notGoing,
      toggle: () => set("notGoing", !filters.notGoing),
    },
  ];
  const activeQuick = quick.filter((q) => q.active);
  for (const q of activeQuick.filter(
    (q) => q.id === "next90" || q.id === "notGoing" || "outreach" in q,
  ))
    chips.push({ id: q.id, label: q.label, clear: q.toggle });
  const otherChips = chips.filter(
    (c) =>
      c.id !== "going" &&
      c.id !== "newOnly" &&
      !activeQuick.some((q) => q.id === c.id),
  );
  function clearQuick() {
    setFilters((f) => ({
      ...f,
      status: f.status === "confirmed" ? "" : f.status,
      next90: false,
      notGoing: false,
      outreach: "",
      countries: f.countries.filter((c) => !quickCountries.some(({ country }) => country === c)),
    }));
  }
  const storageWarning = storageError && (
    <div role="alert" className="storage-warning">
      <p>
        <TriangleAlert size={18} aria-hidden="true" />
        <span>{storageError}</span>
      </p>
      {!canSave && (
        <button className="button" onClick={acknowledgeRecovery}>
          Preserve original and resume saving
        </button>
      )}
    </div>
  );
  const toast = (
    <div role="status" aria-atomic="true" className="going-toast">
      {undo && (
        <>
          <span key={undo.changedAt}>
            {undo.going
              ? `Marked ${undo.patch.length} Going`
              : `Removed ${undo.patch.length} from Going`}
          </span>
          <span aria-hidden="true"> · </span>
          <button onClick={undoGoing}>Undo</button>
        </>
      )}
    </div>
  );
  const showRows = view === "List" && listView === "rows";
  const sorted = useMemo(
    () => sortRows(filtered, sort, entries, scores, today),
    [filtered, sort, entries, scores, today],
  );
  function card(e: Event, occurrence?: string, titleLevel?: 3 | 4) {
    return (
      <EventCard
        key={e.id + (occurrence || "")}
        e={e}
        entry={entries[e.id] || emptyEntry}
        score={scores[e.id]}
        entries={entries}
        setGoing={setGoing}
        today={today}
        now={now}
        occurrence={occurrence}
        titleLevel={titleLevel}
        open={open}
      />
    );
  }
  const groups = useMemo(
    () =>
      timelineGroups(
        view === "Timeline" ? sorted : [],
        filters,
        entries,
        groupByStage,
        today,
      ),
    [view, sorted, filters, entries, groupByStage, today],
  );
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    filterPanel.current?.focus();
    return () => {
      filterTrigger.current?.focus();
    };
  }, [filterOpen]);
  const visibleList = useMemo(
    () =>
      sorted.filter(
        (e) =>
          view === "List" ||
          (view === "Watchlist" && e.section === "watchlist") ||
          (view === "Recurring SG" && e.section === "recurring_sg"),
      ),
    [sorted, view],
  );
  const listGroups = useMemo(
    () => groupSortedRows(visibleList, sort.key, today),
    [visibleList, sort.key, today],
  );
  const sortControl = <RowSortControl sort={sort} setSort={setSort} />;
  const noResults = (
    <EmptyState
      icon={SearchX}
      title="No matching events"
      action={
        chips.length > 0 ? (
          <button className="button" onClick={() => setFilters(emptyFilters)}>
            <RotateCcw size={16} aria-hidden="true" /> Clear all filters
          </button>
        ) : undefined
      }
    >
      {chips.length > 0
        ? "Try broadening or clearing your filters."
        : "Nothing is listed here yet."}
    </EmptyState>
  );
  return (
    <>
      <header className="header" hidden={onEventPage}>
        <a className="brand" href="#main">
          <BrandLockup />
        </a>
        <div className="header-right">
          <button
            className="icon-button"
            aria-label="Toggle light and dark theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <span className="theme-icon" key={theme}>
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </span>
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1} hidden={onEventPage}>
        {storageWarning}
        <section className="workspace">
          <h1 className="sr-only">Holo Vault vendor calendar</h1>
          <h2 className="sr-only" id="workspace-title" tabIndex={-1} ref={workspaceHeading}>
            {view}
          </h2>
          <nav className="tabs" aria-label="Event views">
            {[
              "List",
              "Top picks",
              "Calendar",
              "Timeline",
              "Watchlist",
              "Recurring SG",
              "Pipeline",
            ].map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                aria-current={view === v ? "page" : undefined}
                onClick={(ev) => {
                  setView(v);
                  setSelectMode(false);
                  ev.currentTarget.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  });
                }}
              >
                {v === "List" && <List size={16} />}
                {v === "Top picks" && <Gem size={16} />}
                {v === "Calendar" && <CalendarDays size={16} />}
                {v === "Timeline" && <LayoutList size={16} />}
                {v === "Pipeline" && <Bookmark size={16} />}
                {v}
              </button>
            ))}
          </nav>
          <UpcomingMilestones events={allEvents} open={open} focusFallback={workspaceHeading} />
          <OutreachFollowUps events={allEvents} today={today} focusFallback={workspaceHeading}
            open={(event, returnFocus) => open(event, undefined, returnFocus)} />
          <div className="toolbar">
            <label className="search">
              <Search size={18} />
              <input
                placeholder="Search events, cities, games…"
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
                aria-label="Search events"
              />
            </label>
            <button
              className={"button " + (filterOpen ? "selected" : "")}
              onClick={() => setFilterOpen(!filterOpen)}
              aria-expanded={filterOpen}
              aria-controls="filters"
              ref={filterTrigger}
            >
              <SlidersHorizontal size={16} /> Filters{" "}
              {chips.length > 0 && (
                <span className="count">{chips.length}</span>
              )}
            </button>
            <button
              className="button finds-toggle"
              aria-pressed={filters.newOnly}
              onClick={() => set("newOnly", !filters.newOnly)}
            >
              <Sparkles size={15} />
              New finds
            </button>
            <button
              className="button finds-toggle going-filter"
              aria-pressed={filters.going}
              onClick={() => set("going", !filters.going)}
            >
              Going <span className="going-count">{attending.length}</span>
            </button>
            <button
              className="button tools-trigger"
              aria-haspopup="dialog"
              aria-label="Tools"
              onClick={() => setToolsOpen(true)}
            >
              <Settings2 size={16} /> <span>Tools</span>
            </button>
          </div>
          {filters.going && (
            <div className="going-summary">
              <strong>Showing {filtered.length} Going</strong>
              <span aria-hidden="true"> · </span>
              <button
                className="clear-going"
                onClick={() => set("going", false)}
              >
                Clear
              </button>
              <EventExports
                events={attending}
                entries={entries}
                goingOnly
                compact
              />
            </div>
          )}
          <div className="quick-row">
            <CountryFilter
              options={countryOptions(events)}
              selected={filters.countries}
              change={(countries) => set("countries", countries)}
            />
            <div
              className="quick-filters"
              role="group"
              aria-label="Quick filters"
            >
              {quick.map((q) => (
                <button
                  key={q.id}
                  aria-pressed={q.active}
                  onClick={q.toggle}
                  className={"outreach" in q ? "outreach-filter" : undefined}
                  title={"outreach" in q ? "Outreach status" : undefined}
                >
                  {"code" in q && <CountryFlag code={q.code} />}
                  {q.label}
                </button>
              ))}
              {activeQuick.length > 0 && (
                <button className="clear-quick" onClick={clearQuick}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {filterOpen && (
            <section
              className="filters"
              id="filters"
              ref={filterPanel}
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setFilterOpen(false);
                }
              }}
              aria-label="Event filters"
            >
              <div className="filter-heading">
                <div>
                  <span className="filter-kicker">
                    <SlidersHorizontal size={13} aria-hidden="true" />{" "}
                    {chips.length
                      ? `${chips.length} active`
                      : "No filters active"}
                  </span>
                  <h3>Find your fit</h3>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close filters"
                  onClick={() => setFilterOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="filter-grid">
                <fieldset>
                  <legend>Countries</legend>
                  <div className="check-scroll">
                    {countryOptions(events).map((o) => (
                      <label key={o.name}>
                        <input
                          type="checkbox"
                          checked={filters.countries.includes(o.name)}
                          onChange={() =>
                            set(
                              "countries",
                              filters.countries.includes(o.name)
                                ? filters.countries.filter((x) => x !== o.name)
                                : [...filters.countries, o.name],
                            )
                          }
                        />
                        <CountryFlag code={o.code} /> {o.name} ({o.count})
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Games</legend>
                  <div className="check-scroll">
                    {[...gameRules.map(([g]) => g), "Other"].map((g) => (
                      <label key={g}>
                        <input
                          type="checkbox"
                          checked={filters.games.includes(g)}
                          onChange={() =>
                            set(
                              "games",
                              filters.games.includes(g)
                                ? filters.games.filter((x) => x !== g)
                                : [...filters.games, g],
                            )
                          }
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="filter-fields">
                  <label>
                    Priority market
                    <select
                      value={filters.priority}
                      onChange={(e) => set("priority", e.target.value)}
                    >
                      <option value="any">All markets</option>
                      <option value="top">Top · HK & SG</option>
                      <option value="high">High or top · MY, HK & SG</option>
                    </select>
                  </label>
                  <label>
                    Size tier
                    <select
                      value={filters.size}
                      onChange={(e) => set("size", e.target.value)}
                    >
                      <option value="">All sizes</option>
                      {["S", "M", "L", "XL"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={filters.status}
                      onChange={(e) => set("status", e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {["confirmed", "estimated", "tba", "cancelled", "postponed"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="filter-fields">
                  <label>
                    From
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) => set("from", e.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) => set("to", e.target.value)}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={filters.tba}
                      onChange={(e) => set("tba", e.target.checked)}
                    />{" "}
                    Include TBA dates
                  </label>
                  <label className="passed-toggle">
                    <input
                      type="checkbox"
                      checked={showPassed}
                      onChange={(e) => setShowPassed(e.target.checked)}
                    />{" "}
                    Show passed / too expensive
                  </label>
                </div>
                <div className="filter-fields">
                  <label>
                    Priority
                    <select
                      value={filters.minTier}
                      onChange={(ev) =>
                        set(
                          "minTier",
                          ev.target.value as typeof filters.minTier,
                        )
                      }
                    >
                      <option value="any">Any</option>
                      <option value="strong">Strong+</option>
                      <option value="must">Must-do only</option>
                    </select>
                  </label>
                  <label>
                    Minimum scanner score · {filters.score}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.score}
                      style={{ "--fill": `${filters.score}%` } as CSSProperties}
                      onChange={(e) => set("score", +e.target.value)}
                    />
                  </label>
                  <fieldset>
                    <legend>Pipeline stages</legend>
                    {stages.map((stage) => (
                      <label className="check" key={stage}>
                        <input
                          type="checkbox"
                          checked={filters.stages.includes(stage)}
                          onChange={() =>
                            set(
                              "stages",
                              filters.stages.includes(stage)
                                ? filters.stages.filter((s) => s !== stage)
                                : [...filters.stages, stage],
                            )
                          }
                        />
                        {stage}
                      </label>
                    ))}
                  </fieldset>
                </div>
              </div>
              <div className="filter-foot">
                <button
                  className="button"
                  disabled={chips.length === 0}
                  onClick={() => setFilters(emptyFilters)}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Reset all filters
                </button>
                <button
                  className="button primary"
                  onClick={() => setFilterOpen(false)}
                >
                  Show {filtered.length}{" "}
                  {filtered.length === 1 ? "event" : "events"}
                </button>
              </div>
            </section>
          )}
          {otherChips.length > 0 && (
            <div className="chips">
              {otherChips.map((c) => (
                <button
                  key={c.id}
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                >
                  {c.label}
                  <X size={12} />
                </button>
              ))}
              <button
                className="clear"
                onClick={() => setFilters(emptyFilters)}
              >
                Clear all
              </button>
            </div>
          )}
          {["Calendar", "Timeline", "Top picks", "Pipeline"].includes(view) && (
            <div className="timeline-controls">
              {sortControl}
              {view === "Timeline" && <label className="passed-toggle">
                <input
                  type="checkbox"
                  checked={groupByStage}
                  onChange={(e) => setGroupByStage(e.target.checked)}
                />
                Group by pipeline stage
              </label>}
            </div>
          )}
          {view === "Top picks" ? (
            <TopPicks
              events={sorted}
              today={today}
              scores={scores}
              entries={entries}
              setGoing={setGoing}
              open={open}
            />
          ) : view === "Pipeline" ? (
            <Pipeline
              today={today}
              sort={sort}
              events={sorted}
              scores={scores}
              entries={entries}
              open={open}
              setGoing={setGoing}
              change={(e, stage) => update(e.id, "stage", stage)}
            />
          ) : view === "Calendar" ? (
            <CalendarView
              filtered={sorted}
              scores={scores}
              entries={entries}
              setGoing={setGoing}
              month={month}
              setMonth={setMonth}
              initialMonth={initialMonth}
              today={today}
              open={open}
            />
          ) : view === "Timeline" ? (
            <div className="timeline">
              {orderTimelineGroups(groups, groupByStage, sort)
                .map(([m, items]) => (
                  <section key={m}>
                    <h3>
                      {groupByStage
                        ? m
                        : m === "9999"
                          ? "Dates to be announced"
                          : monthLabel(m)}
                      <span>{items.length} events</span>
                    </h3>
                    <div className="cards">
                      {items.map(({ e, label }) => card(e, label))}
                    </div>
                  </section>
                ))}
            </div>
          ) : (
            <>
              <div className="list-heading">
                <span className="list-count" role="status">
                  {visibleList.length}{" "}
                  {visibleList.length === 1 ? "event" : "events"}
                </span>
                {sortControl}
                {showRows && (
                  <>
                    <RowColumns columns={columns} change={setColumns} />
                    <button
                      className="button select-mode"
                      aria-pressed={selectMode}
                      onClick={() => setSelectMode(!selectMode)}
                    >
                      <ListChecks size={16} /> Bulk select
                    </button>
                  </>
                )}
                {view === "List" && (
                  <div
                    className="list-switch"
                    role="group"
                    aria-label="List layout"
                  >
                    <button
                      aria-pressed={listView === "grid"}
                      onClick={() => {
                        setListView("grid");
                        setSelectMode(false);
                      }}
                    >
                      <LayoutGrid size={16} />
                      Grid
                    </button>
                    <button
                      aria-pressed={listView === "rows"}
                      onClick={() => setListView("rows")}
                    >
                      <List size={16} />
                      Rows
                    </button>
                  </div>
                )}
              </div>
              {showRows ? (
                visibleList.length > 0 && (
                  <EventRows
                    columns={columns}
                    groups={listGroups}
                    key={String(selectMode)}
                    selectMode={selectMode}
                    setGoing={setGoing}
                    sort={sort}
                    setSort={setSort}
                    entries={entries}
                    scores={scores}
                    today={today}
                    now={now}
                    open={open}
                  />
                )
              ) : (
                <CardSections groups={listGroups} sortKey={sort.key}>
                  {(e, titleLevel) => (
                    <div key={e.id}>
                      {card(e, undefined, titleLevel)}
                      {view === "Recurring SG" && (
                        <div
                          className="occurrences"
                          role="group"
                          aria-label={`Published dates for ${e.name}`}
                        >
                          <span className="occ-title">
                            <CalendarDays size={14} aria-hidden="true" />{" "}
                            Published dates
                          </span>
                          {ranges(e).map((r) => (
                            <span key={r.start_date}>
                              {prettyDate(r.start_date)}
                              {r.start_date !== r.end_date
                                ? " – " + prettyDate(r.end_date)
                                : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardSections>
              )}
              {visibleList.length === 0 && noResults}
            </>
          )}
          {view === "Timeline" && groups.size === 0 && noResults}
          {view !== "Top picks" && (
            <div className="calendar-foot">
              <span className="legend" role="list" aria-label="Date status key">
                <span role="listitem" className="badge confirmed">
                  ● Confirmed
                </span>
                <span role="listitem" className="badge estimated">
                  ◷ Estimated
                </span>
                <span role="listitem" className="badge tba">
                  ◇ TBA
                </span>
                <span role="listitem" className="badge recurring-key">
                  Recurring SG
                </span>
              </span>
              <span>Event dates are local to the venue.</span>
            </div>
          )}
        </section>
        <footer>
          <span className="footer-brand">
            <BrandMark /> Holo Vault <span>TCG Vendor Calendar</span>
          </span>
          <span>Data last updated {prettyDate(meta.updatedAt)}</span>
          <small>
            Verify dates and vendor terms with organizers before booking.
          </small>
        </footer>
      </main>
      {!onEventPage && toolsOpen && (
        <Modal
          title={
            <>
              <Settings2 size={21} />
              Tools
            </>
          }
          titleId="tools-title"
          closeLabel="Close tools"
          close={() => setToolsOpen(false)}
          className="tools-dialog"
        >
          <section className="tool-settings" aria-labelledby="priority-travel-title">
            <h3 id="priority-travel-title">Priority and travel</h3>
            <div className="home-base-setting">
              <label htmlFor="home-base">Home base</label>
              <select
                id="home-base"
                value={priority.homeBase}
                aria-describedby="home-base-help"
                onChange={(event) => priority.setHomeBase(event.target.value)}
              >
                {HOME_BASE_GROUPS.map(({ country, bases }) => (
                  <optgroup key={country} label={country}>
                    {bases.map(({ id, city }) => (
                      <option key={id} value={id}>
                        {city}{id === DEFAULT_HOME_BASE.id && " (default)"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <small id="home-base-help">
                Home base only affects Logistics in Priority. Travel uses qualitative city and country bands.
                If your scores previously used Singapore, the new default changes your Logistics scores.
              </small>
            </div>
            <button
              className="button"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
            >
              <SlidersHorizontal size={16} /> Score weights
            </button>
          </section>
          <section className="tool-exports" aria-label="Event exports">
            <EventExports events={attending} entries={entries} goingOnly />
            <EventExports events={filtered} entries={entries} />
          </section>
          <label className="passed-toggle tool-toggle">
            <input
              type="checkbox"
              checked={show2026}
              onChange={(e) => setShow2026(e.target.checked)}
            />{" "}
            Show 2026 events (hidden by default; notes and stages are kept)
          </label>
          <BackupControls
            entries={entries}
            outreach={outreach}
            milestones={milestones}
            vendorPricing={vendorPricing}
            ids={allEvents.map((e) => e.id)}
            apply={applyEntries}
            priority={{
              weights: priority.weights,
              overrides: priority.overrides,
              homeBase: priority.homeBase,
            }}
            applyPriority={(value) => {
              priority.setWeights(value.weights);
              priority.setOverrides(value.overrides);
              if (value.homeBase !== undefined) priority.setHomeBase(value.homeBase);
            }}
          />

          {toast}
        </Modal>
      )}
      {!onEventPage && !toolsOpen && toast}
      <Suspense fallback={null}>
        {!onEventPage && settingsOpen && (
          <ScoreSettings
            weights={priority.weights}
            change={priority.setWeights}
            close={() => setSettingsOpen(false)}
          />
        )}
      </Suspense>
      {onEventPage && (
        <main className="event-page">
          <nav className="event-back" aria-label="Event navigation">
            <button className="button" onClick={back}>
              {route.fromEvent ? "← Back to previous event" : "← Back to events"}
            </button>
          </nav>
          {storageWarning}
          {selected ? (
            <Suspense fallback={<p role="status">Loading event…</p>}>
              <Detail
                today={today}
                now={now}
                toast={toast}
                e={selected}
                score={scores[selected.id]}
                setOverride={(value) => priority.setOverride(selected.id, value)}
                openClash={openEvent}
                occurrence={route.occurrence}
                key={selected.id}
                entry={entries[selected.id] || emptyEntry}
                saved={saved}
                setGoing={setGoing}
                onStage={(stage) => update(selected.id, "stage", stage)}
                onNote={(note) => update(selected.id, "note", note)}
                knownOutreach={sharedSelection?.outreach}
                onOutreach={(patch) => updateOutreach(selected.id, patch, sharedSelection?.outreach)}
                sharedMilestones={sharedSelection?.vendor_milestones}
                localMilestones={Object.hasOwn(milestones, selected.id) ? milestones[selected.id] : undefined}
                onMilestone={(milestone) => updateMilestone(selected.id, milestone)}
                onRemoveMilestone={(id) => resetMilestone(selected.id, id)}
                sharedVendorPricing={sharedSelection ?? undefined}
                localVendorPricing={Object.hasOwn(vendorPricing, selected.id) ? vendorPricing[selected.id] : undefined}
                onVendorPricing={(patch) => updateVendorPricing(selected.id, patch)}
                onRemoveVendorPricing={(field, id) => resetVendorPricing(selected.id, field, id)}
              />
            </Suspense>
          ) : (
            <section className="missing-event">
              <h1 tabIndex={-1} ref={focusHeading}>Event not found</h1>
              <p>This event link doesn’t match a show in the calendar.</p>
            </section>
          )}
        </main>
      )}
    </>
  );
}
