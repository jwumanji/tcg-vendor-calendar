import { GoingButton, type SetGoing } from "./GoingButton";
import { PriorityChip } from "./PriorityChip";
import { FindBadges } from "./FindSource";
import type { ScoreResult } from "../scoring";
import { memo } from "react";
import { CalendarDays } from "lucide-react";
import type { Event } from "../model";
import type { Entries, Entry } from "../storage";
import { games, dateLabel, gameKey, primaryGameKey } from "../utils";
import { holo } from "../holo";
import {
  ClashCue,
  Logo,
  Status,
  Place,
  NoteTag,
} from "./EventIdentity";
import { StageBadge } from "./Pipeline";
export const EventCard = memo(function EventCard({
  e,
  entry,
  entries,
  score,
  setGoing,
  occurrence,
  titleLevel = 3,
  open,
}: {
  e: Event;
  entry: Entry;
  entries: Entries;
  score: ScoreResult;
  setGoing: SetGoing;
  occurrence?: string;
  titleLevel?: 3 | 4;
  open: (e: Event, occurrence?: string) => void;
}) {
  const Title = titleLevel === 4 ? "h4" : "h3";
  return (
    <article
      className={`event-card holo status-${e.date_status}`}
      data-game={primaryGameKey(e)}
      data-going={entry.going}
      {...holo}
    >
      <Logo e={e} size="xl" />
      <div className="card-details">
        <div className="card-heading">
          <Title className="card-title">
            <button className="stretched-button" onClick={() => open(e, occurrence)}>
              {e.name}
              <span className="sr-only">
                {" "}
                · {occurrence || dateLabel(e)} · {entry.stage}
              </span>
            </button>
          </Title>
          <GoingButton e={e} going={entry.going} setGoing={setGoing} />
        </div>
        <div className="card-art">
          <div className="card-when">
            <CalendarDays size={16} aria-hidden="true" />
            <span>{occurrence || dateLabel(e)}</span>
          </div>
          <div className="card-location">
            <Place e={e} />
          </div>
          <div className="card-art-foot">
            <PriorityChip result={score} />
          </div>
        </div>
        <div className="card-tags">
          <ClashCue score={score} entries={entries} />
          <Status e={e} />
          <FindBadges e={e} />
          {games(e)
            .slice(0, 3)
            .map((g) => (
              <span key={g} className="game-tag" data-game={gameKey(g)}>
                {g}
              </span>
            ))}
          <StageBadge stage={entry.stage} />
          {entry.note.trim() && <NoteTag />}
        </div>
      </div>
    </article>
  );
});
