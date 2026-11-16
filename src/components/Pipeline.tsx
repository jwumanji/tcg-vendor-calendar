import type { Event } from "../model";
import { stages, emptyEntry, type Stage, type Entries } from "../storage";
export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`badge stage stage-${stages.indexOf(stage)}`}>
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
          <section className="pipeline-column" key={stage}>
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
