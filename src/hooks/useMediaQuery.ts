import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string) {
  const subscribe = useCallback((change: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [query]);
  const matches = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, matches, () => false);
}
