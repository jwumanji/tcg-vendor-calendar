export function FirstRunTip({ dismiss }: { dismiss: () => void }) {
  return (
    <aside className="first-run-tip" aria-label="Planning quick start">
      <ul>
        <li><strong>Score</strong> is how well an event fits you.</li>
        <li><strong>Going</strong> is your shortlist.</li>
        <li><strong>Stage</strong> tracks your organiser progress.</li>
      </ul>
      <button className="button" onClick={dismiss}>Got it</button>
    </aside>
  );
}
