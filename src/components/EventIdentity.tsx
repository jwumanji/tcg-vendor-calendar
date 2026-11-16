import type { Event } from "../model";
export function Logo({ e }: { e: Event }) {
  return e.logo ? (
    <img
      className="logo"
      src={import.meta.env.BASE_URL + e.logo}
      alt=""
      loading="lazy"
    />
  ) : (
    <span className="logo initials">
      {e.name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
export function Status({ e }: { e: Event }) {
  return (
    <span className={"badge " + e.date_status}>
      {e.date_status === "confirmed"
        ? "● Confirmed"
        : e.date_status === "estimated"
          ? "◷ Estimated"
          : "◇ TBA"}
    </span>
  );
}
