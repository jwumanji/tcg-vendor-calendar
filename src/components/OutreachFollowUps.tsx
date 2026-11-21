import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowUpRight, Bell, MessagesSquare, Reply } from "lucide-react";
import type { Event, Outreach } from "../model";
import { dueOutreach, followUpLabels } from "../outreach";

const cardLimit = 3;
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

function OutreachDate({ date }: { date: string }) {
  return <time dateTime={date}>{dayFormat.format(new Date(date))}</time>;
}

const sentByMethod = {
  email: "Email sent",
  form: "Form submitted",
  instagram_dm: "Instagram DM sent",
  other: "Contacted organizer",
};

function lastExchange(outreach: Outreach, kind: "reply" | "nudge") {
  if (kind === "reply") {
    return {
      label: outreach.status === "quoted" ? "Organizer quote" : "Organizer reply",
      date: outreach.response_at,
    };
  }
  if (outreach.acknowledgement_at) {
    return { label: "Automatic acknowledgement", date: outreach.acknowledgement_at };
  }
  return {
    label: outreach.method ? sentByMethod[outreach.method] : "Contacted organizer",
    date: outreach.contacted_at,
  };
}

export function OutreachFollowUps({ events, today, open, focusFallback }: {
  events: Event[];
  today: string;
  open: (event: Event, returnFocus: () => HTMLElement | null) => void;
  focusFallback?: RefObject<HTMLHeadingElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef(false);
  const returnFocus = useCallback(() =>
    list.current?.querySelector<HTMLButtonElement>(".outreach-follow-up-card") ?? focusFallback?.current ?? null,
  [focusFallback]);
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
    if (document.activeElement === document.body) returnFocus()?.focus();
  });

  const queue = dueOutreach(events, today);
  if (!queue.length) return null;
  const visible = expanded ? queue : queue.slice(0, cardLimit);
  const extra = queue.length - cardLimit;
  return (
    <section className="outreach-follow-ups" aria-labelledby="outreach-follow-ups-title">
      <h3 id="outreach-follow-ups-title">
        <MessagesSquare size={17} aria-hidden="true" /> Outreach follow-ups
      </h3>
      <ul id="outreach-follow-ups-list" role="list" ref={list}>
        {visible.map(({ event, outreach, kind, due }) => {
          const exchange = lastExchange(outreach, kind);
          return (
            <li key={event.id} ref={trackFocus}>
              <button type="button" className="outreach-follow-up-card" onClick={() => open(event, returnFocus)}
                aria-labelledby={`outreach-event-${event.id} outreach-action-${event.id}`}
                aria-describedby={`outreach-exchange-${event.id}`}>
                <strong id={`outreach-event-${event.id}`}>{event.name}</strong>
                <ArrowUpRight className="outreach-follow-up-arrow" size={16} aria-hidden="true" />
                <span id={`outreach-action-${event.id}`} className="outreach-follow-up-action">
                  {kind === "reply" ? <Reply size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
                  {followUpLabels[kind]}
                </span>
                <span id={`outreach-exchange-${event.id}`} className="outreach-follow-up-exchange">
                  <span>
                    Due <OutreachDate date={due} /> · {kind === "reply"
                      ? "The organizer is waiting for your reply."
                      : "Awaiting a human reply."}
                  </span>
                  <span>Last exchange · {exchange.label}{exchange.date && <> · <OutreachDate date={exchange.date} /></>}</span>
                  {outreach.notes && <span className="outreach-follow-up-notes">{outreach.notes}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {extra > 0 && (
        <button type="button" className="button outreach-follow-up-toggle" ref={trackFocus} aria-expanded={expanded}
          aria-controls="outreach-follow-ups-list" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer follow-ups" : `Show ${extra} more ${extra === 1 ? "follow-up" : "follow-ups"}`}
        </button>
      )}
    </section>
  );
}
