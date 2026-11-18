export type Route = { page: "events" } | { page: "event"; id: string | null };

export function eventPath(id: string) {
  return import.meta.env.BASE_URL + "event/" + encodeURIComponent(id);
}

export function parseRoute(pathname: string): Route {
  const prefix = import.meta.env.BASE_URL + "event/";
  if (!pathname.startsWith(prefix)) return { page: "events" };
  const segment = pathname.slice(prefix.length).replace(/\/$/, "");
  try {
    if (segment && !segment.includes("/"))
      return { page: "event", id: decodeURIComponent(segment) };
  } catch {
    // A malformed escape is still an event URL. Show the missing-event page.
  }
  return { page: "event", id: null };
}
