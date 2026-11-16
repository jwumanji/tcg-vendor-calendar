import { EventCard } from "./components/EventCard";
import { Logo, Status } from "./components/EventIdentity";
import { Detail } from "./components/Detail";
import { Pipeline, StageBadge } from "./components/Pipeline";
import { BackupControls } from "./components/BackupControls";
import { stages, emptyEntry, loadEntries, saveValue, backup, STORAGE_KEY, type Entries, type Stage } from "./storage";
import { useState, useEffect, useCallback } from "react";

import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  X,
  Download,
  Sun,
  Moon,
  MapPin,
  Bookmark,
  Layers,
  LayoutList,
  Clock,
} from "lucide-react";
import raw from "../data/events.json";
import type { Event, Filters } from "./model";
import { emptyFilters } from "./model";
import {
  games,
  gameRules,
  ranges,
  matches,
  monthLabel,
  monthEnd,
  prettyDate,
  dateLabel,
  flag,
  deadlineDate,
  safeUrl,
  ics,
  csv,
  download,
} from "./utils";
import "./style.css";
const events = raw as Event[];
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const today = new Date().toLocaleDateString("en-CA");
const upcoming = (e: Event) =>
  e.date_status === "tba" ||
  (e.estimated_month
    ? monthEnd(e.estimated_month) >= today
    : ranges(e).some((r) => r.end_date >= today));
const initialMonth = events.some((e) =>
  ranges(e).some((r) => r.start_date.slice(0, 7) === today.slice(0, 7)),
)
  ? today.slice(0, 7)
  : "2027-01";
export default function App() {
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    ...stored("tcg-filters", {}),
  }));
  const [loaded] = useState(() => { try { return loadEntries(localStorage); } catch { return { entries: {}, error: "Storage is unavailable. Export a backup to keep your changes." }; } });
  const [entries, setEntries] = useState<Entries>(loaded.entries);
  const [storageError, setStorageError] = useState(loaded.error);
  const [saved, setSaved] = useState(false);
  const [canSave, setCanSave] = useState(!loaded.error);
  const [showPassed, setShowPassed] = useState(() => stored<boolean>("tcg-show-passed-v1", false));
  function update(id: string, field: 'stage' | 'note', value: string) {
    setSaved(false);
    setCanSave(true);
    setEntries(current => ({ ...current, [id]: { ...(current[id] || emptyEntry), [field]: value, [field === 'stage' ? 'stageUpdatedAt' : 'noteUpdatedAt']: new Date().toISOString() } }));
  }
  const visible = (e: Event) => showPassed || !['Pass', 'Too expensive'].includes((entries[e.id] || emptyEntry).stage);
  const closeDetail = useCallback(() => setSelected(null), []);
  const [view, setView] = useState("Calendar");
  const [month, setMonth] = useState(initialMonth);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);
  const [sort, setSort] = useState("date");
  const [groupByStage, setGroupByStage] = useState(false);
  const [theme, setTheme] = useState(() =>
    stored<string>("tcg-theme", "system"),
  );
  useEffect(() => {
    const error = saveValue("tcg-filters", filters); if (error) setStorageError(error);
  }, [filters]);
  useEffect(() => {
    if (!canSave) return;
    const error = saveValue(STORAGE_KEY, backup(entries));
    setSaved(!error); if (error) setStorageError(error);
  }, [entries, canSave]);
  useEffect(() => { const error = saveValue("tcg-show-passed-v1", showPassed); if (error) setStorageError(error); }, [showPassed]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const error = saveValue("tcg-theme", theme); if (error) setStorageError(error);
  }, [theme]);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const filtered = events.filter((e) => matches(e, filters, entries) && (view === "Pipeline" || visible(e)));
  const top = events
    .filter((e) => visible(e) && upcoming(e) && e.vendor_score !== null)
    .sort((a, b) => (b.vendor_score || 0) - (a.vendor_score || 0));
  const deadlines = events
    .filter((e) => visible(e) && e.vendor_deadline && upcoming(e))
    .sort((a, b) =>
      (deadlineDate(a.vendor_deadline) || "9999").localeCompare(
        deadlineDate(b.vendor_deadline) || "9999",
      ),
    )
    .filter(
      (e) =>
        !deadlineDate(e.vendor_deadline) ||
        deadlineDate(e.vendor_deadline)! >= today,
    );
  const datedDeadlines = deadlines.filter((e) =>
    deadlineDate(e.vendor_deadline),
  );
  const chips: { label: string; clear: () => void }[] = [];
  for (const c of filters.countries)
    chips.push({
      label: c,
      clear: () =>
        set(
          "countries",
          filters.countries.filter((x) => x !== c),
        ),
    });
  for (const c of filters.games)
    chips.push({
      label: c,
      clear: () =>
        set(
          "games",
          filters.games.filter((x) => x !== c),
        ),
    });
  if (filters.search)
    chips.push({ label: filters.search, clear: () => set("search", "") });
  for (const k of ["priority", "size", "from", "to", "status"] as const)
    if (filters[k] && filters[k] !== "any")
      chips.push({
        label: `${k}: ${filters[k]}`,
        clear: () => set(k, emptyFilters[k]),
      });
  for (const stage of filters.stages) chips.push({ label: stage, clear: () => set("stages", filters.stages.filter(s => s !== stage)) });
  if (filters.score)
    chips.push({
      label: `Score ≥ ${filters.score}`,
      clear: () => set("score", 0),
    });
  if (!filters.tba)
    chips.push({ label: "TBA excluded", clear: () => set("tba", true) });
  const sorted = [...filtered].sort((a, b) =>
    sort === "stage"
      ? stages.indexOf((entries[a.id] || emptyEntry).stage) - stages.indexOf((entries[b.id] || emptyEntry).stage) || a.name.localeCompare(b.name)
      : sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "score"
        ? (b.vendor_score ?? -1) - (a.vendor_score ?? -1)
        : sort === "country"
          ? (a.country || "ZZZ").localeCompare(b.country || "ZZZ")
          : sort === "size"
            ? ["S", "M", "L", "XL"].indexOf(b.size_tier || "") -
              ["S", "M", "L", "XL"].indexOf(a.size_tier || "")
            : (a.start_date || a.estimated_month || "9999").localeCompare(
                b.start_date || b.estimated_month || "9999",
              ),
  );
  function card(e: Event, occurrence?: string) {
    return <EventCard key={e.id + (occurrence || '')} e={e} entry={entries[e.id] || emptyEntry} occurrence={occurrence} open={() => setSelected(e)} />;
  }
  const monthEvents = filtered.filter(
    (e) =>
      e.date_status === "confirmed" &&
      ranges(e).some(
        (r) => r.start_date <= monthEnd(month) && r.end_date >= month + "-01",
      ),
  );
  const estimated = filtered.filter(
    (e) => e.date_status === "estimated" && e.estimated_month === month,
  );
  const tba = filtered.filter((e) => e.date_status === "tba");
  const shift = (n: number) => {
    const d = new Date(month + "-02T12:00:00");
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const groups = new Map<string, { e: Event; label?: string }[]>();
  for (const e of sorted) {
    const keys =
      groupByStage ? [(entries[e.id] || emptyEntry).stage] : e.date_status === "confirmed"
        ? Array.from(new Set(ranges(e).map((r) => r.start_date.slice(0, 7))))
        : [e.estimated_month || "9999"];
    for (const k of keys) {
      if (
        !groupByStage && ((filters.from && k !== "9999" && k < filters.from.slice(0, 7)) ||
        (filters.to && k !== "9999" && k > filters.to.slice(0, 7)))
      )
        continue;
      groups.set(k, [
        ...(groups.get(k) || []),
        {
          e,
          label: !groupByStage && e.occurrences
            ? ranges(e)
                .filter((r) => r.start_date.startsWith(k))
                .map(
                  (r) =>
                    prettyDate(r.start_date) +
                    (r.end_date !== r.start_date
                      ? "–" + prettyDate(r.end_date)
                      : ""),
                )
                .join(" · ")
            : undefined,
        },
      ]);
    }
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Layers size={23} />
          </span>
          FIELDNOTES<span className="brand-sub"> / TCG VENDOR CALENDAR</span>
        </a>
        <div className="header-right">
          <span className="live-dot" />
          2027 SEASON
          <button
            className="icon-button"
            aria-label="Toggle light and dark theme"
            onClick={() =>
              setTheme(
                theme === "dark" ||
                  (theme === "system" &&
                    matchMedia("(prefers-color-scheme: dark)").matches)
                  ? "light"
                  : "dark",
              )
            }
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="avatar">J</span>
        </div>
      </header>
      <main>
        {storageError && <p role="alert" className="storage-warning">{storageError}</p>}
        <section className="stage-overview" aria-label="Pipeline overview">{stages.map(stage => <span key={stage}><StageBadge stage={stage} /> <strong>{events.filter(e => (entries[e.id] || emptyEntry).stage === stage).length}</strong></span>)}</section>
        <section className="intro">
          <div>
            <div className="eyebrow">
              2027 TCG VENDOR CALENDAR · SEA + HK + GCC
            </div>
            <h1>
              Your next great
              <br />
              <span>vendor opportunity.</span>
            </h1>
            <p>
              A clearer view of the circuit. Find your shows, plan your season,
              <br className="desktop" /> and make every table count.
            </p>
          </div>
          <div className="season-stamp">
            <span>THE VENDOR</span>
            <CalendarDays size={38} strokeWidth={1.25} />
            <strong>2027</strong>
            <span>SEASON PLANNER</span>
          </div>
        </section>
        <section className="stats" aria-label="Calendar statistics">
          {[
            [events.length, "Events on the radar"],
            [
              events.filter((e) => e.date_status === "confirmed").length,
              "Confirmed events",
            ],
            [datedDeadlines.length, "Upcoming deadline notices"],
            [
              top.filter((e) => (e.vendor_score || 0) >= 80).length,
              "Top picks · score 80+",
            ],
          ].map(([n, label], i) => (
            <div key={label}>
              <span className="stat-index">0{i + 1}</span>
              <strong>{n}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section className="overview">
          <div className="picks">
            <div className="section-label">
              <span>✦ TOP VENDOR PICKS</span>
              <span>CURATED BY VENDOR SCORE</span>
            </div>
            <div className="pick-grid">
              {top.slice(0, 3).map((e) => (
                <button
                  className="pick"
                  key={e.id}
                  onClick={() => setSelected(e)}
                >
                  <div className="pick-meta">
                    <Logo e={e} />
                    <span className="pick-score">
                      {e.vendor_score}
                      <small> / 100</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </div>
                  <h3>{e.name}</h3><StageBadge stage={(entries[e.id] || emptyEntry).stage} />{entries[e.id]?.note.trim() && <span> 📝 Notes</span>}
                  <p>
                    {flag(e.country_code)} {e.city || e.country}{" "}
                    <span>· {dateLabel(e)}</span>
                  </p>
                </button>
              ))}
            </div>
          </div>
          <div className="deadline-box">
            <div className="section-label">
              <span>
                <Clock size={14} /> UPCOMING DEADLINES
              </span>
            </div>
            {deadlines.slice(0, 2).map((e) => (
              <button key={e.id} onClick={() => setSelected(e)}>
                <span className="deadline-date">
                  {deadlineDate(e.vendor_deadline)
                    ? prettyDate(deadlineDate(e.vendor_deadline)!)
                    : "CHECK DETAILS"}
                </span>
                <strong>{e.name}</strong><StageBadge stage={(entries[e.id] || emptyEntry).stage} />{entries[e.id]?.note.trim() && <span>📝 Notes</span>}
                <span className="deadline-copy">{e.vendor_deadline}</span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            <small>
              Registration notes may include player dates. Check vendor details.
            </small>
          </div>
        </section>
        <section className="workspace">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">BUILD YOUR 2027 CIRCUIT</div>
              <h2>
                Explore the calendar<span>.</span>
              </h2>
            </div>
            <div className="export-actions">
              <button
                className="button"
                onClick={() =>
                  download(
                    csv(filtered, entries),
                    "tcg-events.csv",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                CSV
              </button>
              <button
                className="button"
                onClick={() =>
                  download(
                    ics(filtered),
                    "tcg-calendar.ics",
                    "text/calendar;charset=utf-8",
                  )
                }
              >
                <Download size={16} /> Export filtered .ics
              </button>
            </div>
          </div>
          <BackupControls entries={entries} ids={events.map(e => e.id)} apply={value => { setCanSave(true); setSaved(false); setEntries(value); }} />
          <label className="passed-toggle"><input type="checkbox" checked={showPassed} onChange={e => setShowPassed(e.target.checked)} /> Show passed / too expensive</label>
          {view === 'Pipeline' && <p>Pipeline includes passed / too expensive events. Search and filters still apply.</p>}
          <nav className="tabs" aria-label="Event views">
            {[
              "Calendar",
              "Timeline",
              "List",
              "Watchlist",
              "Recurring SG",
              "Pipeline",
            ].map((v, i) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => setView(v)}
              >
                {i === 0 ? (
                  <CalendarDays size={16} />
                ) : i === 1 ? (
                  <LayoutList size={16} />
                ) : i === 5 ? (
                  <Bookmark size={16} />
                ) : null}
                {v}

              </button>
            ))}
          </nav>
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
            >
              <SlidersHorizontal size={16} /> Filters{" "}
              {chips.length > 0 && (
                <span className="count">{chips.length}</span>
              )}
            </button>
            <span className="result-count">{filtered.length} events</span>
          </div>
          {filterOpen && (
            <section
              className="filters"
              id="filters"
              aria-label="Event filters"
            >
              <div className="filter-heading">
                <h3>Find your fit</h3>
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
                    {Array.from(
                      new Set(events.map((e) => e.country || "Unknown")),
                    )
                      .sort()
                      .map((c) => (
                        <label key={c}>
                          <input
                            type="checkbox"
                            checked={filters.countries.includes(c)}
                            onChange={() =>
                              set(
                                "countries",
                                filters.countries.includes(c)
                                  ? filters.countries.filter((x) => x !== c)
                                  : [...filters.countries, c],
                              )
                            }
                          />
                          {c}
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
                    Date status
                    <select
                      value={filters.status}
                      onChange={(e) => set("status", e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {["confirmed", "estimated", "tba"].map((s) => (
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
                </div>
                <div className="filter-fields">
                  <label>
                    Minimum vendor score: {filters.score}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.score}
                      onChange={(e) => set("score", +e.target.value)}
                    />
                  </label>
                  <fieldset><legend>Pipeline stages</legend>{stages.map(stage => <label className="check" key={stage}><input type="checkbox" checked={filters.stages.includes(stage)} onChange={() => set("stages", filters.stages.includes(stage) ? filters.stages.filter(s => s !== stage) : [...filters.stages, stage])} />{stage}</label>)}</fieldset>
                  <button
                    className="text-button"
                    onClick={() => setFilters(emptyFilters)}
                  >
                    Reset all filters
                  </button>
                </div>
              </div>
            </section>
          )}
          {chips.length > 0 && (
            <div className="chips">
              {chips.map((c) => (
                <button key={c.label} onClick={c.clear}>
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
          {view === "Timeline" && <label className="passed-toggle"><input type="checkbox" checked={groupByStage} onChange={e => setGroupByStage(e.target.checked)} />Group by pipeline stage</label>}
          {view === "Pipeline" ? <Pipeline events={filtered} entries={entries} open={setSelected} change={(e, stage) => { update(e.id, 'stage', stage); if (stage === 'Too expensive') setSelected(e); }} /> : view === "Calendar" ? (
            <>
              <div className="month-header">
                <div>
                  <h3>{monthLabel(month)}</h3>
                  <span>
                    {monthEvents.length} confirmed shows · {estimated.length}{" "}
                    estimated
                  </span>
                </div>
                <div className="month-controls">
                  <button
                    className="button"
                    onClick={() => setMonth(initialMonth)}
                  >
                    Season start
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => shift(-1)}
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => shift(1)}
                    aria-label="Next month"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
              <div className="calendar-grid">
                <div className="weekdays">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d) => (
                      <span key={d}>{d}</span>
                    ),
                  )}
                </div>
                <div className="days">
                  {Array.from(
                    {
                      length:
                        (new Date(month + "-01T12:00:00").getDay() + 6) % 7,
                    },
                    (_, i) => (
                      <div className="day outside" key={"pad" + i} />
                    ),
                  )}
                  {Array.from(
                    { length: +monthEnd(month).slice(-2) },
                    (_, i) => {
                      const date = month + "-" + String(i + 1).padStart(2, "0");
                      return (
                        <div
                          className={"day " + (date === today ? "today" : "")}
                          key={date}
                        >
                          <span className="day-number">{i + 1}</span>
                          {monthEvents
                            .filter((e) =>
                              ranges(e).some(
                                (r) =>
                                  r.start_date <= date && r.end_date >= date,
                              ),
                            )
                            .map((e) => (
                              <button
                                key={e.id}
                                className={
                                  "calendar-event " +
                                  (e.section === "recurring_sg"
                                    ? "recurring"
                                    : "")
                                }
                                onClick={() => setSelected(e)}
                              >
                                <span>●</span> {e.name} <StageBadge stage={(entries[e.id] || emptyEntry).stage} />{entries[e.id]?.note.trim() && <span title="Has notes">📝</span>}
                              </button>
                            ))}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
              <div className="mobile-agenda">
                {monthEvents.length ? (
                  monthEvents.map((e) =>
                    card(
                      e,
                      ranges(e)
                        .filter(
                          (r) =>
                            r.start_date <= monthEnd(month) &&
                            r.end_date >= month + "-01",
                        )
                        .map(
                          (r) =>
                            prettyDate(r.start_date) +
                            (r.end_date !== r.start_date
                              ? " – " + prettyDate(r.end_date)
                              : ""),
                        )
                        .join(" · "),
                    ),
                  )
                ) : (
                  <div className="empty">
                    No confirmed shows this month. Try another month or adjust
                    your filters.
                  </div>
                )}
              </div>
              {estimated.length > 0 && (
                <section className="estimated-strip">
                  <h4>
                    ◷ Estimated this month{" "}
                    <span>Dates are not booking-ready</span>
                  </h4>
                  <div className="cards">{estimated.map((e) => card(e))}</div>
                </section>
              )}
              {tba.length > 0 && (
                <section className="tba-section">
                  <h4>
                    ◇ Dates to be announced{" "}
                    <span>{tba.length} on your radar</span>
                  </h4>
                  <div className="tba-links">
                    {tba.map((e) => (
                      <button key={e.id} onClick={() => setSelected(e)}>
                        {e.name}<StageBadge stage={(entries[e.id] || emptyEntry).stage} />{entries[e.id]?.note.trim() && <span>📝 Notes</span>}
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : view === "Timeline" ? (
            <div className="timeline">
              {[...groups]
                .sort(([a], [b]) => groupByStage ? stages.indexOf(a as Stage) - stages.indexOf(b as Stage) : a.localeCompare(b))
                .map(([m, items]) => (
                  <section key={m}>
                    <h3>
                      {groupByStage ? m : m === "9999" ? "Dates to be announced" : monthLabel(m)}
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
                <h3>
                  {view === "List"
                    ? "All opportunities"
                    : view === "Watchlist"
                      ? "Keep these on your radar"
                      : view === "Recurring SG"
                        ? "Your local circuit"
                        : "Your season, taking shape"}
                </h3>
                <label>
                  Sort by{" "}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="date">Date</option>
                    <option value="name">Name</option>
                    <option value="score">Vendor score</option>
                    <option value="country">Country</option>
                    <option value="size">Size tier</option>
                    <option value="stage">Pipeline stage</option>
                  </select>
                </label>
              </div>
              <div className="cards">
                {sorted
                  .filter(
                    (e) =>
                      view === "List" ||
                      (view === "Watchlist" && e.section === "watchlist") ||
                      (view === "Recurring SG" &&
                        e.section === "recurring_sg"),
                  )
                  .map((e) => (
                    <div key={e.id}>
                      {card(e)}
                      {view === "Recurring SG" && (
                        <div className="occurrences">
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
                  ))}
              </div>
              {!sorted.some(
                (e) =>
                  view === "List" ||
                  (view === "Watchlist" && e.section === "watchlist") ||
                  (view === "Recurring SG" && e.section === "recurring_sg"),
              ) && (
                <div className="empty">
                  <Bookmark size={30} />
                  <h3>
No matching events
                  </h3>
                  <p>
Try broadening your filters.
                  </p>
                </div>
              )}
            </>
          )}
          {view === "Timeline" && groups.size === 0 && (
            <div className="empty">No events match your filters.</div>
          )}
          <div className="calendar-foot">
            <span>
              <i className="legend-dot" /> Confirmed{" "}
              <i className="legend-dot recurring-dot" /> Recurring SG{" "}
              <span className="estimate-legend">◷ Estimated</span> ◇ TBA
            </span>
            <span>All dates are local to the event.</span>
          </div>
        </section>
        <footer>
          <span className="footer-brand">
            <Layers size={16} /> FIELDNOTES{" "}
            <span>Built for your next move.</span>
          </span>
          <span>Data last updated 16 Nov 2026</span>
          <small>
            Verify dates and vendor terms with organizers before booking.
          </small>
        </footer>
      </main>
      {selected && (
        <Detail
          e={selected}
          close={closeDetail}
          key={selected.id}
          entry={entries[selected.id] || emptyEntry}
          saved={saved}
          onStage={stage => update(selected.id, 'stage', stage)}
          onNote={note => update(selected.id, 'note', note)}
        />
      )}
    </>
  );
}
