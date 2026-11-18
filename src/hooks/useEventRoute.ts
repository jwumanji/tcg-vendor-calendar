import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Filters } from "../model";
import { eventPath, parseRoute } from "../route";

type ListContext = {
  view: string;
  month: string;
  filterOpen: boolean;
  groupByStage: boolean;
  sessionFilters: Pick<Filters, "search" | "from" | "to">;
};

function currentRoute() {
  return {
    ...parseRoute(window.location.pathname),
    occurrence: typeof history.state?.occurrence === "string" ? history.state.occurrence : undefined,
  };
}

export function useEventRoute() {
  const [route, setRoute] = useState(currentRoute);
  // A refreshed event gets a new React tree. Seed its list from the history entry.
  const [listContext] = useState<ListContext | undefined>(() =>
    route.page === "event" && history.state?.fromPlanner ? history.state.listContext : undefined,
  );
  const origin = useRef<{ element: HTMLElement | null; y: number } | null>(null);
  const previousPage = useRef(route.page);

  function rememberList() {
    origin.current = {
      element: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      y: window.scrollY,
    };
  }

  const openEvent = useCallback((id: string, occurrence?: string, list?: ListContext) => {
    if (parseRoute(location.pathname).page === "events") {
      rememberList();
      history.replaceState({ ...history.state, eventsScrollY: window.scrollY }, "");
    }
    history.pushState({
      fromPlanner: true,
      occurrence,
      listContext: list ?? history.state?.listContext,
    }, "", eventPath(id));
    setRoute(currentRoute());
  }, []);

  const back = useCallback(() => {
    if (history.state?.fromPlanner) {
      history.back();
    } else {
      history.replaceState(null, "", import.meta.env.BASE_URL);
      setRoute(currentRoute());
    }
  }, []);

  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    function onPop() {
      const next = currentRoute();
      if (previousPage.current === "events" && next.page === "event") rememberList();
      setRoute(next);
    }
    window.addEventListener("popstate", onPop);
    return () => {
      history.scrollRestoration = previous;
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useLayoutEffect(() => {
    if (route.page === "event") {
      window.scrollTo({ top: 0, behavior: "instant" });
      function onKey(ev: KeyboardEvent) {
        if (ev.key === "Escape" && !ev.defaultPrevented && !ev.repeat) {
          ev.preventDefault();
          back();
        }
      }
      window.addEventListener("keydown", onKey);
      previousPage.current = "event";
      return () => window.removeEventListener("keydown", onKey);
    }
    if (previousPage.current === "event") {
      const element = origin.current?.element;
      const target = element?.isConnected && element !== document.body
        ? element : document.getElementById("main");
      target?.focus({ preventScroll: true });
      const top = origin.current?.y ?? history.state?.eventsScrollY ?? 0;
      // The closing page can flush a note and change a row's height during this commit.
      const frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
      previousPage.current = "events";
      return () => cancelAnimationFrame(frame);
    }
  }, [route, back]);

  return { route, openEvent, back, listContext };
}
