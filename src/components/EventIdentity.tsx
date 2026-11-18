import { StickyNote } from "lucide-react";
import { flag, rarity, type Rarity } from "../utils";
import type { Event } from "../model";
export function Logo({ e }: { e: Event }) {
  return e.logo ? (
    <img
      className="logo"
      src={import.meta.env.BASE_URL + e.logo}
      alt=""
      loading="lazy"
      width={96}
      height={96}
    />
  ) : (
    <span className="logo initials">
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

export function CountryFlag({ code }: { code: string | null }) {
  return (
    <span>
      <span aria-hidden="true">{flag(code)}</span>
      {code && ` ${code}`}
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
