"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PortalError,
  fetchSession,
  isUnauthorized,
  logout,
  type PortalSession,
} from "@/lib/portal-api";

export const PORTAL_LOGIN_PATH = "/portal/prijava";
export const PORTAL_PATH = "/portal";

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
