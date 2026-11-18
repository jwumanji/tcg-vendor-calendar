import { GoingButton, type SetGoing } from "./GoingButton";
import { PriorityDetail } from "./PriorityDetail";
import { FindBadges, FindDetails } from "./FindSource";
import type { ScoreResult } from "../scoring";
import { flushSync } from "react-dom";
import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Instagram,
  LoaderCircle,
  Download,
} from "lucide-react";
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
import { Logo, Status, Place, ScoreGem } from "./EventIdentity";
import { StageBadge, StagePicker } from "./Pipeline";
import type { Entry, Stage } from "../storage";
export function Detail({
  e,
  occurrence,
  entry,
  setGoing,
  onStage,
  onNote,
  saved,
  score,
  setOverride,
  openClash,
  toast,
}: {
  e: Event;
  occurrence?: string;
  entry: Entry;
  setGoing: SetGoing;
  onStage: (s: Stage) => void;
  onNote: (s: string) => void;
  saved: boolean;
  score: ScoreResult;
  setOverride: (value: number | null) => void;
  openClash: (id: string) => void;
  toast: React.ReactNode;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  React.useLayoutEffect(() => title.current?.focus({ preventScroll: true }), [e.id]);
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
    const flushBeforeLeaving = () => flushSync(flush);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushBeforeLeaving();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushBeforeLeaving);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushBeforeLeaving);
      flush();
    };
  }, [flush]);
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
    <article className="event-layout" data-game={primaryGameKey(e)}>
      <div className="detail-body event-facts">
        <Logo e={e} size="detail" />
        <h1 ref={title} tabIndex={-1}>{e.name}</h1>
        <div className="detail-badges">
          <Status e={e} />
          <FindBadges e={e} />
          {e.priority_market && (
            <span className="badge priority">
              ✦ {e.priority_market_level ? `${e.priority_market_level} ` : ""}
              priority market
            </span>
          )}
        </div>
        <GoingButton e={e} going={entry.going} setGoing={setGoing} />
        <p className="detail-date">
          <CalendarDays size={18} />
          {occurrence || dateLabel(e)}
        </p>
        {e.date_note && <p className="note">{e.date_note}</p>}
        {e.date_status === "estimated" && (
          <p className="note">
            Estimated timing only. Confirm with the organizer before booking
            travel.
          </p>
        )}
        <p>
          <Place e={e} />
        </p>
        {e.venue && <p>{e.venue}</p>}
        <div className="game-pills">
          {e.games.map((g) => (
            <span key={g} className="game-tag" data-game={gameKeyOf(g)}>
              {g}
            </span>
          ))}
        </div>
      </div>
      <div className="detail-body event-information">
        <FindDetails e={e} />
        <PriorityDetail
          result={score}
          setOverride={setOverride}
          openClash={openClash}
        />
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
          <label htmlFor="event-note">Your notes</label>
          <textarea
            id="event-note"
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
          <small
            className="save-status"
            data-state={
              draft !== entry.note ? "saving" : saved ? "saved" : "unsaved"
            }
          >
            {draft !== entry.note ? (
              <LoaderCircle size={14} aria-hidden="true" />
            ) : saved ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <AlertTriangle size={14} aria-hidden="true" />
            )}
            <span>
              {draft !== entry.note
                ? "Saving…"
                : saved
                  ? "Saved on this device"
                  : "Not saved to this device — export a backup"}
              {entry.noteUpdatedAt &&
                ` · Last edited ${new Date(entry.noteUpdatedAt).toLocaleString()}`}
            </span>
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
              Scanner score
              <ScoreGem score={e.vendor_score} large />
            </span>
            <meter aria-label="Scanner score" min="0" max="100" value={e.vendor_score} />
          </div>
        )}
        {e.description && <p className="description">{e.description}</p>}
        <h2>The essentials</h2>
        <dl>
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
            <h2>All published occurrences</h2>
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
        <h2>Vendor information</h2>
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
        <h2>Follow the source</h2>
        <div className="source-links">
          {link(e.website, "Official website")}
          {link(e.tickets ?? null, "Tickets")}
          {link(e.instagram, "Instagram")}
          {[...new Set(e.source_urls)].filter(safeUrl).map((s, i) => (
            <React.Fragment key={s}>
              {link(s, `Source ${i + 1}`)}
            </React.Fragment>
          ))}
        </div>
        {e.instagram_followers !== null && (
          <p className="detail-stat">
            <Instagram size={16} aria-hidden="true" />
            Instagram followers: {e.instagram_followers.toLocaleString()}
          </p>
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
      {toast}
    </article>
  );
}
