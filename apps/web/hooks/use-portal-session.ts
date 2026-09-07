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

// What the guard tells the login page when it sends a visitor back. The two
// halves are separate so the page reads the query with the same words the
// guard wrote it with.
export const PORTAL_ERROR_PARAM = "napaka";
export const PORTAL_ERROR_NO_SESSION = "seja";
export const PORTAL_LOGIN_NO_SESSION_PATH = `${PORTAL_LOGIN_PATH}?${PORTAL_ERROR_PARAM}=${PORTAL_ERROR_NO_SESSION}`;

/**
 * A verification that worked, noted for the page it hands over to.
 *
 * The session lives in a cookie the API sets. A browser that keeps no cookie
 * for the API lets the exchange succeed and then answers /portal with a 401,
 * and the login link is single use, so a silent bounce back to the login page
 * leaves the shelter with a burnt link and no idea why. The note survives that
 * one hop and nothing more.
 */
const VERIFIED_KEY = "portal:verified";

/** Called on the way to the workspace, before the page is replaced. */
export function markVerified(): void {
  try {
    window.sessionStorage.setItem(VERIFIED_KEY, "1");
  } catch {
    // A browser that stores nothing throws here. The redirect still works;
    // only the reason for it is lost.
  }
}

/** Reads the note and clears it, so it explains one bounce and no later one. */
export function takeVerified(): boolean {
  try {
    const noted = window.sessionStorage.getItem(VERIFIED_KEY) === "1";
    window.sessionStorage.removeItem(VERIFIED_KEY);
    return noted;
  } catch {
    return false;
  }
}

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

/**
 * The same page, opened on a listing a manual shelter has not written yet.
 *
 * A listing that exists is an animal like any other and travels through
 * portalAnimalPath: its uuid is the id. One that does not has no id to name,
 * so the address says so instead, and the page opens an empty form.
 */
export function portalNewListingPath(shelter: string): string {
  const query = new URLSearchParams({ zavetisce: shelter, nova: "1" });
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
