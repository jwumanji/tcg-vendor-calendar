import { validDate } from "./data";
import type { Event, Outreach } from "./model";
import { upcoming } from "./utils";

export const followUpDays = 5;
export const followUpLabels = {
  reply: "Your reply is due",
  nudge: "Organizer nudge due",
};
const dayMs = 86_400_000;

export function followUpKind(outreach: Outreach): "nudge" | "reply" | undefined {
  if (outreach.status === "contacted") return "nudge";
  if ((outreach.status === "replied" || outreach.status === "quoted") &&
      outreach.next_action === "reply_to_organizer") return "reply";
}

export function followUp(outreach: Outreach) {
  const kind = followUpKind(outreach);
  if (!kind) return;

  const { contacted_at, response_at, follow_up_due_at } = outreach;
  let due = follow_up_due_at ?? null;
  if (!due && kind === "reply") due = response_at;
  if (!due && kind === "nudge" && validDate(contacted_at)) {
    const date = new Date(Date.parse(contacted_at) + followUpDays * dayMs).toISOString().slice(0, 10);
    if (validDate(date)) due = date;
  }
  if (due) return { kind, due };
}

export function dueOutreach(events: Event[], today: string) {
  return events.flatMap((event) => {
    if (!event.outreach || event.event_status === "cancelled" || !upcoming(event, today)) return [];
    const follow = followUp(event.outreach);
    return follow && follow.due <= today ? [{ event, outreach: event.outreach, ...follow }] : [];
  }).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "reply" ? -1 : 1;
    return a.due.localeCompare(b.due) || a.event.name.localeCompare(b.event.name);
  });
}
