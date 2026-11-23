import type { ScoreResult } from "../scoring";
import type { Entries } from "../storage";
import { TriangleAlert, StickyNote } from "lucide-react";
import { flagFile, gameKey, games, placeLabel } from "../utils";
import type { Event } from "../model";
import { useState } from "react";
import { GeneratedCover } from "./GeneratedCover";
import { EventImage } from "./EventImage";
import type { LogoSize } from "../eventImage";

export function Logo({ e, size = "md" }: { e: Event; size?: LogoSize }) {
  const cls = "logo" + (size === "md" ? "" : " logo-" + size);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={cls} aria-hidden="true">
      {e.logo && e.logo !== failed ? (
        <EventImage
          key={e.logo}
          path={e.logo}
          hint={e.logo_kind}
          size={size}
          eager={size === "detail"}
          onError={() => setFailed(e.logo)}
        />
      ) : (
        <GeneratedCover
          e={e}
          compact={size === "row" || size === "md"}
          flag={e.country_code && <CountryFlag code={e.country_code} />}
        />
      )}
    </span>
  );
}
export function ScheduleBadge({ e }: { e: Event }) {
  if (!e.event_status) return null;
  return <span className={"badge " + e.event_status}>{e.event_status === "cancelled" ? "Cancelled" : "Postponed"}</span>;
}
export function Status({ e }: { e: Event }) {
  if (e.event_status) return <ScheduleBadge e={e} />;
  return (
    <span className={"badge " + e.date_status}>
      {e.date_status === "confirmed"
        ? "● Confirmed"
        : e.date_status === "estimated"
          ? "◷ Estimated"
          : "◇ Dates not announced"}
    </span>
  );
}

export function GameTags({ event }: { event: Event }) {
  const titles = games(event);
  const more = titles.slice(3);
  return (
    <>
      {titles.slice(0, 3).map((game) => (
        <span key={game} className="game-tag" data-game={gameKey(game)} title={game}>
          <span>{game}</span>
        </span>
      ))}
      {more.length > 0 && <span className="game-tag-more" title={more.join(", ")}>+{more.length}</span>}
    </>
  );
}

/**
 * Flag as a self-hosted Twemoji SVG. Windows has no flag emoji font (Chrome
 * there shows the letters "SG"), so the image is used on every platform.
 */
export function CountryFlag({ code }: { code: string | null }) {
  const file = flagFile(code);
  return file ? (
    <img
      className="flag-img"
      src={import.meta.env.BASE_URL + "flags/" + file}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="flag-img flag-none" aria-hidden="true">
      ◎
    </span>
  );
}
/** "🇸🇬 Singapore": flag plus place text. The country code is never printed. */
export function Place({
  e,
  countryOnly = false,
}: {
  e: Pick<Event, "city" | "country" | "country_code">;
  countryOnly?: boolean;
}) {
  return (
    <span className="place">
      <CountryFlag code={e.country ? e.country_code : null} />
      <span>{placeLabel(e, countryOnly)}</span>
    </span>
  );
}

export function ClashCue({
  score,
  entries,
}: {
  score: ScoreResult;
  entries: Entries;
}) {
  const names = score.clashes
    .filter((c) => entries[c.id]?.going)
    .map((c) => c.name);
  if (!names.length) return null;
  const label = "Clashes with " + names.join(", ");
  return (
    <span className="clash-cue" role="img" aria-label={label} title={label}>
      <TriangleAlert size={14} aria-hidden="true" />
    </span>
  );
}

/** "Has notes" indicator: icon + text (never an emoji or colour alone). */
export function NoteTag({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="Has notes"
      className={`note-tag${compact ? " note-tag-compact" : ""}`}
    >
      <StickyNote size={compact ? 13 : 14} aria-hidden="true" />
      <span className={compact ? "sr-only" : undefined}>Has notes</span>
    </span>
  );
}
