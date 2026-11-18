import { StickyNote } from "lucide-react";
import { flagFile, placeLabel, rarity, type Rarity } from "../utils";
import type { Event } from "../model";
export type LogoSize = "md" | "row" | "xl" | "detail";
export function Logo({ e, size = "md" }: { e: Event; size?: LogoSize }) {
  const cls = "logo" + (size === "md" ? "" : " logo-" + size);
  return e.logo ? (
    <img
      className={cls}
      src={import.meta.env.BASE_URL + e.logo}
      alt=""
      loading="lazy"
      decoding="async"
      width={96}
      height={96}
    />
  ) : (
    <span className={cls + " initials"}>
      {e.name
        .split(" ")
        .slice(0, 2)
        .map((s) => [...s][0] || "")
        .join("")}
    </span>
  );
}
export function Status({ e }: { e: Event }) {
  return (
    <span className={"badge " + e.date_status}>
      {e.date_status === "confirmed"
        ? "● Confirmed"
        : e.date_status === "estimated"
          ? "◷ Estimated"
          : "◇ TBA"}
    </span>
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
      <CountryFlag code={e.country_code} />
      <span>{placeLabel(e, countryOnly)}</span>
    </span>
  );
}

const tierMark: Record<Rarity, string> = {
  common: "●",
  uncommon: "◆",
  rare: "★",
  ultra: "✦",
  secret: "❖",
};
/** Vendor score shown as a rarity "gem": numeric score + tier label + shape (never colour alone). */
export function ScoreGem({
  score,
  large = false,
}: {
  score: number;
  large?: boolean;
}) {
  const r = rarity(score);
  return (
    <span
      title={`Scanner score ${score} of 100, ${r.label}`}
      className={`gem gem-${r.tier}${large ? " gem-lg" : ""}`}
    >
      <span className="gem-num">
        {score}
        <small>/100</small>
      </span>
      <span className="gem-tier">
        <span aria-hidden="true">{tierMark[r.tier]}</span> {r.label}
      </span>
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
