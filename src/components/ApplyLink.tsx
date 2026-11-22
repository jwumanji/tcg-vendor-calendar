export function ApplyLink({ action, name, compact = false }: {
  action: { href: string; label: string };
  name?: string;
  compact?: boolean;
}) {
  return (
    <a className={`button apply-cta${compact ? " compact" : ""}`}
      href={action.href} target="_blank" rel="noreferrer"
      aria-label={name ? `${action.label} for ${name}` : undefined}>
      {action.label}
    </a>
  );
}
