import type { Event } from "../model";
import type { OptionalColumn } from "../rows";
import type { DisplayEntry } from "../storage";
import { Status } from "./EventIdentity";
import { SourceChip } from "./FindSource";
import { OutreachChip } from "./OutreachChip";

export function EventDates({ e, date }: { e: Event; date: string }) {
  return (
    <>
      {(date !== "Dates not announced" || e.event_status) &&
        <><span className="row-date-label">{date}</span>{" "}</>}
      <Status e={e} />
    </>
  );
}

export function OptionalEventField({ field, e, entry, selecting }: {
  field: OptionalColumn;
  e: Event;
  entry: DisplayEntry;
  selecting: boolean;
}) {
  switch (field) {
    case "scanner":
      return <><span className="row-mobile-header">Fit score · </span>{e.vendor_score ?? "—"}</>;
    case "source":
      return <SourceChip e={e} link={!selecting} />;
    case "notes":
      return entry.note || "—";
    case "outreach":
      return <OutreachChip outreach={e.outreach} />;
  }
}
