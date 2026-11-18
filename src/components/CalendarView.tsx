import { PriorityChip } from "./PriorityChip";
import type { ScoreResult } from "../scoring";
import { useMemo } from "react";
import {
  ArrowUpRight,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Event } from "../model";
import { emptyEntry, type Entries } from "../storage";
import {
  ranges,
  monthEnd,
  monthLabel,
  prettyDate,
  occurrenceOn,
  isUndated,
  primaryGameKey,
} from "../utils";
import { EventCard } from "./EventCard";
import { EmptyState } from "./EmptyState";
import type { SetGoing } from "./GoingButton";
import { ClashCue, NoteTag, Place, Logo } from "./EventIdentity";
import { StageBadge } from "./Pipeline";
export function CalendarView({
  filtered,
  entries,
  scores,
  month,
  setMonth,
  initialMonth,
  today,
  setGoing,
  open,
}: {
  filtered: Event[];
  entries: Entries;
  scores: Record<string, ScoreResult>;
  month: string;
  setMonth: (month: string) => void;
  initialMonth: string;
  today: string;
  setGoing: SetGoing;
  open: (event: Event, occurrence?: string) => void;
}) {
  function card(e: Event, occurrence?: string) {
    return (
      <EventCard
        key={e.id}
        e={e}
        score={scores[e.id]}
        entries={entries}
        entry={entries[e.id] || emptyEntry}
        occurrence={occurrence}
        setGoing={setGoing}
        open={open}
      />
    );
  }
  const monthEvents = useMemo(
    () =>
      filtered.filter(
        (e) =>
          e.date_status === "confirmed" &&
          ranges(e).some(
            (r) =>
              r.start_date <= monthEnd(month) && r.end_date >= month + "-01",
          ),
      ),
    [filtered, month],
  );
  const estimated = filtered.filter(
    (e) => e.date_status === "estimated" && e.estimated_month === month,
  );
  const tba = filtered.filter(isUndated);
  const shift = (n: number) => {
    const d = new Date(month + "-02T12:00:00");
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const dayEvents = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (let i = 1; i <= Number(monthEnd(month).slice(-2)); i++) {
      const date = `${month}-${String(i).padStart(2, "0")}`;
      map.set(
        date,
        monthEvents.filter((e) =>
          ranges(e).some((r) => r.start_date <= date && r.end_date >= date),
        ),
      );
    }
    return map;
  }, [monthEvents, month]);
  return (
    <>
      <div className="month-header">
        <div>
          <h3>{monthLabel(month)}</h3>
          <span>
            {monthEvents.length} confirmed shows · {estimated.length} estimated
          </span>
        </div>
        <div className="month-controls">
          <button className="button" onClick={() => setMonth(initialMonth)}>
            Next shows
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
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="days">
          {Array.from(
            {
              length: (new Date(month + "-01T12:00:00").getDay() + 6) % 7,
            },
            (_, i) => (
              <div className="day outside" key={"pad" + i} />
            ),
          )}
          {Array.from({ length: +monthEnd(month).slice(-2) }, (_, i) => {
            const date = month + "-" + String(i + 1).padStart(2, "0");
            return (
              <div
                className={"day " + (date === today ? "today" : "")}
                key={date}
                role="group"
                aria-label={prettyDate(date)}
              >
                <span className="day-number">{i + 1}</span>
                {(dayEvents.get(date) || []).map((e) => (
                  <button
                    key={e.id}
                    data-game={primaryGameKey(e)}
                    className={
                      "calendar-event " +
                      (e.section === "recurring_sg" ? "recurring" : "")
                    }
                    onClick={() => open(e, occurrenceOn(e, date))}
                  >
                    <Logo e={e} />
                    <ClashCue score={scores[e.id]} entries={entries} />
                    <span className="calendar-event-name">{e.name}</span>{" "}
                    <Place e={e} countryOnly />
                    <PriorityChip result={scores[e.id]} />
                    <StageBadge stage={(entries[e.id] || emptyEntry).stage} />
                    {entries[e.id]?.note.trim() && <NoteTag compact />}
                  </button>
                ))}
              </div>
            );
          })}
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
          <EmptyState
            icon={CalendarX2}
            title="No confirmed shows this month"
            action={
              <button className="button" onClick={() => setMonth(initialMonth)}>
                Jump to next shows
              </button>
            }
          >
            Try another month or adjust your filters.
          </EmptyState>
        )}
      </div>
      {estimated.length > 0 && (
        <section className="estimated-strip">
          <h4>
            ◷ Estimated this month <span>Dates are not booking-ready</span>
          </h4>
          <div className="cards">{estimated.map((e) => card(e))}</div>
        </section>
      )}
      {tba.length > 0 && (
        <section className="tba-section">
          <h4>
            ◇ Dates to be announced <span>{tba.length} on your radar</span>
          </h4>
          <div className="tba-links">
            {tba.map((e) => (
              <button key={e.id} onClick={() => open(e)}>
                {e.name}
                <Place e={e} countryOnly />
                <PriorityChip result={scores[e.id]} />
                <StageBadge stage={(entries[e.id] || emptyEntry).stage} />
                {entries[e.id]?.note.trim() && <NoteTag />}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
