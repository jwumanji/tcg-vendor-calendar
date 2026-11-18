import { CalendarDays, Download } from "lucide-react";
import type { Event } from "../model";
import type { Entries } from "../storage";
import {
  csv,
  download,
  hasConfirmedDates,
  hasEstimatedMonth,
  ics,
} from "../utils";

export function EventExports({
  events,
  entries,
  goingOnly = false,
  compact = false,
}: {
  events: Event[];
  entries: Entries;
  goingOnly?: boolean;
  compact?: boolean;
}) {
  const estimated = goingOnly ? events.filter(hasEstimatedMonth).length : 0;
  const dated = estimated > 0 || events.some(hasConfirmedDates);
  const suffix = goingOnly && !compact ? ` (${events.length} Going)` : "";
  const actions = (
    <div className="export-actions">
      <button
        className={goingOnly && !compact ? "button primary" : "button"}
        disabled={!dated}
        onClick={() =>
          download(
            ics(events, goingOnly),
            goingOnly ? "tcg-going.ics" : "tcg-calendar.ics",
            "text/calendar;charset=utf-8",
          )
        }
      >
        <CalendarDays size={15} /> Download .ics{suffix}
      </button>
      <button
        className="button"
        disabled={!events.length}
        onClick={() =>
          download(
            csv(events, entries),
            goingOnly ? "tcg-going.csv" : "tcg-events.csv",
            "text/csv;charset=utf-8",
          )
        }
      >
        <Download size={15} /> Download CSV{suffix}
      </button>
    </div>
  );
  if (compact) return actions;
  return (
    <div>
      <h3>{goingOnly ? "Going events" : "All filtered events"}</h3>
      {actions}
      {estimated > 0 && (
        <p>Includes {estimated} estimated — dates may change</p>
      )}
      {!dated && (
        <p>
          {goingOnly
            ? "Calendar downloads need a confirmed date or estimated month."
            : "No confirmed dates in these results."}
        </p>
      )}
    </div>
  );
}
