import { Pencil } from "lucide-react";
import { TIER_LABELS, type ScoreResult } from "../scoring";

export function PriorityChip({ result }: { result: ScoreResult }) {
  const label = TIER_LABELS[result.tier];
  const description = `Score ${result.score} of 100, ${label}, ${result.confidence} confidence${result.overridden ? ", manually overridden" : ""}`;
  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className={`priority-chip priority-${result.tier}`}
      data-confidence={result.confidence}
    >
      <span className="chip-label">Score</span>
      <b>
        {result.confidence === "low" && "~"}
        {result.score}
      </b>
      {label}
      {result.overridden && <Pencil size={11} aria-hidden="true" />}
    </span>
  );
}
