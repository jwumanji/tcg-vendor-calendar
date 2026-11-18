import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CountryFlag } from "./EventIdentity";
import type { CountryOption } from "../utils";

/** Multi-select country dropdown with flags and event counts. */
export function CountryFilter({
  options,
  selected,
  change,
}: {
  options: CountryOption[];
  selected: string[];
  change: (countries: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (ev: PointerEvent) => {
      if (!root.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div
      className="country-filter"
      ref={root}
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && open) {
          ev.stopPropagation();
          setOpen(false);
          root.current?.querySelector<HTMLElement>("button")?.focus();
        }
      }}
    >
      <button
        aria-expanded={open}
        aria-controls="country-filter-panel"
        aria-pressed={selected.length > 0}
        onClick={() => setOpen(!open)}
      >
        Countries
        {selected.length > 0 && <span className="count">{selected.length}</span>}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id="country-filter-panel"
          className="country-panel"
          role="group"
          aria-label="Filter by country"
        >
          {options.map((o) => (
            <label key={o.name}>
              <input
                type="checkbox"
                checked={selected.includes(o.name)}
                onChange={() =>
                  change(
                    selected.includes(o.name)
                      ? selected.filter((c) => c !== o.name)
                      : [...selected, o.name],
                  )
                }
              />
              <CountryFlag code={o.code} />
              <span className="country-name">{o.name}</span>
              <span className="country-count">{o.count}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button className="country-clear" onClick={() => change([])}>
              Clear countries
            </button>
          )}
        </div>
      )}
    </div>
  );
}
