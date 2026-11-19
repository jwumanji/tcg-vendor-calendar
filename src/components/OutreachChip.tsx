import type { Outreach, OutreachMethod, OutreachStatus } from "../model";

export const outreachStatusLabels: Record<OutreachStatus, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  replied: "Replied",
  quoted: "Quoted",
  declined: "Declined",
};

export const outreachMethodLabels: Record<OutreachMethod, string> = {
  email: "Email",
  form: "Form",
  instagram_dm: "Instagram DM",
  other: "Other",
};

export function OutreachChip({
  outreach,
  showUncontacted = false,
}: {
  outreach?: Outreach | null;
  showUncontacted?: boolean;
}) {
  const status = outreach?.status ?? "not_contacted";
  if (status === "not_contacted" && !showUncontacted) return null;
  const method = status !== "not_contacted" && outreach?.method
    ? outreachMethodLabels[outreach.method]
    : null;
  return (
    <span className="outreach-chip" data-status={status}>
      <span className="sr-only">Outreach: </span>
      {outreachStatusLabels[status]}{method && " · " + method}
    </span>
  );
}
