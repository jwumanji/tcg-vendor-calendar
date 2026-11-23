import { Bookmark, BookmarkCheck } from "lucide-react";

export type SetGoing = (ids: readonly string[], going: boolean) => void;

export function GoingButton({
  e,
  going,
  setGoing,
  compact = false,
}: {
  e: { id: string; name: string };
  going: boolean;
  setGoing: SetGoing;
  compact?: boolean;
}) {
  const Icon = going ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      className={compact ? "going-button compact" : "going-button"}
      aria-label={`Going: ${e.name}`}
      aria-pressed={going}
      title={`Going: ${e.name}`}
      onClick={(ev) => {
        ev.stopPropagation();
        setGoing([e.id], !going);
      }}
    >
      <span className="going-check" aria-hidden="true">
        <Icon size={19} strokeWidth={going ? 2.6 : 1.7} />
      </span>
      <span>Going</span>
    </button>
  );
}
