"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PortalError,
  fetchSession,
  isUnauthorized,
  logout,
  type PortalField,
  type PortalSession,
} from "@/lib/portal-api";

export const PORTAL_LOGIN_PATH = "/portal/prijava";
export const PORTAL_PATH = "/portal";
export const PORTAL_ANIMAL_PATH = "/portal/zival";

/**
 * The editor page for one animal.
 *
 * Both the shelter and the animal travel in the query rather than in the
 * path. The site is a static export, so a route with a dynamic segment would
 * need a page generated per animal at build time and the portal's records are
 * not in that build at all. And the shelter has to be named separately: a
 * crawled id carries its provider ("ljubljana:123") but a manual listing's is
 * a bare uuid, so the id alone does not say whose animal it is.
 */
export function portalAnimalPath(
  shelter: string,
  animalId: string,
  field?: PortalField | null,
): string {
  const query = new URLSearchParams({ zavetisce: shelter, id: animalId });
  // Only when the shelter is being sent to a named row, which is what the
  // card's "manjka za iskalnik" line does.
  if (field) query.set("polje", field);
  return `${PORTAL_ANIMAL_PATH}?${query}`;
}

export type PortalSessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; session: PortalSession }
  | { status: "error"; offline: boolean };

/**
 * The signed-in shelter account. "anonymous" is not an error: it is the
 * answer the guard turns into a redirect to the login page.
 */
export function usePortalSession(): {
  state: PortalSessionState;
  reload: () => void;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<PortalSessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    fetchSession().then(
      (session) => {
        if (live) setState({ status: "ready", session });
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) {
          setState({ status: "anonymous" });
          return;
        }
        setState({
          status: "error",
          offline: error instanceof PortalError && error.kind === "network",
        });
      },
    );

    return () => {
      live = false;
    };
  }, [attempt]);

  // Back to loading here rather than inside the effect, so the retry does not
  // set state during a render pass it did not cause.
  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  }, []);

  // A failed logout still has to send the shelter away from the workspace:
  // whatever the server said, the visitor asked to leave. replace(), so the
  // back button cannot return to a workspace with no session behind it.
  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      window.location.replace(PORTAL_LOGIN_PATH);
    }
  }, []);

  return { state, reload, signOut };
}
