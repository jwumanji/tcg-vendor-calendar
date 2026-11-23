import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function ListReminder({ id, title, summary, expanded = true, toggle, icon, children }: {
  id: string;
  title: string;
  summary: string;
  expanded?: boolean;
  toggle?: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={id} aria-label={title}>
      <h3 id={id + "-title"}>
        {toggle ? (
          <button className="reminder-summary" aria-expanded={expanded} aria-controls={id + "-content"} onClick={toggle}>
            {icon}
            <span className="reminder-title">{title}</span>
            <span className="reminder-count">{summary}</span>
            <ChevronDown className="reminder-chevron" size={16} aria-hidden="true" />
          </button>
        ) : <>{icon} {title}</>}
      </h3>
      <div id={id + "-content"} className="reminder-content" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
