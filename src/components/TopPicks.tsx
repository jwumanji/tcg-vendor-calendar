import { useMemo } from "react";
import { Gem } from "lucide-react";
import type { Event } from "../model";
import { compareByScore, TIER_THRESHOLDS, type ScoreResult } from "../scoring";
import { emptyEntry, type Entries } from "../storage";
import {
  displayDateLabel,
  isUndated,
  primaryGameKey,
  upcoming,
} from "../utils";
import { holo } from "../holo";
import { EmptyState } from "./EmptyState";
import { ClashCue, Logo, NoteTag, Place, ScheduleBadge } from "./EventIdentity";
import { FindBadges } from "./FindSource";
import { GoingButton, type SetGoing } from "./GoingButton";
import { StageBadge } from "./Pipeline";
import { PriorityChip } from "./PriorityChip";

export function TopPicks({
  events,
  today,
  scores,
  entries,
  setGoing,
  open,
}: {
  events: Event[];
  today: string;
  scores: Record<string, ScoreResult>;
  entries: Entries;
  setGoing: SetGoing;
  open: (e: Event) => void;
}) {
  const top = useMemo(
    () =>
      events
        .filter((e) => e.event_status !== "cancelled" && !isUndated(e) && upcoming(e, today))
        .sort((a, b) => compareByScore(scores[a.id], scores[b.id])),
    [events, today, scores],
  );
  // Select by priority, then render in the shared view order.
  const ranks = new Map(top.slice(0, 12).map((e, i) => [e.id, i + 1]));
  return (
    <section className="overview">
      <div className="picks">
        <div className="section-label">
          <span>✦ TOP VENDOR PICKS</span>
          <span>PRIORITY RANK</span>
        </div>
        {top.length === 0 && (
          <EmptyState icon={Gem} title="No scored events to show">
            Upcoming events with announced or estimated dates appear here.
          </EmptyState>
        )}
        <div className="pick-grid">
          {events.filter((e) => ranks.has(e.id)).map((e) => (
            <article
              className="pick holo"
              key={e.id}
              data-going={!!entries[e.id]?.going}
              data-game={primaryGameKey(e)}
              {...holo}
            >
              <span className="pick-rank" aria-hidden="true">
                {String(ranks.get(e.id)).padStart(2, "0")}
              </span>
              <div className="pick-meta">
                <Logo e={e} />
                <ClashCue score={scores[e.id]} entries={entries} />
                <PriorityChip result={scores[e.id]} />
                <GoingButton
                  e={e}
                  going={!!entries[e.id]?.going}
                  setGoing={setGoing}
                />
              </div>
              <h3>
                <button className="stretched-button" onClick={() => open(e)}>
                  {e.name}
                  <span className="sr-only">
                    {" "}
                    · Priority rank {ranks.get(e.id)} · {displayDateLabel(e, today)} · {(entries[e.id] || emptyEntry).stage}
                  </span>
                </button>
              </h3>
              <ScheduleBadge e={e} />
              <StageBadge stage={(entries[e.id] || emptyEntry).stage} />
              {entries[e.id]?.note.trim() && <NoteTag />}
              <FindBadges e={e} />
              <p>
                <Place e={e} />
                <span>· {displayDateLabel(e, today)}</span>
              </p>
            </article>
          ))}
        </div>
        <ul className="priority-legend" aria-label="Priority score tiers">
          {[
            ["Must-do", TIER_THRESHOLDS.must + "+", "must"],
            [
              "Strong",
              `${TIER_THRESHOLDS.strong}–${TIER_THRESHOLDS.must - 1}`,
              "strong",
            ],
            [
              "Maybe",
              `${TIER_THRESHOLDS.maybe}–${TIER_THRESHOLDS.strong - 1}`,
              "maybe",
            ],
            ["Skip", `under ${TIER_THRESHOLDS.maybe}`, "skip"],
          ].map(([label, range, tier]) => (
            <li key={label}>
              <i className={`priority-${tier}`} aria-hidden="true" />
              {label}
              <span>{range}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
