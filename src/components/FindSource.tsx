import { ArrowUpRight } from "lucide-react";
import type { Event } from "../model";
import { safeUrl } from "../utils";

export function FindBadges({ e }: { e: Event }) {
  if (!e.is_new_find) return null;
  return (
    <>
      <span className="source-chip new-find">New find</span>
      <span className="source-chip">{e.source?.name || "Unknown source"}</span>
    </>
  );
}
export function SourceChip({ e, link = true }: { e: Event; link?: boolean }) {
  if (!e.is_new_find) return <span className="source-chip">Scanner</span>;
  const label = "New find · " + (e.source?.name || "Unknown source");
  return link && e.source && safeUrl(e.source.url) ? (
    <a
      className="source-chip new-find"
      href={e.source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
    >
      {label}
      <ArrowUpRight size={12} aria-hidden="true" />
    </a>
  ) : (
    <span className="source-chip new-find">{label}</span>
  );
}

export function FindDetails({ e }: { e: Event }) {
  const source = e.source;
  if (!e.is_new_find) return null;
  const discovered = Date.parse(source?.discovered_at || "");
  const percent = (n: number | null | undefined) =>
    n == null ? "Unknown" : Math.round(n * 100) + "%";
  return (
    <section className="find-details" aria-label="Found by scanner">
      <h2>Found by scanner</h2>
      <SourceChip e={e} />
      <dl>
        <div className="detail-row">
          <dt>Discovered</dt>
          <dd>
            {Number.isFinite(discovered)
              ? new Date(discovered).toLocaleDateString("en-GB", {
                  dateStyle: "medium",
                })
              : "Unknown"}
          </dd>
        </div>
        <div className="detail-row">
          <dt>Source confidence</dt>
          <dd>{percent(source?.confidence)}</dd>
        </div>
        <div className="detail-row">
          <dt>Relevance</dt>
          <dd>{percent(source?.relevance)}</dd>
        </div>
      </dl>
      <p>{e.verification === "verified" ? "Verified" : "Unverified: check the organiser page before applying."}</p>
    </section>
  );
}
