import { CalendarDays, Download } from "lucide-react";
import type { Event } from "../model";
import type { Entries } from "../storage";
import { csv, download, hasConfirmedDates, ics } from "../utils";

export function EventExports({
  events,
  entries,
  goingOnly = false,
}: {
  events: Event[];
  entries: Entries;
  goingOnly?: boolean;
}) {
  const confirmed = events.some(hasConfirmedDates);
  return (
    <div>
      <h3>
        {goingOnly ? "Going events" : "Filtered events"}{" "}
        <span>{events.length}</span>
      </h3>
      <div className="export-actions">
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
          <Download size={15} /> {goingOnly ? "CSV (Going only)" : "CSV"}
        </button>
        <button
          className="button"
          disabled={!confirmed}
          onClick={() =>
            download(
              ics(events),
              goingOnly ? "tcg-going.ics" : "tcg-calendar.ics",
              "text/calendar;charset=utf-8",
            )
          }
        >
          <CalendarDays size={15} />{" "}
          {goingOnly ? ".ics for Going events" : ".ics (confirmed only)"}
        </button>
      </div>
      {!confirmed && (
        <p>
          {goingOnly
            ? "No Going events have confirmed dates."
            : "No confirmed dates in these results."}
        </p>
      )}
    </div>
  );
}
