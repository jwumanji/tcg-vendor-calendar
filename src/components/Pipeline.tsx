import { PriorityChip } from "./PriorityChip";
import { FindBadges } from "./FindSource";
import type { ScoreResult } from "../scoring";
import { memo, useEffect, useRef, useState } from "react";
import {
  Ban,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Send,
  MapPin,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { Event } from "../model";
import { stages, emptyEntry, type Stage, type Entries } from "../storage";
import { dateLabel, games, gameKey, primaryGameKey, rarity } from "../utils";
import { holo } from "../holo";
import { Logo, Status, CountryFlag, ScoreGem, NoteTag } from "./EventIdentity";

/** Every stage has an icon as well as a label, so stages never rely on colour alone. */
const stageIcons: Record<Stage, LucideIcon> = {
  New: Sparkles,
  Pass: Ban,
  "Too expensive": CircleDollarSign,
  Interested: Star,
  Contacted: Send,
  "Need to pay": CreditCard,
  "Paid / attending": BadgeCheck,
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
      className={`badge stage stage-${stages.indexOf(stage)}${
        bump ? ` bump-${bump % 2 ? "a" : "b"}` : ""
      }`}
    >
      <Icon size={13} strokeWidth={2.4} />
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
  return (
    <select
      id={id}
      aria-label={`Pipeline stage for ${name}`}
      value={stage}
      onChange={(e) => onChange(e.target.value as Stage)}
    >
      {stages.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}
export function Pipeline({
  events,
  entries,
  scores,
  open,
  change,
}: {
  events: Event[];
  entries: Entries;
  scores: Record<string, ScoreResult>;
  open: (event: Event) => void;
  change: (event: Event, stage: Stage) => void;
}) {
  return (
    <div className="pipeline">
      {stages.map((stage) => {
        const items = events.filter(
          (e) => (entries[e.id] || emptyEntry).stage === stage,
        );
        return (
          <section
            className={`pipeline-column stage-col-${stages.indexOf(stage)}`}
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
                key={e.id}
                e={e}
                score={scores[e.id]}
                stage={stage}
                hasNote={!!entries[e.id]?.note.trim()}
                open={open}
                change={change}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Compact Holo Vault card. The title button is stretched over the card to open
 * the detail panel; the stage select and price prompt sit above it (z-index) so
 * no interactive element is nested inside another.
 */
const PipelineCard = memo(function PipelineCard({
  e,
  stage,
  hasNote,
  score,
  open,
  change,
}: {
  e: Event;
  stage: Stage;
  hasNote: boolean;
  score: ScoreResult;
  open: (event: Event) => void;
  change: (event: Event, stage: Stage) => void;
}) {
  const tier = e.vendor_score !== null ? rarity(e.vendor_score).tier : "none";
  const primary = games(e)[0];
  const place = [e.city, e.country].filter(Boolean).join(", ");
  return (
    <article
      className={`pipeline-card holo status-${e.date_status}`}
      data-game={primaryGameKey(e)}
      data-tier={tier}
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
              · {dateLabel(e)}
              {hasNote ? " · has notes" : ""}
            </span>
          </button>
        </h4>
      </div>
      <div className="pcard-meta">
        <span className="pcard-line">
          <CalendarDays size={14} aria-hidden="true" />
          {dateLabel(e)}
        </span>
        <span className="pcard-line">
          <MapPin size={14} aria-hidden="true" />
          <span>
            <CountryFlag code={e.country_code} /> {place || "Location TBA"}
          </span>
        </span>
      </div>
      <div className="pcard-foot">
        <PriorityChip result={score} />
        {e.vendor_score !== null && <ScoreGem score={e.vendor_score} />}
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
        <StagePicker
          name={e.name}
          stage={stage}
          onChange={(s) => change(e, s)}
        />
        {stage === "Too expensive" && (
          <button className="text-button" onClick={() => open(e)}>
            Add booth price →
          </button>
        )}
      </div>
    </article>
  );
});
