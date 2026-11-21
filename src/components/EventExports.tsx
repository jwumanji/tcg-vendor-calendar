import { CalendarDays, Download } from "lucide-react";
import type { Event, VendorMilestone } from "../model";
import { milestoneCalendarUnavailable } from "../milestones";
import type { Entries } from "../storage";
import {
  csv,
  download,
  hasConfirmedDates,
  hasEstimatedMonth,
  ics,
  milestoneIcs,
} from "../utils";

export function MilestoneExport({ event, milestone }: { event: Event; milestone: VendorMilestone }) {
  const blocked = milestoneCalendarUnavailable(event, milestone);
  if (blocked) return <span className="milestone-notes">{blocked}</span>;
  return (
    <button
      className="button milestone-export"
      aria-label={`Add to calendar: ${event.name}, ${milestone.label}`}
      onClick={() => download(
        milestoneIcs(event, milestone),
        `${event.id}-${milestone.id}.ics`,
        "text/calendar;charset=utf-8",
      )}
    >
      <CalendarDays size={15} aria-hidden="true" /> Add to calendar
    </button>
  );
}

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
        <CalendarDays size={15} /> Add to calendar{suffix}
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
