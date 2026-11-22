import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import type { Event, VendorMilestone } from "../model";
import { milestoneCountdown, milestoneTimes, upcomingMilestones } from "../milestones";
import { vendorApplyAction } from "../eventDecision";
import { MilestoneExport } from "./EventExports";
import { ApplyLink } from "./ApplyLink";

const cardLimit = 3;

export function MilestoneTimes({ milestone }: { milestone: VendorMilestone }) {
  return (
    <time className="milestone-time" dateTime={milestone.at}>
      {milestoneTimes(milestone).map((label) => <span key={label}>{label}</span>)}
    </time>
  );
}

export function useMilestoneClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}

export function UpcomingMilestones({ events, open, focusFallback }: {
  events: Event[];
  open: (event: Event) => void;
  focusFallback?: RefObject<HTMLHeadingElement | null>;
}) {
  const now = useMilestoneClock();
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef(false);
  const trackFocus = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    // React detaches the ref before removing the focused card or toggle.
    return () => {
      if (node.contains(document.activeElement)) restoreFocus.current = true;
    };
  }, []);
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement !== document.body) return;
    const next = list.current?.querySelector<HTMLButtonElement>(".milestone-card") ?? focusFallback?.current;
    next?.focus();
  });

  const upcoming = upcomingMilestones(events, now);
  if (!upcoming.length) return null;
  const visible = expanded ? upcoming : upcoming.slice(0, cardLimit);
  const extra = upcoming.length - cardLimit;
  return (
    <section className="upcoming-milestones" aria-labelledby="upcoming-milestones-title">
      <h3 id="upcoming-milestones-title">
        <CalendarClock size={17} aria-hidden="true" /> Upcoming vendor deadlines &amp; openings
      </h3>
      <ul id="upcoming-milestones-list" ref={list}>
        {visible.map(({ event, milestone }) => {
          const application = (milestone.type === "application_closes" || milestone.type === "booking_opens") &&
            vendorApplyAction(event, now);
          return (
            <li key={JSON.stringify([event.id, milestone.id])} ref={trackFocus}>
              <button className="milestone-card" onClick={() => open(event)}>
                <strong>{event.name}</strong>
                <ArrowUpRight className="milestone-arrow" size={16} aria-hidden="true" />
                <span className="milestone-label">{milestone.label}</span>
                <MilestoneTimes milestone={milestone} />
                <span className="milestone-countdown">{milestoneCountdown(event, milestone, now)}</span>
                {milestone.notes && <span className="milestone-notes">{milestone.notes}</span>}
              </button>
              <div className="upcoming-milestone-actions">
                {application && <ApplyLink action={application} name={event.name} compact />}
                <MilestoneExport event={event} milestone={milestone} />
              </div>
            </li>
          );
        })}
      </ul>
      {extra > 0 && (
        <button className="button milestone-toggle" ref={trackFocus} aria-expanded={expanded}
          aria-controls="upcoming-milestones-list" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer milestones" : `Show ${extra} more ${extra === 1 ? "milestone" : "milestones"}`}
        </button>
      )}
    </section>
  );
}
