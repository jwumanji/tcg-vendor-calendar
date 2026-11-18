import { useState, type CSSProperties } from "react";
import { Modal } from "./Modal";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
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
  const [draft, setDraft] = useState(weights);
  const apply = (next: Weights) => {
    setDraft(next);
    change(normalizeWeights(next));
  };
  return (
    <Modal
      title={
        <>
          <SlidersHorizontal size={21} />
          Score settings
        </>
      }
      titleId="settings-title"
      closeLabel="Close score settings"
      close={close}
    >
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
    </Modal>
  );
}
