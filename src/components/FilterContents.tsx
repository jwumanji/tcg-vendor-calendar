import { useRef, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import type { Filters } from "../model";
import { stages } from "../storage";
import { gameRules, type CountryOption } from "../utils";
import { CountryFlag } from "./EventIdentity";

export const statusLabels: Record<string, string> = {
  "": "All statuses",
  confirmed: "Confirmed",
  estimated: "Estimated",
  tba: "Dates not announced",
  cancelled: "Cancelled",
  postponed: "Postponed",
};

export function FilterContents({ countries, filters, set, reset, activeCount,
  showPassed, setShowPassed, matchCount, compact, close }: {
  countries: CountryOption[];
  filters: Filters;
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  reset: () => void;
  activeCount: number;
  showPassed: boolean;
  setShowPassed: (value: boolean) => void;
  matchCount: number;
  compact: boolean;
  close: () => void;
}) {
  const showResults = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="filter-grid">
        <details open>
          <summary>Countries</summary>
          <div className="check-scroll">
            {countries.map((o) => (
              <label key={o.name}>
                <input
                  type="checkbox"
                  checked={filters.countries.includes(o.name)}
                  onChange={() =>
                    set(
                      "countries",
                      filters.countries.includes(o.name)
                        ? filters.countries.filter((x) => x !== o.name)
                        : [...filters.countries, o.name],
                    )
                  }
                />
                <CountryFlag code={o.code} /> {o.name} ({o.count})
              </label>
            ))}
          </div>
        </details>
        <details open>
          <summary>Games</summary>
          <div className="check-scroll">
            {[...gameRules.map(([g]) => g), "Other"].map((g) => (
              <label key={g}>
                <input
                  type="checkbox"
                  checked={filters.games.includes(g)}
                  onChange={() =>
                    set(
                      "games",
                      filters.games.includes(g)
                        ? filters.games.filter((x) => x !== g)
                        : [...filters.games, g],
                    )
                  }
                />
                {g}
              </label>
            ))}
          </div>
        </details>
        <details open={!compact}>
          <summary>Market, size and status</summary>
          <div className="filter-fields">
            <label>
              Key market
              <select
                value={filters.priority}
                onChange={(e) => set("priority", e.target.value)}
              >
                <option value="any">All markets</option>
                <option value="top">Hong Kong & Singapore</option>
                <option value="high">Malaysia, Hong Kong & Singapore</option>
              </select>
            </label>
            <label>
              Show size
              <select
                value={filters.size}
                onChange={(e) => set("size", e.target.value)}
              >
                <option value="">All sizes</option>
                {["S", "M", "L", "XL"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <details open={!compact}>
          <summary>Dates</summary>
          <div className="filter-fields">
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(e) => set("from", e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(e) => set("to", e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={filters.tba}
                onChange={(e) => set("tba", e.target.checked)}
              />{" "}
              Include events with dates not announced
            </label>
          </div>
        </details>
        <details open={!compact}>
          <summary>Score and stage</summary>
          <div className="filter-fields">
            <label className="check">
              <input
                type="checkbox"
                checked={showPassed}
                onChange={(e) => setShowPassed(e.target.checked)}
              />
              Show passed / too expensive
            </label>
            <label>
              Priority
              <select
                value={filters.minTier}
                onChange={(ev) =>
                  set(
                    "minTier",
                    ev.target.value as typeof filters.minTier,
                  )
                }
              >
                <option value="any">Any</option>
                <option value="strong">Strong+</option>
                <option value="must">Must-do only</option>
              </select>
            </label>
            <label>
              Minimum fit score · {filters.score}
              <input
                type="range"
                min="0"
                max="100"
                value={filters.score}
                style={{ "--fill": `${filters.score}%` } as CSSProperties}
                onChange={(e) => set("score", +e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Pipeline stages</legend>
              {stages.map((stage) => (
                <label className="check" key={stage}>
                  <input
                    type="checkbox"
                    checked={filters.stages.includes(stage)}
                    onChange={() =>
                      set(
                        "stages",
                        filters.stages.includes(stage)
                          ? filters.stages.filter((s) => s !== stage)
                          : [...filters.stages, stage],
                      )
                    }
                  />
                  {stage}
                </label>
              ))}
            </fieldset>
          </div>
        </details>
      </div>
      <div className="filter-foot">
        <button
          className="button"
          disabled={activeCount === 0}
          onClick={() => {
            reset();
            showResults.current?.focus();
          }}
        >
          <RotateCcw size={16} aria-hidden="true" /> Reset filters
        </button>
        <button
          className="button primary"
          ref={showResults}
          onClick={close}
        >
          Show {matchCount}{" "}
          {matchCount === 1 ? "event" : "events"}
        </button>
      </div>
    </>
  );
}
