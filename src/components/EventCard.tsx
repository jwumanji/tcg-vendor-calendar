import { GoingButton, type SetGoing } from "./GoingButton";
import { PriorityChip } from "./PriorityChip";
import { OutreachChip } from "./OutreachChip";
import type { ScoreResult } from "../scoring";
import { memo } from "react";
import type { Event } from "../model";
import type { OptionalColumn } from "../rows";
import type { DisplayEntry, Entries, Stage } from "../storage";
import { vendorApplyAction } from "../eventDecision";
import { displayDateLabel, primaryGameKey, upcoming } from "../utils";
import { holo } from "../holo";
import {
  ClashCue,
  Logo,
  Place,
  NoteTag,
  GameTags,
} from "./EventIdentity";
import { StagePicker } from "./Pipeline";
import { ApplyLink } from "./ApplyLink";
import { VendorPriceCue } from "./VendorPriceCue";
import { EventDates, OptionalEventField } from "./EventFields";
import { SelectEvent, type EventSelection } from "./EventSelection";
export const EventCard = memo(function EventCard({
  e,
  entry,
  entries,
  score,
  setGoing,
  setStage,
  today,
  now = Date.now(),
  occurrence,
  titleLevel = 3,
  columns = [],
  selection,
  open,
}: {
  e: Event;
  entry: DisplayEntry;
  entries: Entries;
  score: ScoreResult;
  setGoing: SetGoing;
  setStage: (id: string, stage: Stage) => void;
  today: string;
  now?: number;
  occurrence?: string;
  titleLevel?: 3 | 4;
  columns?: OptionalColumn[];
  selection?: EventSelection;
  open: (e: Event, occurrence?: string) => void;
}) {
  const Title = titleLevel === 4 ? "h4" : "h3";
  const application = vendorApplyAction(e, now);
  const date = occurrence || displayDateLabel(e, today);
  return (
    <article
      className={`event-card holo status-${e.date_status}`}
      data-game={primaryGameKey(e)}
      data-event-status={e.event_status}
      data-going={entry.going}
      data-selected={selection?.selected.has(e.id)}
      data-event-id={e.id}
      {...holo}
    >
      <Logo e={e} size="xl" />
      <div className="card-details">
        <div className="card-heading">
          <Title className="card-title">
            <button className="stretched-button"
              aria-pressed={selection?.selected.has(e.id)}
              onClick={(ev) => selection ? selection.toggle(e.id, ev.shiftKey) : open(e, occurrence)}>
              {e.name}
              <span className="sr-only"> · {date} · {entry.stage}</span>
            </button>
          </Title>
          {selection && <div className="card-select"><SelectEvent e={e} selection={selection} /></div>}
        </div>
        <div className="card-when"><EventDates e={e} date={date} /></div>
        <div className="card-location"><Place e={e} /></div>
        <div className="card-tags">
          <PriorityChip result={score} />
          {!columns.includes("outreach") && <OutreachChip outreach={e.outreach} />}
          <GameTags event={e} />
          <ClashCue score={score} entries={entries} />
          {e.is_new_find && <span className="source-chip new-find">New find</span>}
          {entry.note.trim() && <NoteTag />}
          {!upcoming(e, today) && <span className="source-chip">Past</span>}
          <VendorPriceCue event={e} now={now} />
        </div>
        {columns.map((field) => (
          <div className={`card-option card-option-${field}`} key={field}>
            {field === "notes" && <strong>Notes · </strong>}
            <OptionalEventField field={field} e={e} entry={entry} selecting={Boolean(selection)} />
          </div>
        ))}
        <div className="card-actions">
          <StagePicker name={e.name} entry={entry} onChange={(stage) => setStage(e.id, stage)} />
          {!selection && <GoingButton e={e} going={entry.going} setGoing={setGoing} />}
          {selection && entry.going && <span className="going-marker">Going</span>}
          {application && <ApplyLink action={application} name={e.name} compact />}
        </div>
      </div>
    </article>
  );
});
