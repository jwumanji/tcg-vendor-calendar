import { useMemo } from "react";
import { ArrowUpRight, Clock, Gem } from "lucide-react";
import type { Event } from "../model";
import { compareByScore, TIER_THRESHOLDS, type ScoreResult } from "../scoring";
import { emptyEntry, type Entries } from "../storage";
import {
  dateLabel,
  deadlineDate,
  isUndated,
  prettyDate,
  primaryGameKey,
  upcoming,
} from "../utils";
import { holo } from "../holo";
import { EmptyState } from "./EmptyState";
import { ClashCue, Logo, NoteTag, Place } from "./EventIdentity";
import { FindBadges } from "./FindSource";
import { GoingButton, type SetGoing } from "./GoingButton";
import { StageBadge } from "./Pipeline";
import { PriorityChip } from "./PriorityChip";

export function TopPicks({
  events,
  visible,
  today,
  scores,
  entries,
  setGoing,
  open,
}: {
  events: Event[];
  visible: (e: Event) => boolean;
  today: string;
  scores: Record<string, ScoreResult>;
  entries: Entries;
  setGoing: SetGoing;
  open: (e: Event) => void;
}) {
  const top = useMemo(
    () =>
      events
        .filter((e) => visible(e) && !isUndated(e) && upcoming(e, today))
        .sort((a, b) => compareByScore(scores[a.id], scores[b.id])),
    [events, visible, today, scores],
  );
  const deadlines = useMemo(
    () =>
      events
        .filter((e) => visible(e) && e.vendor_deadline && upcoming(e, today))
        .sort((a, b) =>
          (deadlineDate(a.vendor_deadline) || "9999").localeCompare(
            deadlineDate(b.vendor_deadline) || "9999",
          ),
        )
        .filter(
          (e) =>
            !deadlineDate(e.vendor_deadline) ||
            deadlineDate(e.vendor_deadline)! >= today,
        ),
    [events, visible, today],
  );
  return (
    <section className="overview">
      <div className="picks">
        <div className="section-label">
          <span>✦ TOP VENDOR PICKS</span>
          <span>RANKED BY PRIORITY</span>
        </div>
        {top.length === 0 && (
          <EmptyState icon={Gem} title="No scored events to show">
            Upcoming events with announced or estimated dates appear here.
          </EmptyState>
        )}
        <div className="pick-grid">
          {top.slice(0, 12).map((e, i) => (
            <article
              className="pick holo"
              key={e.id}
              data-going={!!entries[e.id]?.going}
              data-game={primaryGameKey(e)}
              data-tier={scores[e.id].tier === "must" ? "secret" : "rare"}
              {...holo}
            >
              <span className="pick-rank" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
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
                    · {dateLabel(e)} · {(entries[e.id] || emptyEntry).stage}
                  </span>
                </button>
              </h3>
              <StageBadge stage={(entries[e.id] || emptyEntry).stage} />
              {entries[e.id]?.note.trim() && <NoteTag />}
              <FindBadges e={e} />
              <p>
                <Place e={e} />
                <span>· {dateLabel(e)}</span>
              </p>
            </article>
          ))}
        </div>
        <ul className="rarity-legend" aria-label="Priority score tiers">
          {[
            ["Must-do", TIER_THRESHOLDS.must + "+", "secret"],
            [
              "Strong",
              `${TIER_THRESHOLDS.strong}–${TIER_THRESHOLDS.must - 1}`,
              "ultra",
            ],
            [
              "Maybe",
              `${TIER_THRESHOLDS.maybe}–${TIER_THRESHOLDS.strong - 1}`,
              "rare",
            ],
            ["Skip", `under ${TIER_THRESHOLDS.maybe}`, "common"],
          ].map(([label, range, tone]) => (
            <li key={label} className={`gem-${tone}`}>
              <i aria-hidden="true" />
              {label}
              <span>{range}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="deadline-box">
        <div className="section-label">
          <span>
            <Clock size={14} /> UPCOMING DEADLINES
          </span>
        </div>
        {deadlines.length === 0 && (
          <p className="deadline-empty">No open vendor deadlines right now.</p>
        )}
        {deadlines.slice(0, 6).map((e) => (
          <button key={e.id} onClick={() => open(e)}>
            <span className="deadline-date">
              {deadlineDate(e.vendor_deadline)
                ? prettyDate(deadlineDate(e.vendor_deadline)!)
                : "CHECK DETAILS"}
            </span>
            <strong>{e.name}</strong>
            <span className="card-tags">
              <PriorityChip result={scores[e.id]} />
              <StageBadge stage={(entries[e.id] || emptyEntry).stage} />
              {entries[e.id]?.note.trim() && <NoteTag />}
            </span>
            <span className="deadline-copy">{e.vendor_deadline}</span>
            <ArrowUpRight size={15} />
          </button>
        ))}
        <small>
          Registration notes may include player dates. Check vendor details.
        </small>
      </div>
    </section>
  );
}
