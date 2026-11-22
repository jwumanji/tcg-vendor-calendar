import { orderedStages, type RowSort } from "../rows";
import { GoingButton, type SetGoing } from "./GoingButton";
import { PriorityChip } from "./PriorityChip";
import { FindBadges } from "./FindSource";
import type { ScoreResult } from "../scoring";
import { memo, useEffect, useRef, useState } from "react";
import {
  Ban,
  BadgeCheck,
  CalendarDays,
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
import { stages, emptyEntry, type Stage, type Entries } from "../storage";
import { vendorApplyAction } from "../eventDecision";
import { displayDateLabel, games, gameKey, primaryGameKey } from "../utils";
import { holo } from "../holo";
import {
  ClashCue,
  Logo,
  Status,
  Place,
  NoteTag,
} from "./EventIdentity";
import { ApplyLink } from "./ApplyLink";

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
  stage,
  onChange,
  name,
  id,
}: {
  name: string;
  id?: string;
  stage: Stage;
  onChange: (stage: Stage) => void;
}) {
  const Icon = stageIcons[stage];
  return (
    <span className="stage-control" data-stage={stage}>
      <Icon className="stage-icon" size={13} strokeWidth={2.4} aria-hidden="true" />
      <select id={id} className="stage-picker" aria-label={`Pipeline stage for ${name}`}
        value={stage} onChange={(e) => onChange(e.target.value as Stage)}>
        {stages.map((s) => <option key={s}>{s}</option>)}
      </select>
      <ChevronDown className="stage-chevron" size={13} aria-hidden="true" />
    </span>
  );
}
export function Pipeline({
  today,
  now = Date.now(),
  sort,
  events,
  entries,
  scores,
  open,
  setGoing,
  change,
}: {
  today: string;
  now?: number;
  sort: RowSort;
  events: Event[];
  entries: Entries;
  scores: Record<string, ScoreResult>;
  open: (event: Event) => void;
  setGoing: SetGoing;
  change: (event: Event, stage: Stage) => void;
}) {
  return (
    <>
      <p className="pipeline-explainer">
        Track your decision and booth booking in the pipeline. Marking Going moves
        an event from Not reviewed to Considering.
      </p>
      <div className="pipeline">
        {orderedStages(sort).map((stage) => {
          const items = events.filter(
            (e) => (entries[e.id] || emptyEntry).stage === stage,
          );
          return (
            <section
              className="pipeline-column"
              data-stage={stage}
              key={stage}
            >
              <h3>
                <StageBadge stage={stage} /> <span>{items.length}</span>
              </h3>
              {items.length === 0 && (
                <p className="pipeline-empty">No events in this stage.</p>
              )}
              {items.map((e) => (
                <PipelineCard
                  today={today}
                  now={now}
                  key={e.id}
                  e={e}
                  entries={entries}
                  score={scores[e.id]}
                  stage={stage}
                  going={!!entries[e.id]?.going}
                  setGoing={setGoing}
                  hasNote={!!entries[e.id]?.note.trim()}
                  open={open}
                  change={change}
                />
              ))}
            </section>
          );
        })}
      </div>
    </>
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
  entries: Entries;
  score: ScoreResult;
  open: (event: Event) => void;
  setGoing: SetGoing;
  change: (event: Event, stage: Stage) => void;
}) {
  const primary = games(e)[0];
  const application = vendorApplyAction(e, now);
  return (
    <article
      className={`pipeline-card holo status-${e.date_status}`}
      data-game={primaryGameKey(e)}
      data-going={going}
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
              · {displayDateLabel(e, today)}
              {hasNote ? " · has notes" : ""}
            </span>
          </button>
        </h4>
      </div>
      <div className="pcard-meta">
        <ClashCue score={score} entries={entries} />
        <span className="pcard-line">
          <CalendarDays size={14} aria-hidden="true" />
          {displayDateLabel(e, today)}
        </span>
        <span className="pcard-line">
          <Place e={e} />
        </span>
      </div>
      <div className="pcard-foot">
        <PriorityChip result={score} />
      </div>
      <div className="pcard-tags">
        <Status e={e} />
        <FindBadges e={e} />
        <span className="game-tag" data-game={gameKey(primary)}>
          {primary}
        </span>
        {hasNote && <NoteTag />}
      </div>
      <div className="pcard-actions">
        <GoingButton e={e} going={going} setGoing={setGoing} />
        <StagePicker
          name={e.name}
          stage={stage}
          onChange={(s) => change(e, s)}
        />
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
