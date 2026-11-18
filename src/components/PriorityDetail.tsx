import { useState } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { explainScore, type ScoreResult } from "../scoring";
import { eventPath } from "../route";
import { PriorityChip } from "./PriorityChip";

export function PriorityDetail({
  result,
  setOverride,
  openClash,
}: {
  result: ScoreResult;
  setOverride: (value: number | null) => void;
  openClash: (id: string) => void;
}) {
  const [draft, setDraft] = useState(String(result.score));
  const [copied, setCopied] = useState("");
  const evidence = result.factors.filter((f) => f.key !== "clash");
  const contributing = evidence.filter((f) => f.weight > 0);
  const count = (basis: string) =>
    contributing.filter((f) => f.basis === basis).length;
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(Number(draft)) &&
    Number(draft) >= 0 &&
    Number(draft) <= 100;
  return (
    <section className="priority-detail" aria-labelledby="priority-title">
      <h2 id="priority-title">Priority score</h2>
      <div className="score-summary">
        <PriorityChip result={result} />
        <div>
          <strong>{result.confidence} confidence</strong>
          <small>
            {result.confidencePct}% of weight backed by real factors
          </small>
        </div>
      </div>
      <p>
        Based on {count("real")} real signals, {count("estimated")} estimated
        and {count("missing")} missing across {contributing.length} weighted
        factors.
      </p>
      <div className="factor-list">
        {evidence.map((f, i) => (
          <details key={f.key} open={i === 0 ? true : undefined}>
            <summary>
              <span className="factor-name">
                {f.label}{" "}
                <small className={`basis basis-${f.basis}`}>{f.basis}</small>
              </span>
              <span className="factor-points">
                {f.points.toFixed(1)} / {f.weight}
              </span>
              <ChevronDown size={14} />
              <span className="factor-track" aria-hidden="true">
                <i style={{ width: (f.weight ? f.value * 100 : 0) + "%" }} />
              </span>
            </summary>
            <ul>
              {f.signals.map((signal, i) => (
                <li key={i}>{signal}</li>
              ))}
            </ul>
            <p>{f.note}</p>
          </details>
        ))}
      </div>
      {result.clashes.length > 0 && (
        <div className="clash-note">
          <strong>
            Timing clash ·{" "}
            {result.factors.find((f) => f.key === "clash")?.points} points
          </strong>
          <p>
            Higher calculated scores on overlapping dates or the same weekend
          </p>
          <ul>
            {result.clashes.map((c) => (
              <li key={c.id}>
                <a
                  href={eventPath(c.id)}
                  onClick={(ev) => {
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
                    ev.preventDefault();
                    openClash(c.id);
                  }}
                >
                  {c.name} · {c.score}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="override-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valid) setOverride(Number(draft));
        }}
      >
        <label htmlFor="my-score">Your score</label>
        <span>
          Calculated <b>{result.computedScore}</b> · Yours{" "}
          <b>{result.overridden ? result.score : "—"}</b>
        </span>
        <div>
          <input
            type="number"
            id="my-score"
            min={0}
            max={100}
            step={1}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            required
          />
          <button className="button" disabled={!valid}>
            Use my score
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!result.overridden}
            onClick={() => {
              setOverride(null);
              setDraft(String(result.computedScore));
            }}
          >
            Reset to calculated
          </button>
        </div>
      </form>
      <button
        className="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(explainScore(result));
            setCopied("Explanation copied");
          } catch {
            setCopied(
              "Clipboard unavailable. Select and copy the explanation below.",
            );
          }
        }}
      >
        <Copy size={15} />
        Copy explanation
      </button>
      <span className="copy-status" role="status">
        {copied}
      </span>
      {copied.startsWith("Clipboard unavailable") && (
        <textarea
          readOnly
          aria-label="Score explanation"
          value={explainScore(result)}
          onFocus={(ev) => ev.target.select()}
        />
      )}
    </section>
  );
}
