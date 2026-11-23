import { orderedStages, type RowSort } from "../rows";
import { GoingButton, type SetGoing } from "./GoingButton";
import { PriorityChip } from "./PriorityChip";
import { FindBadges } from "./FindSource";
import type { ScoreResult } from "../scoring";
import { memo, useEffect, useRef, useState } from "react";
import {
  Ban,
  BadgeCheck,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Send,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { Event } from "../model";
import { stages, emptyEntry, type DisplayEntry, type Stage } from "../storage";
import { vendorApplyAction } from "../eventDecision";
import { displayDateLabel, games, gameKey, primaryGameKey } from "../utils";
import { holo } from "../holo";
import {
  ClashCue,
  Logo,
  Place,
  NoteTag,
} from "./EventIdentity";
import { ApplyLink } from "./ApplyLink";
import { EventDates } from "./EventFields";
import { OutreachChip } from "./OutreachChip";

/** Every stage has an icon as well as a label, so stages never rely on colour alone. */
const stageIcons: Record<Stage, LucideIcon> = {
  "Not reviewed": Sparkles,
  Considering: Star,
  Contacted: Send,
  "Quote received": ClipboardList,
  Applied: ClipboardCheck,
  "Need to pay": CreditCard,
  Booked: BadgeCheck,
  Passed: Ban,
  "Too expensive": CircleDollarSign,
};
export function StageBadge({ stage }: { stage: Stage }) {
  const Icon = stageIcons[stage];
  // Plays a small "pop" when the stage changes (alternating names re-trigger the animation).
  const previous = useRef(stage);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (previous.current !== stage) {
      previous.current = stage;
      setBump((n) => n + 1);
    }
  }, [stage]);
  return (
    <span
      className={`badge stage${
        bump ? ` bump-${bump % 2 ? "a" : "b"}` : ""
      }`}
      data-stage={stage}
    >
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {stage}
    </span>
  );
}
export function StagePicker({
  entry: { stage, stageSuggested },
  onChange,
  name,
  id,
}: {
  name: string;
  id?: string;
  entry: DisplayEntry;
  onChange: (stage: Stage) => void;
}) {
  const Icon = stageIcons[stage];
  return (
    <span className="stage-control" data-stage={stage}>
      <Icon className="stage-icon" size={13} strokeWidth={2.4} aria-hidden="true" />
      <select id={id} className="stage-picker" aria-label={`Pipeline stage for ${name}`}
        aria-description={stageSuggested ? `Suggested stage: ${stage}` : undefined}
        value={stageSuggested ? "" : stage} onChange={(e) => onChange(e.target.value as Stage)}>
        {stageSuggested && <option value="" disabled hidden>{stage}</option>}
        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <ChevronDown className="stage-chevron" size={13} aria-hidden="true" />
    </span>
  );
}
type PipelineProps = {
  today: string;
  now?: number;
  sort: RowSort;
  events: Event[];
  entries: Record<string, DisplayEntry>;
  scores: Record<string, ScoreResult>;
  open: (event: Event) => void;
  setGoing: SetGoing;
  change: (event: Event, stage: Stage) => void;
  browse?: () => void;
};

export function Pipeline({ sort, events, ...props }: PipelineProps) {
  return (
    <>
      <p className="pipeline-explainer">
        Track booth bookings by stage. Marking Going moves an event from Not reviewed to Considering.
      </p>
      <div className="pipeline">
        {orderedStages(sort).map((stage) => (
          <PipelineColumn key={stage} stage={stage}
            items={events.filter((e) => (props.entries[e.id] || emptyEntry).stage === stage)}
            {...props} />
        ))}
      </div>
    </>
  );
}

const pipelinePageSize = 6;

function PipelineColumn({
  stage, items, today, now = Date.now(), entries, scores, open, setGoing, change, browse,
}: Omit<PipelineProps, "sort" | "events"> & { stage: Stage; items: Event[] }) {
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / pipelinePageSize) - 1));
  const start = currentPage * pipelinePageSize;
  const end = Math.min(start + pipelinePageSize, items.length);
  function turnPage(next: number) {
    setPage(next);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  return (
    <section className="pipeline-column" data-stage={stage}>
      <h3 ref={heading} tabIndex={-1}>
        <StageBadge stage={stage} /> <span>{items.length}</span>
      </h3>
      {items.length === 0 && (
        <div className="pipeline-empty">
          <p>{stage === "Considering" ? "Mark an event Going to see it here." : `Set an event’s stage to ${stage} to see it here.`}</p>
          {browse && <button className="text-button" onClick={browse}>Browse events</button>}
        </div>
      )}
      {items.slice(start, end).map((e) => (
        <PipelineCard today={today} now={now} key={e.id} e={e} entries={entries}
          score={scores[e.id]} stage={stage} going={!!entries[e.id]?.going}
          setGoing={setGoing} hasNote={!!entries[e.id]?.note.trim()} open={open} change={change} />
      ))}
      {items.length > pipelinePageSize && (
        <nav className="pipeline-pagination" aria-label={stage + " pages"}>
          <span role="status">{start + 1}–{end} of {items.length}</span>
          {start > 0 && <button className="button" onClick={() => turnPage(currentPage - 1)}>Previous</button>}
          {end < items.length && (
            <button className="button" onClick={() => turnPage(currentPage + 1)}>
              Show {Math.min(pipelinePageSize, items.length - end)} more
            </button>
          )}
        </nav>
      )}
    </section>
  );
}

/**
 * Compact Holo Vault card. The title button is stretched over the card to open
 * the detail panel; the stage select and price prompt sit above it (z-index) so
 * no interactive element is nested inside another.
 */
const PipelineCard = memo(function PipelineCard({
  today,
  now,
  e,
  stage,
  going,
  hasNote,
  entries,
  score,
  open,
  setGoing,
  change,
}: {
  today: string;
  now: number;
  e: Event;
  stage: Stage;
  going: boolean;
  hasNote: boolean;
  entries: Record<string, DisplayEntry>;
  score: ScoreResult;
  open: (event: Event) => void;
  setGoing: SetGoing;
  change: (event: Event, stage: Stage) => void;
}) {
  const primary = games(e)[0];
  const application = vendorApplyAction(e, now);
  const date = displayDateLabel(e, today);
  return (
    <article
      className={`pipeline-card holo status-${e.date_status}`}
      data-game={primaryGameKey(e)}
      data-going={going}
      data-event-id={e.id}
      {...holo}
    >
      <span className="pcard-edge" aria-hidden="true" />
      <div className="pcard-top">
        <Logo e={e} />
        <h4 className="pcard-title">
          <button className="stretched-button" onClick={() => open(e)}>
            {e.name}
            <span className="sr-only">
              {" "}
              · {date}
              {hasNote ? " · has notes" : ""}
            </span>
          </button>
        </h4>
      </div>
      <div className="pcard-meta">
        <span className="pcard-line pcard-date">
          <EventDates e={e} date={date} />
        </span>
        <span className="pcard-line">
          <Place e={e} />
        </span>
      </div>
      <div className="pcard-tags">
        <PriorityChip result={score} />
        <OutreachChip outreach={e.outreach} />
        <ClashCue score={score} entries={entries} />
        <FindBadges e={e} />
        <span className="game-tag" data-game={gameKey(primary)}>
          {primary}
        </span>
        {hasNote && <NoteTag />}
      </div>
      <div className="pcard-actions">
        <StagePicker
          name={e.name}
          entry={entries[e.id] || emptyEntry}
          onChange={(s) => change(e, s)}
        />
        <GoingButton e={e} going={going} setGoing={setGoing} />
        {application && <ApplyLink action={application} name={e.name} compact />}
        {stage === "Too expensive" && (
          <button className="text-button" onClick={() => open(e)}>
            Add booth price →
          </button>
        )}
      </div>
    </article>
  );
});
