import { useEventRoute } from "./hooks/useEventRoute";
import { usePriority } from "./hooks/usePriority";
import { DEFAULT_HOME_BASE, HOME_BASE_GROUPS } from "./homeBase";
import { Modal } from "./components/Modal";
import { FilterContents, statusLabels } from "./components/FilterContents";
import { FirstRunTip } from "./components/FirstRunTip";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { EventRows, RowColumns, RowSortControl } from "./components/EventRows";
import { normalizeColumns, normalizeListView, loadSort, SORT_STORAGE_KEY, groupSortedRows, orderTimelineGroups, sortRows } from "./rows";
import { CalendarView } from "./components/CalendarView";
import { CardSections } from "./components/ListSections";
import { EventCard } from "./components/EventCard";
import { CompareEvents, CompareTray } from "./components/CompareEvents";
import { canCompare, COMPARE_PINS_KEY, normalizeComparePins, resolveComparePins, selectCompareOccurrence, toggleComparePin } from "./compare";
import { EventBulkBar, useEventSelection } from "./components/EventSelection";
import { BrandLockup, BrandMark } from "./components/Brand";
import { EmptyState } from "./components/EmptyState";
import { EventExports } from "./components/EventExports";
import { TopPicks } from "./components/TopPicks";
import { UpcomingMilestones, useMilestoneClock } from "./components/UpcomingMilestones";
import { OutreachFollowUps } from "./components/OutreachFollowUps";
import { WeeklyDigest } from "./components/WeeklyDigest";
import { buildDigestSnapshot, digestActions, digestChanges, DIGEST_STORAGE_KEY, loadDigestCheckpoint, saveDigestCheckpoint } from "./weeklyDigest";
import { Pipeline } from "./components/Pipeline";
import { BackupControls } from "./components/BackupControls";
import { BudgetDefaultsForm } from "./components/TripBudget";
import { emptyEntry, hasLocalPlanning, saveValue, stageSuggestions, withSuggestedStages, LIST_PREFERENCE_KEYS, type ListPreferences, type Stage } from "./storage";
import { scoreEvent } from "./scoring";
import { goingConflicts } from "./eventDecision";
import {
  lazy,
  Suspense,
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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
  ranges,
  matchingEvent,
  goingEvents,
  monthLabel,
  formatDateRange,
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
const viewDescriptions = {
  List: "Browse and filter all events.",
  "Top picks": "Find the highest-scoring upcoming events.",
  Calendar: "Browse events on a monthly calendar.",
  Timeline: "Browse dates and group events by month or stage.",
  Watchlist: "Track shows whose dates have yet to be announced.",
  "Recurring SG": "Browse recurring Singapore shows and their published dates.",
  Pipeline: "Track decisions and booth bookings by stage.",
};
const listPreferenceNames = Object.keys(LIST_PREFERENCE_KEYS) as (keyof ListPreferences)[];

export default function App() {
  const shippedEvents = useMemo(() => normalizeEvents(raw), []);
  const {
    entries: savedEntries,
    outreach,
    milestones,
    vendorPricing,
    tripBudget,
    updateTripBudget,
    updateBudgetDefaults,
    update,
    updateStage,
    updateOutreach,
    updateMilestone,
    resetMilestone,
    updateVendorPricing,
    resetVendorPricing,
    applyEntries,
    setGoing: updateGoing,
    undo,
    undoChange,
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
  const suggestions = useMemo(() => stageSuggestions(allEvents), [allEvents]);
  const entries = useMemo(() => withSuggestedStages(savedEntries, suggestions), [savedEntries, suggestions]);
  const setGoing = useCallback((ids: readonly string[], going: boolean) => {
    updateGoing(ids, going, suggestions);
  }, [updateGoing, suggestions]);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const trackUndoFocus = useCallback((button: HTMLButtonElement | null) => {
    undoButton.current = button;
    if (!button) return;
    return () => {
      undoButton.current = null;
      if (document.activeElement !== button) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body) return;
        const picker = undo?.kind === "stage" && document.querySelector<HTMLElement>(
          `main:not([hidden]) [data-event-id="${CSS.escape(undo.patch.id)}"] .stage-picker`,
        );
        if (picker) picker.focus();
        else (document.querySelector<HTMLElement>(".event-page h1") ?? workspaceHeading.current)?.focus({ preventScroll: true });
      });
    };
  }, [undo]);
  const setStage = useCallback((id: string, stage: Stage) => {
    const focused = document.activeElement;
    const name = shippedEvents.find((e) => e.id === id)?.name ?? id;
    updateStage(id, name, stage);
    if (focused?.matches(".stage-picker"))
      requestAnimationFrame(() => {
        if (!focused.isConnected && document.activeElement === document.body)
          (undoButton.current ?? workspaceHeading.current)?.focus({ preventScroll: true });
      });
  }, [shippedEvents, updateStage]);
  const [show2026, setShow2026] = useState(
    () => stored("tcg-show-2026-v1") === true,
  );
  const activeEvents = useMemo(() => allEvents.filter((event) => !event.scanner_archived), [allEvents]);
  const events = useMemo(() => seasonEvents(activeEvents, show2026), [activeEvents, show2026]);
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
  const priority = usePriority(activeEvents, today, now, setStorageError);
  const { scores } = priority;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [comparePins, setComparePins] = useState(() => normalizeComparePins(stored(COMPARE_PINS_KEY), shippedEvents));
  useEffect(() => {
    const error = saveValue(COMPARE_PINS_KEY, comparePins.length ? comparePins : undefined);
    if (error) setStorageError(error);
  }, [comparePins, setStorageError]);
  const [compareOpen, setCompareOpen] = useState(false);
  const compareTrigger = useRef<HTMLButtonElement>(null);
  const focusCompareTrigger = useCallback(() => compareTrigger.current, []);
  const [digestOpen, setDigestOpen] = useState(false);
  const digestTrigger = useRef<HTMLButtonElement>(null);
  const focusDigestTrigger = useCallback(() => digestTrigger.current ?? workspaceHeading.current, []);
  const digestSnapshot = useMemo(() => buildDigestSnapshot(shippedEvents, meta.updatedAt), [shippedEvents]);
  const [digestReview, setDigestReview] = useState(loadDigestCheckpoint);
  useEffect(() => {
    function syncReview(event: StorageEvent) {
      if (event.key === DIGEST_STORAGE_KEY || event.key === null) setDigestReview(loadDigestCheckpoint());
    }
    window.addEventListener("storage", syncReview);
    return () => window.removeEventListener("storage", syncReview);
  }, []);
  function markDigestReviewed() {
    const result = saveDigestCheckpoint(digestSnapshot);
    setDigestReview((previous) => result.error ? { ...previous, error: result.error } : result);
  }
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
  const [listPreferences, setListPreferences] = useState<ListPreferences>(() => {
    const preferences: ListPreferences = {};
    for (const key of listPreferenceNames) {
      const value = stored(LIST_PREFERENCE_KEYS[key]);
      if (typeof value === "boolean") preferences[key] = value;
    }
    return preferences;
  });
  function applyListPreferences(preferences: ListPreferences, mode: "merge" | "replace" = "merge") {
    setListPreferences((current) => mode === "replace" ? preferences : { ...current, ...preferences });
    for (const key of listPreferenceNames) {
      if (mode === "merge" && preferences[key] === undefined) continue;
      const error = saveValue(LIST_PREFERENCE_KEYS[key], preferences[key]);
      if (error) setStorageError(error);
    }
  }
  const onEventPage = route.page === "event";
  const openableEvent = (id: string | null) => allEvents.find((event) => event.id === id &&
    (!event.scanner_archived || Object.hasOwn(priority.overrides, id) ||
      hasLocalPlanning(id, { entries: savedEntries, outreach, milestones, vendorPricing, tripBudget })));
  const selected = onEventPage
    ? events.find((event) => event.id === route.id) ?? openableEvent(route.id)
    : null;
  const sharedSelection = selected && shippedEvents.find((event) => event.id === selected.id);
  useEffect(() => {
    document.title = onEventPage
      ? (selected?.name ?? "Event not found") + " – Holo Vault"
      : defaultTitle;
  }, [onEventPage, selected]);
  const [view, setView] = useState(listContext?.view ?? "List");
  const filterSheet = useMediaQuery("(max-width: 640px)");
  const deadlinesExpanded = listPreferences.deadlinesExpanded === true;
  const followUpsExpanded = listPreferences.followUpsExpanded === true;
  const showPast = listPreferences.showPast === true;
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
  const timelineFilters = useMemo(() =>
    view === "Timeline" && !showPast && filters.from < today ? { ...filters, from: today } : filters,
  [view, showPast, filters, today]);
  const { filtered, viewEvents, hidden } = useMemo(() => {
    const inView = (e: Event) => view === "Watchlist" ? e.section === "watchlist"
      : view === "Recurring SG" ? e.section === "recurring_sg" : true;
    const matchEvents = (source: Event[], activeFilters: typeof filters) =>
      source.flatMap((e) => {
        const match = matchingEvent(e, activeFilters, entries, scores[e.id].score, today);
        return match ? [match] : [];
      });
    const passesStage = (e: Event) => {
      const stage = (entries[e.id] || emptyEntry).stage;
      return filters.stages.includes(stage) || (stage !== "Passed" && stage !== "Too expensive");
    };
    const matches = matchEvents(events, timelineFilters);
    const filtered = showPassed ? matches : matches.filter(passesStage);
    const viewEvents = filtered.filter(inView);
    const visibleMatches = (source: Event[], activeFilters: typeof filters) =>
      matchEvents(source, activeFilters).filter((e) => inView(e) && (showPassed || passesStage(e)));
    const countHidden = (before: Event[], after: Event[]) => {
      const shown = new Map(after.map((e) => [e.id, ranges(e).length]));
      return before.filter((e) => (shown.get(e.id) ?? -1) < ranges(e).length).length;
    };
    return {
      filtered,
      viewEvents,
      hidden: {
        passed: showPassed ? 0 : matches.filter(inView).length - viewEvents.length,
        earlier: show2026 ? 0 : countHidden(visibleMatches(activeEvents, timelineFilters), viewEvents),
        past: timelineFilters === filters ? 0 : countHidden(visibleMatches(events, filters), viewEvents),
      },
    };
  }, [activeEvents, events, filters, timelineFilters, entries, scores, today, show2026, showPassed, view]);
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
                  ? "Key markets · Hong Kong & Singapore"
                  : "Key markets · Malaysia, Hong Kong & Singapore"
                : k === "size" ? `Show size · ${filters.size}` : statusLabels[filters.status],
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
      label: `Fit score ≥ ${filters.score}`,
      clear: () => set("score", 0),
    });
  if (!filters.tba)
    chips.push({
      id: "tba",
      label: "Announced dates only",
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
            {undo.kind === "stage" ? `Moved ${undo.name} to ${undo.stage}` : undo.going
              ? `Marked ${undo.patch.length} Going`
              : `Removed ${undo.patch.length} from Going`}
          </span>
          <span aria-hidden="true"> · </span>
          <button ref={trackUndoFocus} onClick={undoChange}>Undo</button>
        </>
      )}
    </div>
  );
  const showRows = view === "List" && listView === "rows";
  const sorted = useMemo(
    () => sortRows(viewEvents, sort, entries, scores, today),
    [viewEvents, sort, entries, scores, today],
  );
  const eventSelection = useEventSelection(sorted, setGoing);
  const selection = view === "List" && selectMode ? eventSelection : undefined;
  const pinnedEvents = useMemo(() => resolveComparePins(comparePins, allEvents, events, sorted, today),
    [comparePins, allEvents, events, sorted, today]);
  const canPin = view === "List";
  const compareSelection = useMemo(() => ({
    pins: comparePins,
    toggle: (event: Event) => setComparePins((pins) => toggleComparePin(pins, event, today)),
  }), [comparePins, today]);
  function card(e: Event, occurrence?: string, titleLevel?: 3 | 4) {
    return (
      <EventCard
        key={e.id + (occurrence || "")}
        e={e}
        entry={entries[e.id] || emptyEntry}
        score={scores[e.id]}
        entries={entries}
        setGoing={setGoing}
        setStage={setStage}
        today={today}
        now={now}
        occurrence={occurrence}
        titleLevel={titleLevel}
        columns={view === "List" ? columns : undefined}
        selection={selection}
        comparison={canPin ? compareSelection : undefined}
        open={open}
      />
    );
  }
  const groups = useMemo(
    () =>
      timelineGroups(
        view === "Timeline" ? sorted : [],
        timelineFilters,
        entries,
        groupByStage,
        today,
      ),
    [view, sorted, timelineFilters, entries, groupByStage, today],
  );
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterPanel = useRef<HTMLElement>(null);
  const activeFilterCount = chips.length + Number(showPassed);
  function resetFilters() {
    setFilters(emptyFilters);
    setShowPassed(false);
  }
  const focusFilterTrigger = useCallback(() => filterTrigger.current, []);
  useLayoutEffect(() => {
    if (!filterOpen || filterSheet || onEventPage) return;
    filterPanel.current?.focus();
    return () => {
      filterTrigger.current?.focus({ preventScroll: true });
    };
  }, [filterOpen, filterSheet, onEventPage]);
  const listGroups = useMemo(
    () => groupSortedRows(sorted, sort.key, today),
    [sorted, sort.key, today],
  );
  const sortControl = <RowSortControl sort={sort} setSort={setSort} />;
  const visibilityControls = [
    { hidden: hidden.passed, reason: "passed", showLabel: "Show passed", hideLabel: "Hide passed", shown: showPassed,
      toggle: () => setShowPassed(!showPassed) },
    { hidden: hidden.earlier, reason: "2026", showLabel: "Show 2026", hideLabel: "Hide 2026", shown: show2026,
      toggle: () => setShow2026(!show2026) },
    ...(view === "Timeline" ? [
      { hidden: hidden.past, reason: "past", showLabel: "Show past", hideLabel: "Hide past", shown: showPast,
        toggle: () => applyListPreferences({ showPast: !showPast }) },
    ] : []),
  ];
  const eventCount = (
    <div className="list-count" role="status">
      <span>{viewEvents.length} {viewEvents.length === 1 ? "event" : "events"}</span>
      {visibilityControls.filter((control) => control.hidden > 0 || control.shown).map((control) => (
        <span key={control.reason} className="visibility-option">
          {control.hidden > 0 && (
            <span id={`hidden-${control.reason}`}>{control.hidden} hidden ({control.reason})</span>
          )}
          <button className="visibility-toggle"
            aria-describedby={control.hidden > 0 ? `hidden-${control.reason}` : undefined} onClick={control.toggle}>
            {control.shown ? control.hideLabel : control.showLabel}
          </button>
        </span>
      ))}
    </div>
  );
  const countries = useMemo(() => countryOptions(events), [events]);
  const filterContents = filterOpen && (
    <FilterContents countries={countries} filters={filters} set={set} reset={resetFilters}
      activeCount={activeFilterCount} showPassed={showPassed} setShowPassed={setShowPassed} matchCount={viewEvents.length}
      compact={filterSheet} close={() => setFilterOpen(false)} />
  );
  const noResults = (
    <EmptyState
      icon={SearchX}
      title="No matching events"
      action={
        chips.length > 0 ? (
          <button className="button" onClick={resetFilters}>
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
            {Object.entries(viewDescriptions).map(([v, description]) => (
              <button
                key={v}
                title={description}
                className={view === v ? "active" : ""}
                aria-current={view === v ? "page" : undefined}
                onClick={(ev) => {
                  setView(v);
                  setSelectMode(false);
                  eventSelection.selectAll(false);
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
          <div className="toolbar">
            <label className="search">
              <Search size={18} />
              <input
                ref={searchInput}
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
              aria-controls={filterOpen ? "filters" : undefined}
              aria-haspopup={filterSheet ? "dialog" : undefined}
              ref={filterTrigger}
            >
              <SlidersHorizontal size={16} /> Filters{activeFilterCount > 0 && ` · ${activeFilterCount}`}
            </button>
            <button
              className="button finds-toggle"
              title="Show newly discovered events."
              aria-pressed={filters.newOnly}
              onClick={() => set("newOnly", !filters.newOnly)}
            >
              <Sparkles size={15} />
              New finds
            </button>
            <button
              className="button finds-toggle going-filter"
              title="Show your shortlisted events."
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
          {view === "List" && !listPreferences.firstRunDismissed && (
            <FirstRunTip
              search={() => searchInput.current?.focus()}
              dismiss={() => {
                applyListPreferences({ firstRunDismissed: true });
                searchInput.current?.focus();
              }}
            />
          )}
          {view === "List" && (
            <>
              <UpcomingMilestones events={activeEvents} open={open} focusFallback={workspaceHeading}
                bannerExpanded={deadlinesExpanded} toggle={() => applyListPreferences({ deadlinesExpanded: !deadlinesExpanded })} />
              <OutreachFollowUps events={activeEvents} today={today} focusFallback={workspaceHeading}
                bannerExpanded={followUpsExpanded} toggle={() => applyListPreferences({ followUpsExpanded: !followUpsExpanded })}
                open={(event, returnFocus) => open(event, undefined, returnFocus)} />
              <div className="digest-launch">
                <button type="button" className="button" ref={digestTrigger} aria-haspopup="dialog"
                  onClick={() => setDigestOpen(true)}>
                  <CalendarDays size={17} aria-hidden="true" /> Weekly digest
                </button>
              </div>
            </>
          )}
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
              options={countries}
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
          {filterOpen && !filterSheet && (
            <section className="filters" id="filters" ref={filterPanel} tabIndex={-1}
              aria-labelledby="filter-title" onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setFilterOpen(false);
                }
              }}>
              <div className="filter-heading">
                <h3 id="filter-title">Filters</h3>
                <button className="icon-button" aria-label="Close filters" onClick={() => setFilterOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              {filterContents}
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
                onClick={resetFilters}
              >
                Clear all
              </button>
            </div>
          )}
          {["Calendar", "Timeline", "Top picks", "Pipeline"].includes(view) && (
            <div className="timeline-controls">
              {eventCount}
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
          {!onEventPage && (canPin || pinnedEvents.length > 0) && (
            <CompareTray pins={pinnedEvents} canPin={canPin} trigger={compareTrigger} open={() => setCompareOpen(true)}
              remove={(id) => {
                if (!canPin && pinnedEvents.length === 1) focusHeading(workspaceHeading.current);
                setComparePins((pins) => pins.filter((pin) => pin.id !== id));
              }} />
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
              key={JSON.stringify([filters, sort, showPassed, show2026])}
              today={today}
              now={now}
              sort={sort}
              events={sorted}
              scores={scores}
              entries={entries}
              open={open}
              setGoing={setGoing}
              change={(e, stage) => setStage(e.id, stage)}
              browse={() => {
                setView("List");
                requestAnimationFrame(() => focusHeading(workspaceHeading.current));
              }}
            />
          ) : view === "Calendar" ? (
            <CalendarView
              filtered={sorted}
              scores={scores}
              entries={entries}
              setGoing={setGoing}
              setStage={setStage}
              month={month}
              setMonth={setMonth}
              initialMonth={initialMonth}
              today={today}
              now={now}
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
                          ? "Dates not announced"
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
                {eventCount}
                {sortControl}
                {view === "List" && (
                  <div className="list-actions">
                    <RowColumns columns={columns} change={setColumns} />
                    <button
                      className="button select-mode"
                      aria-pressed={selectMode}
                      onClick={() => {
                        eventSelection.selectAll(false);
                        setSelectMode(!selectMode);
                      }}
                    >
                      <ListChecks size={16} /> Bulk select
                    </button>
                    <div className="list-switch" role="group" aria-label="List layout">
                      <button aria-pressed={listView === "grid"} onClick={() => setListView("grid")}>
                        <LayoutGrid size={16} /> Grid
                      </button>
                      <button aria-pressed={listView === "rows"} onClick={() => setListView("rows")}>
                        <List size={16} /> Rows
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {selection && sorted.length > 0 && <EventBulkBar selection={selection} rows={showRows} />}
              {showRows ? (
                sorted.length > 0 && (
                  <EventRows
                    columns={columns}
                    groups={listGroups}
                    selection={selection}
                    comparison={compareSelection}
                    setGoing={setGoing}
                    setStage={setStage}
                    sort={sort}
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
                              {formatDateRange(r.start_date, r.end_date)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardSections>
              )}
              {sorted.length === 0 && noResults}
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
                  ◇ Dates not announced
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
      {!onEventPage && digestOpen && (
        <WeeklyDigest changes={digestChanges(digestReview.checkpoint, digestSnapshot)}
          actions={digestActions(allEvents, now)} review={digestReview} now={now}
          snapshotDate={digestSnapshot.snapshotDate} markReviewed={markDigestReviewed}
          canOpen={(id) => Boolean(openableEvent(id))}
          openEvent={(id) => {
            const event = openableEvent(id);
            if (!event) return;
            setDigestOpen(false);
            open(event, undefined, focusDigestTrigger);
          }}
          close={() => setDigestOpen(false)} returnFocus={focusDigestTrigger} />
      )}
      {!onEventPage && compareOpen && canCompare(pinnedEvents) && (
        <CompareEvents pins={pinnedEvents} entries={entries} budgets={tripBudget.events}
          scores={Object.fromEntries(pinnedEvents.map(({ event }) => [event.id, scores[event.id] ?? scoreEvent(event, {
            today, now, weights: priority.weights, overrides: priority.overrides, homeBase: priority.homeBase,
          })]))}
          defaults={tripBudget.defaults} homeBase={priority.homeBase} today={today} now={now}
          onOccurrence={(id, occurrence) => setComparePins((pins) => selectCompareOccurrence(pins, id, occurrence))}
          returnFocus={focusCompareTrigger} close={() => setCompareOpen(false)} />
      )}
      {!onEventPage && filterOpen && filterSheet && (
        <Modal title="Filters" titleId="filter-title" closeLabel="Close filters"
          id="filters" className="filter-sheet" returnFocus={focusFilterTrigger} close={() => setFilterOpen(false)}>
          {filterContents}
        </Modal>
      )}
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
                Home base informs Logistics in Priority. The budget uses no travel cost estimate from it.
                Events in your home city default to 0 lodging nights.
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
          <BudgetDefaultsForm defaults={tripBudget.defaults} save={updateBudgetDefaults} />
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
            entries={savedEntries}
            outreach={outreach}
            milestones={milestones}
            vendorPricing={vendorPricing}
            tripBudget={tripBudget}
            ids={allEvents.map((e) => e.id)}
            apply={applyEntries}
            listPreferences={listPreferences}
            applyListPreferences={applyListPreferences}
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
                score={scores[selected.id] ?? scoreEvent(selected, {
                  today, now, weights: priority.weights, overrides: priority.overrides, homeBase: priority.homeBase,
                })}
                setOverride={(value) => priority.setOverride(selected.id, value)}
                openClash={openEvent}
                conflicts={goingConflicts(
                  allEvents.find((event) => event.id === selected.id) ?? selected,
                  activeEvents, entries, today, route.occurrence,
                )}
                occurrence={route.occurrence}
                key={selected.id}
                entry={entries[selected.id] || emptyEntry}
                saved={saved}
                setGoing={setGoing}
                onStage={(stage) => setStage(selected.id, stage)}
                onNote={(note) => update(selected.id, note)}
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
                homeBase={priority.homeBase}
                localBudget={Object.hasOwn(tripBudget.events, selected.id) ? tripBudget.events[selected.id] : undefined}
                budgetDefaults={tripBudget.defaults}
                onTripBudget={(value) => updateTripBudget(selected.id, value)}
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
