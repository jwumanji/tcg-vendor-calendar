import type { CSSProperties, ReactNode } from "react";
import {
  Anchor,
  Bot,
  CircuitBoard,
  Diamond,
  Eye,
  Flame,
  Layers,
  Shield,
  Sparkles,
  Star,
  Swords,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { coverPalette, coverNameSize } from "../cover";
import type { Event } from "../model";
import { games } from "../utils";

const glyphs: Record<string, LucideIcon> = {
  Pokémon: Zap,
  "One Piece": Anchor,
  MTG: Flame,
  "Yu-Gi-Oh!": Eye,
  Lorcana: WandSparkles,
  Digimon: CircuitBoard,
  "Dragon Ball": Star,
  "Union Arena": Layers,
  Vanguard: Shield,
  "Flesh and Blood": Swords,
  "Weiss Schwarz": Diamond,
  Gundam: Bot,
};

function Motif({ variant }: { variant: number }) {
  const steps = [0, 1, 2, 3, 4, 5, 6];
  return (
    <svg
      className="cover-motif"
      viewBox="0 0 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.85"
      aria-hidden="true"
    >
      {variant === 0 &&
        steps.map((i) => (
          <rect
            key={i}
            x="42"
            y="23"
            width="74"
            height="108"
            rx="7"
            transform={`rotate(${i * 9 - 30} 70 110)`}
          />
        ))}
      {variant === 1 &&
        steps.map((i) => (
          <path
            key={i}
            d="M80 7 145 80 80 153 15 80Z"
            transform={`rotate(${i * 7} 80 80)`}
          />
        ))}
      {variant === 2 &&
        steps.map((i) => (
          <circle key={i} cx={96 - i * 3} cy={65 + i} r={22 + i * 9} />
        ))}
      {variant === 3 &&
        steps.map((i) => (
          <path
            key={i}
            d="m-30 100 65-65q10-10 20 0l40 40q10 10 20 0l65-65"
            transform={`translate(0 ${i * 8})`}
          />
        ))}
    </svg>
  );
}

export function GeneratedCover({
  e,
  compact,
  flag,
}: {
  e: Event;
  compact: boolean;
  flag: ReactNode;
}) {
  const { hue, saturation, lightness, angle, motif } = coverPalette(e.id);
  const style = {
    "--cover-hue": hue,
    "--cover-lit": `hsl(${hue} ${saturation}% ${lightness}%)`,
    "--cover-angle": `${angle}deg`,
    "--cover-name-size": `${coverNameSize(e.name)}cqw`,
  } as CSSProperties;
  const initials = e.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join("");
  return (
    <span className="generated-cover" style={style} data-compact={compact}>
      <Motif variant={motif} />
      <span className="cover-marks">
        <span className="cover-games">
          {games(e)
            .slice(0, compact ? 1 : 3)
            .map((game) => {
              const Glyph = glyphs[game] || Sparkles;
              return <Glyph key={game} />;
            })}
        </span>
        <span className="cover-flag">{flag}</span>
      </span>
      <span className={compact ? "cover-monogram" : "cover-name"}>
        {compact ? initials : e.name}
      </span>
    </span>
  );
}
