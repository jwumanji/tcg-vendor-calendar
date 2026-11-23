export function FirstRunTip({ search, dismiss }: { search: () => void; dismiss: () => void }) {
  return (
    <aside className="first-run-tip" aria-label="Planning quick start">
      <p>Mark events <strong>Going</strong> to build your shortlist.</p>
      <div>
        <button className="button" onClick={search}>Find events</button>
        <button className="text-button" onClick={dismiss}>Got it</button>
      </div>
    </aside>
  );
}
