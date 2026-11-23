import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { vendorApplyAction } from "../eventDecision";
import { milestonePassed } from "../milestones";
import { followUpLabels } from "../outreach";
import { eventPath } from "../route";
import { formatDateRange, prettyDate } from "../utils";
import type { digestActions, digestChanges, loadDigestCheckpoint } from "../weeklyDigest";
import { ApplyLink } from "./ApplyLink";
import { Modal } from "./Modal";
import { MilestoneTimes } from "./UpcomingMilestones";

const reviewDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
});

type Props = {
  changes: ReturnType<typeof digestChanges>;
  actions: ReturnType<typeof digestActions>;
  review: ReturnType<typeof loadDigestCheckpoint>;
  now: number;
  snapshotDate: string;
  markReviewed: () => void;
  canOpen: (id: string) => boolean;
  openEvent: (id: string) => void;
  close: () => void;
  returnFocus: () => HTMLElement | null;
};

export function WeeklyDigest({
  changes, actions, review, now, snapshotDate, markReviewed, canOpen, openEvent, close, returnFocus,
}: Props) {
  function eventLink(id: string, name: string): ReactNode {
    if (!canOpen(id)) return name;
    return <a className="digest-event-link" href={eventPath(id)}
      onClick={(ev) => {
        if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        openEvent(id);
      }}>{name}</a>;
  }

  return (
    <Modal id="weekly-digest" title={<><CalendarDays size={21} aria-hidden="true" /> Weekly digest</>}
      titleId="weekly-digest-title" closeLabel="Close weekly digest" close={close}
      className="digest-dialog" returnFocus={returnFocus}>
      <div className="digest-content">
        <section aria-labelledby="digest-review-title">
          <div className="digest-section-head">
            <h3 id="digest-review-title">Since last review</h3>
            <button type="button" className="button" onClick={markReviewed}>Mark reviewed</button>
          </div>
          <div className="digest-review-status" role="status">
            {review.error && <p>{review.error}</p>}
            {review.checkpoint ? (
              <p>Last reviewed <time dateTime={review.checkpoint.reviewedAt}>
                {reviewDate.format(new Date(review.checkpoint.reviewedAt))}
              </time> Saigon · Data from {prettyDate(review.checkpoint.snapshotDate)}</p>
            ) : <p>Mark reviewed to use the {prettyDate(snapshotDate)} data as your baseline on this device.</p>}
            {review.checkpoint && !changes.length && <p>No published changes since your last review.</p>}
          </div>
          {changes.length > 0 && (
            <ul className="digest-list" aria-label="Changed events">
              {changes.map(({ id, name, listing, fields }) => (
                <li key={id} className="digest-item">
                  <h4>{eventLink(id, name)}</h4>
                  {listing && <p className="digest-listing">{listing}</p>}
                  <dl className="digest-changes">
                    {fields.map(({ key, label, previous, current }) => (
                      <div key={key} className="digest-change">
                        <dt>{label}</dt>
                        <dd>
                          <div><strong>Previous</strong><ChangeValue lines={previous} /></div>
                          <div><strong>Current</strong><ChangeValue lines={current} /></div>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="digest-week-title">
          <h3 id="digest-week-title">Next 7 days</h3>
          <p className="digest-period">{formatDateRange(actions.today, actions.end)} · Saigon</p>
          {actions.days.size === 0 && <p>No scheduled vendor dates or upcoming follow-ups this week.</p>}
          {[...actions.days].map(([day, items]) => (
            <div key={day} className="digest-day">
              <h4><time dateTime={day}>{prettyDate(day)}</time></h4>
              <ul className="digest-list">
                {items.map((item) => {
                  const { event } = item;
                  if (item.kind === "outreach") return (
                    <li className="digest-item" key={JSON.stringify(["follow-up", event.id])}>
                      <h5>{eventLink(event.id, event.name)}</h5>
                      <p>{followUpLabels[item.reminder.kind]}</p>
                    </li>
                  );
                  const { milestone } = item;
                  const passed = milestonePassed(milestone, now);
                  const application = !passed && (milestone.type === "booking_opens" || milestone.type === "application_closes")
                    && vendorApplyAction(event, now);
                  return (
                    <li className="digest-item digest-deadline" key={JSON.stringify(["milestone", event.id, milestone.id])}>
                      <div>
                        <h5>{eventLink(event.id, event.name)}</h5>
                        <p>{milestone.label}{passed && " · Passed"}</p>
                        <MilestoneTimes milestone={milestone} />
                        {milestone.notes && <p className="digest-note">{milestone.notes}</p>}
                      </div>
                      {application && <ApplyLink action={application} name={event.name} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {actions.sourceChecks.length > 0 && (
            <details className="digest-sources">
              <summary>Vendor notices to check ({actions.sourceChecks.length})</summary>
              <ul className="digest-list">
                {actions.sourceChecks.map(({ event, id, label, detail, href }) => (
                  <li className="digest-item digest-deadline" key={JSON.stringify([event.id, id])}>
                    <div>
                      <h4>{eventLink(event.id, event.name)}</h4>
                      <p>{label}</p>
                      {detail && <p className="digest-note">{detail}</p>}
                    </div>
                    {href && <a className="button" href={href}
                      target="_blank" rel="noreferrer" aria-label={`Check source for ${event.name}: ${label}`}>Check source</a>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <section aria-labelledby="digest-follow-up-title">
          <h3 id="digest-follow-up-title">Due and overdue follow-ups</h3>
          {actions.followUps.length === 0 ? <p>No follow-ups due.</p> : (
            <ul className="digest-list">
              {actions.followUps.map(({ event, kind, due }) => (
                <li className="digest-item" key={event.id}>
                  <h4>{eventLink(event.id, event.name)}</h4>
                  <p>{followUpLabels[kind]} · {due === actions.today ? "Due today" : "Overdue"}</p>
                  <time dateTime={due}>{prettyDate(due)} · Saigon</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function ChangeValue({ lines }: { lines: string[] }) {
  if (!lines.length) return <span className="digest-note">Not listed</span>;
  return <>{lines.map((line, index) => <span key={index}>{line}</span>)}</>;
}
