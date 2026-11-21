import { useRef, useState, type FormEvent } from "react";
import { CalendarClock, Pencil, Plus } from "lucide-react";
import { milestoneSourceHref, normalizeMilestone } from "../data";
import { compareMilestones, milestoneCountdown, milestoneTypeLabels } from "../milestones";
import { milestoneTypes, type Event, type VendorMilestone } from "../model";
import { MilestoneExport } from "./EventExports";
import { Modal } from "./Modal";
import { MilestoneTimes, useMilestoneClock } from "./UpcomingMilestones";

export function BookingMilestones({
  event,
  onSave,
  sharedMilestones,
  localMilestones,
  onRemove,
}: {
  event: Event;
  onSave: (milestone: VendorMilestone) => void;
  sharedMilestones?: readonly VendorMilestone[];
  localMilestones?: readonly VendorMilestone[];
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<VendorMilestone | "new" | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const now = useMilestoneClock();
  const milestones = [...(event.vendor_milestones ?? [])].sort(compareMilestones);
  return (
    <section className="booking-milestones" aria-labelledby="booking-milestones-title">
      <h2 id="booking-milestones-title">Booking milestones</h2>
      {milestones.length ? (
        <ul>
          {milestones.map((milestone) => {
            const href = milestoneSourceHref(milestone.source);
            const countdown = milestoneCountdown(event, milestone, now);
            const local = localMilestones?.some(({ id }) => id === milestone.id);
            const shared = sharedMilestones?.some(({ id }) => id === milestone.id);
            const removeLabel = shared ? "Reset to shared" : "Delete local milestone";
            return (
              <li key={milestone.id} className="booking-milestone">
                <div className="milestone-title">
                  <h3>{milestone.label}</h3>
                  {event.event_status ? <span className="milestone-badge">Booking date on hold</span>
                    : !milestone.verified && <span className="milestone-badge">Unverified date</span>}
                </div>
                <MilestoneTimes milestone={milestone} />
                {countdown && <p className="milestone-countdown">{countdown}</p>}
                {milestone.notes && <p className="milestone-notes">{milestone.notes}</p>}
                <div className="milestone-actions">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" aria-label={`Source for ${milestone.label}`}>
                      Source
                    </a>
                  ) : <span className="milestone-notes">{milestone.source}</span>}
                  <MilestoneExport event={event} milestone={milestone} />
                  <button className="button" onClick={() => setEditing(milestone)} aria-label={`Edit ${milestone.label}`} aria-haspopup="dialog">
                    <Pencil size={14} aria-hidden="true" /> Edit
                  </button>
                  {local && (
                    <button className="button" aria-label={`${removeLabel}: ${milestone.label}`} onClick={(action) => {
                      const editButton = action.currentTarget.previousElementSibling as HTMLButtonElement;
                      (shared ? editButton : addButton.current)?.focus();
                      onRemove(milestone.id);
                    }}>
                      {removeLabel}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p>No booking milestones recorded yet.</p>}
      <button className="button" ref={addButton} onClick={() => setEditing("new")} aria-haspopup="dialog">
        <Plus size={15} aria-hidden="true" /> Add milestone
      </button>
      {editing && (
        <MilestoneEditor
          milestone={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          save={(milestone) => {
            onSave(milestone);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function MilestoneEditor({ milestone, close, save }: {
  milestone?: VendorMilestone;
  close: () => void;
  save: (milestone: VendorMilestone) => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    let next: VendorMilestone;
    try {
      next = normalizeMilestone({
        ...Object.fromEntries(values),
        id: milestone?.id ?? crypto.randomUUID(),
        verified: values.has("verified"),
      });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    save(next);
  }
  return (
    <div onKeyDown={(event) => {
      if (event.key === "Escape") event.stopPropagation();
    }}>
      <Modal
        title={<><CalendarClock size={20} aria-hidden="true" /> {milestone ? "Edit milestone" : "Add milestone"}</>}
        titleId="milestone-editor-title"
        closeLabel="Close milestone editor"
        close={close}
        className="milestone-dialog"
      >
        <form className="milestone-form" onSubmit={submit}>
          <label>
            Type
            <select name="type" defaultValue={milestone?.type}>
              {milestoneTypes.map((type) => <option key={type} value={type}>{milestoneTypeLabels[type]}</option>)}
            </select>
          </label>
          <label>
            Label
            <input name="label" required defaultValue={milestone?.label} placeholder="e.g. General booking opens" />
          </label>
          <label>
            Date or datetime with offset
            <input name="at" required defaultValue={milestone?.at} spellCheck={false} aria-describedby="milestone-date-help" />
          </label>
          <p id="milestone-date-help">
            Use <code>2026-12-01</code> for a date with no published time, or <code>2026-12-01T12:00+07:00</code> for an exact time.
          </p>
          <label>
            Organizer time zone
            <input name="timeZone" required defaultValue={milestone?.timeZone} placeholder="e.g. Asia/Singapore" spellCheck={false} />
          </label>
          <label>
            Source link or reference
            <input name="source" required defaultValue={milestone?.source} />
          </label>
          <label>
            Notes (optional)
            <textarea name="notes" rows={2} defaultValue={milestone?.notes} />
          </label>
          <label className="milestone-verified">
            <input name="verified" type="checkbox" defaultChecked={milestone?.verified} />
            Verified date
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="milestone-actions">
            <button type="submit" className="button primary">Save milestone</button>
            <button type="button" className="button" onClick={close}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
