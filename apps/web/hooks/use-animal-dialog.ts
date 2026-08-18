"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  commitSearch,
  getSearchSnapshot,
  getServerSearchSnapshot,
  subscribeToSearch,
} from "@/lib/location-search";

// zival syncs the open animal dialog to the URL, so a card click is
// shareable and the back button closes it. Reuses the same store as filters:
// server snapshot is "", so there is no hydration mismatch under static
// export, and history writes notify subscribers through commitSearch.
export function useAnimalDialog() {
  const search = useSyncExternalStore(
    subscribeToSearch,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const openId = useMemo(
    () => new URLSearchParams(search).get("zival"),
    [search],
  );

  const open = useCallback((id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("zival", id);
    commitSearch(params.toString(), "push", { zival: true });
  }, []);

  // Stepping to the next animal is not a new place to come back to, so it
  // replaces the entry rather than stacking one per animal. Replacing keeps
  // the entry's state, so back still closes the dialog in one step.
  const swap = useCallback((id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("zival", id);
    commitSearch(params.toString(), "replace");
  }, []);

  // Pushed opens get a real history entry so the back button (and this
  // close button) can pop it; deep links have nothing to pop back to, so
  // they strip the param in place instead.
  const close = useCallback(() => {
    if (window.history.state?.zival) {
      history.back();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("zival");
    commitSearch(params.toString(), "replace");
  }, []);

  return { openId, open, swap, close };
}
