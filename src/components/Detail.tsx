import React, { useRef, useEffect, useState, useCallback } from "react";
import { ArrowUpRight, CalendarDays, MapPin, X, Download } from "lucide-react";
import type { Event } from "../model";
import {
  dateLabel,
  safeUrl,
  ranges,
  prettyDate,
  ics,
  download,
  gameKeyOf,
  primaryGameKey,
  rarity,
} from "../utils";
import { Logo, Status, CountryFlag, ScoreGem } from "./EventIdentity";
import { StageBadge, StagePicker } from "./Pipeline";
import type { Entry, Stage } from "../storage";
export function Detail({
  e,
  close,
  entry,
  onStage,
  onNote,
  saved,
}: {
  e: Event;
  close: () => void;
  entry: Entry;
  onStage: (s: Stage) => void;
  onNote: (s: string) => void;
  saved: boolean;
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(entry.note);
  const draftRef = useRef(draft);
  const committed = useRef(entry.note);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;
  const flush = useCallback(() => {
    if (draftRef.current !== committed.current) {
      committed.current = draftRef.current;
      onNoteRef.current(draftRef.current);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(flush, 400);
    return () => clearTimeout(timer);
  }, [draft, flush]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const background = [
      ...document.querySelectorAll<HTMLElement>("#root > header, #root > main"),
    ];
    const previousInert = background.map((node) => node.inert);
    background.forEach((node) => {
      node.inert = true;
    });
    const y = window.scrollY;
    const bodyStyle = document.body.getAttribute("style");
    Object.assign(document.body.style, {
      position: "fixed",
      top: `-${y}px`,
      width: "100%",
      overflow: "hidden",
    });
    (ref.current?.querySelector<HTMLElement>("button") || ref.current)?.focus();
    function key(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
      if (ev.key !== "Tab") return;
      const nodes = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],select:not(:disabled),input:not(:disabled),textarea,[tabindex="0"]',
        ) || []),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (!first) {
        ev.preventDefault();
        ref.current?.focus();
      } else if (
        !ref.current?.contains(document.activeElement) ||
        (ev.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current))
      ) {
        ev.preventDefault();
        last?.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      background.forEach((node, i) => {
        node.inert = previousInert[i];
      });
      if (bodyStyle === null) document.body.removeAttribute("style");
      else document.body.setAttribute("style", bodyStyle);
      window.scrollTo(0, y);
      document.removeEventListener("keydown", key);
      const fallback = document.getElementById("workspace-title");
      (old?.isConnected ? old : fallback)?.focus({ preventScroll: true });
      if (document.activeElement === document.body)
        fallback?.focus({ preventScroll: true });
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
        data-game={primaryGameKey(e)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        ref={ref}
        tabIndex={-1}
      >
        <div className="drawer-top">
          <span className="drawer-grip" aria-hidden="true" />
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
                ✦ {e.priority_market_level ? `${e.priority_market_level} ` : ""}
                priority market
              </span>
            )}
          </div>
          <h2 id="detail-title">{e.name}</h2>
          <p className="detail-date">
            <CalendarDays size={18} />
            {dateLabel(e)}
          </p>
          {e.date_note && <p className="note">{e.date_note}</p>}
          {e.date_status === "estimated" && (
            <p className="note">
              Estimated timing only. Confirm with the organizer before booking
              travel.
            </p>
          )}
          <p>
            <MapPin size={16} /> <CountryFlag code={e.country_code} />{" "}
            {[e.city, e.country].filter(Boolean).join(", ") || "Location TBA"}
          </p>
          <div className="planning">
            <label htmlFor="detail-stage">PIPELINE STAGE</label>
            <StageBadge stage={entry.stage} />
            <p className="stage-help">
              {
                {
                  New: "Choose a stage when you review this event.",
                  Pass: "Keep for later; hidden by default.",
                  "Too expensive": "Record the quoted booth price below.",
                  Interested: "Next step: find out the booth price.",
                  Contacted: "Waiting for information from the organizer.",
                  "Need to pay": "Arrange payment for the booth.",
                  "Paid / attending": "Booth paid — ready to attend.",
                }[entry.stage]
              }
            </p>
            <StagePicker
              name={e.name}
              id="detail-stage"
              stage={entry.stage}
              onChange={onStage}
            />
            <label htmlFor="event-note">Justin’s notes</label>
            <textarea
              id="event-note"
              ref={noteRef}
              value={draft}
              placeholder={
                entry.stage === "Too expensive"
                  ? "Booth price quoted…"
                  : "Add event notes…"
              }
              onChange={(ev) => {
                draftRef.current = ev.target.value;
                setDraft(ev.target.value);
              }}
              onBlur={flush}
            />
            <small>
              {draft !== entry.note
                ? "Saving…"
                : saved
                  ? "Saved on this device"
                  : "Not saved to this device — export a backup"}
              {entry.noteUpdatedAt &&
                ` · Last edited ${new Date(entry.noteUpdatedAt).toLocaleString()}`}
            </small>
            <span className="sr-only" role="status">
              {saved && draft === entry.note
                ? "Notes saved on this device"
                : ""}
            </span>
          </div>
          {e.vendor_score !== null && (
            <div className={`vendor-meter gem-${rarity(e.vendor_score).tier}`}>
              <span>
                Vendor fit score
                <ScoreGem score={e.vendor_score} large />
              </span>
              <meter min="0" max="100" value={e.vendor_score} />
            </div>
          )}
          {e.description && <p className="description">{e.description}</p>}
          <div className="game-pills">
            {e.games.map((g) => (
              <span key={g} className="game-tag" data-game={gameKeyOf(g)}>
                {g}
              </span>
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
                      : ""}
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
            {[...new Set(e.source_urls)].filter(safeUrl).map((s, i) => (
              <React.Fragment key={s}>
                {link(s, `Source ${i + 1}`)}
              </React.Fragment>
            ))}
          </div>
          {e.instagram_followers !== null && (
            <p>Instagram followers: {e.instagram_followers.toLocaleString()}</p>
          )}
          {e.date_status === "confirmed" && ranges(e).length > 0 && (
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
