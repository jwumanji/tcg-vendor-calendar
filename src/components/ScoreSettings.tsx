import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  DEFAULT_WEIGHTS,
  FACTOR_META,
  TIER_LABELS,
  TIER_THRESHOLDS,
  normalizeWeights,
  type FactorKey,
  type Weights,
} from "../scoring";

export function ScoreSettings({
  weights,
  change,
  close,
}: {
  weights: Weights;
  change: (weights: Weights) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(weights);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      trigger?.focus({ preventScroll: true });
    };
  }, []);
  const apply = (next: Weights) => {
    setDraft(next);
    change(normalizeWeights(next));
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby="settings-title"
      className="score-settings"
      onCancel={(ev) => {
        ev.preventDefault();
        close();
      }}
      onKeyDown={(ev) => {
        if (ev.key !== "Tab") return;
        const controls =
          ev.currentTarget.querySelectorAll<HTMLElement>("button,input");
        const first = controls[0],
          last = controls[controls.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        }
        if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="settings-head">
        <h2 id="settings-title">
          <SlidersHorizontal size={21} />
          Score settings
        </h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close score settings"
        >
          <X size={20} />
        </button>
      </div>
      <p>
        Adjust the relative weight of each factor. Effective percentages add up
        to 100% and update your priorities immediately.
      </p>
      <div className="weight-list">
        {(Object.keys(FACTOR_META) as FactorKey[]).map((key) => (
          <div className="weight-row" key={key}>
            <div>
              <label htmlFor={`weight-${key}`}>{FACTOR_META[key].label}</label>
              <small id={`weight-help-${key}`}>
                {FACTOR_META[key].description}
              </small>
            </div>
            <input
              type="range"
              id={`weight-${key}`}
              min={0}
              max={100}
              value={draft[key]}
              aria-describedby={`weight-help-${key}`}
              aria-valuetext={`${draft[key]} relative weight, ${weights[key]}% effective`}
              style={{ "--fill": draft[key] + "%" } as CSSProperties}
              onChange={(ev) =>
                apply({ ...draft, [key]: Number(ev.target.value) })
              }
            />
            <output htmlFor={`weight-${key}`}>{weights[key]}%</output>
          </div>
        ))}
      </div>
      {Object.values(draft).every((value) => value === 0) && (
        <p>All relative weights are zero. Default percentages apply.</p>
      )}
      <p className="tier-thresholds">
        {TIER_LABELS.must} {TIER_THRESHOLDS.must}+ · {TIER_LABELS.strong}{" "}
        {TIER_THRESHOLDS.strong}+ · {TIER_LABELS.maybe} {TIER_THRESHOLDS.maybe}+
        · {TIER_LABELS.skip} below {TIER_THRESHOLDS.maybe}
      </p>
      <div className="settings-actions">
        <button
          className="button"
          onClick={() => apply({ ...DEFAULT_WEIGHTS })}
        >
          <RotateCcw size={15} />
          Reset to defaults
        </button>
        <button className="button primary" onClick={close}>
          Done
        </button>
      </div>
    </dialog>
  );
}
