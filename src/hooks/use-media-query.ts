import { useSyncExternalStore } from "react"

// useSyncExternalStore, not useState+useEffect: this is exactly the "read
// from and subscribe to an external store" case it exists for (the
// external store here being the browser's own matchMedia API). Sidesteps
// both react-hooks/set-state-in-effect (there's no setState call to flag
// in the first place) and the SSR hydration-mismatch risk a lazy
// useState initializer would otherwise have introduced (server and the
// client's first paint both get getServerSnapshot's false; only after
// hydration does React re-check getSnapshot and correct it, same
// trade-off ui/sidebar.tsx's own ignored use-mobile.ts already accepts).
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}
