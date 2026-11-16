import React, { useRef, useEffect } from "react";
import { ArrowUpRight, CalendarDays, MapPin, X, Download } from "lucide-react";
import type { Event } from "../model";
import { dateLabel, flag, safeUrl, ranges, prettyDate, ics, download } from "../utils";
import { Logo, Status } from "./EventIdentity";
import { StageBadge, StagePicker } from "./Pipeline";
import type { Entry, Stage } from "../storage";
export function Detail({
  e,
  close,
  entry, onStage, onNote, saved,
}: {
  e: Event;
  close: () => void;
  entry: Entry; onStage: (s: Stage) => void; onNote: (s: string) => void; saved: boolean;
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (entry.stage === "Too expensive") noteRef.current?.focus();
    else ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function key(ev: KeyboardEvent) {
      if (ev.key === "Escape") close();
      if (ev.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button,a[href],select,input,textarea,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, [close]);
  const row = (label: string, v: React.ReactNode) =>
    v !== null && v !== undefined && v !== "" ? (
      <div className="detail-row">
        <dt>{label}</dt>
        <dd>{v}</dd>
      </div>
    ) : null;
  const link = (url: string | null, label: string) =>
    safeUrl(url) ? (
      <a href={url!} target="_blank" rel="noopener noreferrer">
        {label}
        <ArrowUpRight size={14} />
      </a>
    ) : null;
  return (
    <div
      className="overlay"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) close();
      }}
    >
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        ref={ref}
      >
        <div className="drawer-top">
          <span>EVENT FIELDNOTES</span>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close event details"
          >
            <X size={22} />
          </button>
        </div>
        <div className="detail-body">
          <Logo e={e} />
          <div className="detail-badges">
            <Status e={e} />
            {e.priority_market && (
              <span className="badge priority">
                ✦ {e.priority_market_level} priority market
              </span>
            )}
          </div>
          <h2 id="detail-title">{e.name}</h2>
          <p className="detail-date">
            <CalendarDays size={18} />
            {dateLabel(e)}
            {e.start_date ? " · " + e.start_date.slice(0, 4) : ""}
          </p>
          {e.date_note && <p className="note">{e.date_note}</p>}
          {e.date_status === "estimated" && (
            <p className="note">
              Estimated timing only. Confirm with the organizer before booking
              travel.
            </p>
          )}
          <p>
            <MapPin size={16} /> {flag(e.country_code)}{" "}
            {[e.city, e.country].filter(Boolean).join(", ") || "Location TBA"}
          </p>
          <div className="planning">
            <label>PIPELINE STAGE</label>
            <StageBadge stage={entry.stage} />
            <p className="stage-help">{({ New: "Choose a stage when you review this event.", Pass: "Keep for later; hidden by default.", "Too expensive": "Record the quoted booth price below.", Interested: "Next step: find out the booth price.", Contacted: "Waiting for information from the organizer.", "Need to pay": "Arrange payment for the booth.", "Paid / attending": "Booth paid — ready to attend." })[entry.stage]}</p>
            <StagePicker stage={entry.stage} onChange={(stage) => { onStage(stage); if (stage === "Too expensive") noteRef.current?.focus(); }} />
            <label htmlFor="event-note">Justin’s notes</label>
            <textarea id="event-note" ref={noteRef} value={entry.note} placeholder={entry.stage === "Too expensive" ? "Booth price quoted…" : "Add event notes…"} onChange={(ev) => onNote(ev.target.value)} />
            <small role="status">{saved ? "Saved on this device" : "Not saved to this device — export a backup"}{entry.noteUpdatedAt && ` · Last edited ${new Date(entry.noteUpdatedAt).toLocaleString()}`}</small>
          </div>
          {e.vendor_score !== null && (
            <div className="vendor-meter">
              <span>
                Vendor fit score
                <strong>
                  {e.vendor_score}
                  <small>/100</small>
                </strong>
              </span>
              <meter min="0" max="100" value={e.vendor_score} />
            </div>
          )}
          <p className="description">{e.description}</p>
          <div className="game-pills">
            {e.games.map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
          <h3>The essentials</h3>
          <dl>
            {row("Venue", e.venue)}
            {row("Organizer", e.organizer)}
            {row("Event type", e.event_type)}
            {row("Region", e.region_group)}
            {row(
              "Size tier",
              e.size_tier
                ? e.size_tier + (e.size_tier_estimated ? " · estimated" : "")
                : null,
            )}
            {row("Expected size", e.expected_size)}
            {row("Size notes", e.size_note)}
            {row("Visitors", e.visitors?.toLocaleString())}
            {row("Vendors", e.vendor_count?.toLocaleString())}
            {row("Previous editions", e.previous_editions)}
            {row("Edition count", e.previous_editions_count)}
            {row("First year", e.first_year)}
            {row("Audience", e.audience)}
            {row("Vendor fit", e.fit)}
            {row("Shortlist priority", e.shortlist_priority)}
          </dl>
          {e.occurrences && (
            <>
              <h3>All published occurrences</h3>
              <div className="occurrences">
                {ranges(e).map((r) => (
                  <span key={r.start_date}>
                    {prettyDate(r.start_date)}
                    {r.end_date !== r.start_date
                      ? " – " + prettyDate(r.end_date)
                      : ""}{" "}
                    2027
                  </span>
                ))}
              </div>
            </>
          )}
          <h3>Vendor information</h3>
          <dl>
            {row("Booths offered", e.vendor_booths || "Unknown")}
            {row(
              "How to apply",
              safeUrl(e.vendor_application)
                ? link(e.vendor_application, "Application information")
                : e.vendor_application,
            )}
            {row("Deadline / notice", e.vendor_deadline)}
            {row("Cost", e.vendor_cost)}
            {row("Booth details", e.booth_detail)}
            {row(
              "Contact",
              safeUrl(e.contact)
                ? link(e.contact, "Contact organizer")
                : e.contact,
            )}
          </dl>
          <h3>Follow the source</h3>
          <div className="source-links">
            {link(e.website, "Official website")}
            {link(e.instagram, "Instagram")}
            {e.source_urls.filter(safeUrl).map((s, i) => (
              <React.Fragment key={s}>
                {link(s, `Source ${i + 1}`)}
              </React.Fragment>
            ))}
          </div>
          {e.instagram_followers !== null && (
            <p>Instagram followers: {e.instagram_followers.toLocaleString()}</p>
          )}
          {e.date_status === "confirmed" && (
            <button
              className="button primary full"
              onClick={() =>
                download(ics([e]), e.id + ".ics", "text/calendar;charset=utf-8")
              }
            >
              <Download size={16} /> Add{" "}
              {e.occurrences ? "all occurrences" : "event"} to calendar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
