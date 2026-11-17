import { useEffect, useRef, useState } from "react";
import {
  Ban,
  BadgeCheck,
  CircleDollarSign,
  CreditCard,
  Send,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { Event } from "../model";
import { stages, emptyEntry, type Stage, type Entries } from "../storage";

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
  open,
  change,
}: {
  events: Event[];
  entries: Entries;
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
            {items.map((e) => (
              <article className="pipeline-card" key={e.id}>
                <button onClick={() => open(e)}>
                  {e.name}
                  {entries[e.id]?.note.trim() && <small> 📝 Notes</small>}
                </button>
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
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
