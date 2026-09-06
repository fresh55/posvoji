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

/**
 * Where a shelter sent to the login page was going, so the login can take
 * them back there rather than to the list. sessionStorage, so it lives as
 * long as the tab and no longer, and a key of its own so clearing the drafts
 * leaves it alone.
 */
export const PORTAL_RETURN_KEY = "posvoji.portal.return";

/**
 * Whether `path` is an address inside the portal that a login may send the
 * browser to. Same-origin by construction: it starts with /portal, so it can
 * be neither an absolute URL nor a protocol-relative one, and the login page
 * itself is out, or a login could bounce straight back to a login.
 */
export function isPortalReturnPath(path: string): boolean {
  if (/[\s\\]/.test(path)) return false;
  if (
    path === PORTAL_LOGIN_PATH ||
    path.startsWith(`${PORTAL_LOGIN_PATH}?`) ||
    path.startsWith(`${PORTAL_LOGIN_PATH}/`)
  ) {
    return false;
  }
  return (
    path === PORTAL_PATH ||
    path.startsWith(`${PORTAL_PATH}/`) ||
    path.startsWith(`${PORTAL_PATH}?`)
  );
}

/** Keeps the page the browser is on, for the login to come back to. */
export function rememberPortalReturn(): void {
  const path = window.location.pathname + window.location.search;
  if (!isPortalReturnPath(path)) return;
  try {
    window.sessionStorage.setItem(PORTAL_RETURN_KEY, path);
  } catch {
    // Storage blocked. The shelter lands on the list instead, as before.
  }
}

/**
 * The remembered page, taken so it is used once, or the list when there is
 * none or what is there is not a portal address.
 */
export function takePortalReturn(): string {
  try {
    const stored = window.sessionStorage.getItem(PORTAL_RETURN_KEY);
    window.sessionStorage.removeItem(PORTAL_RETURN_KEY);
    if (stored && isPortalReturnPath(stored)) return stored;
  } catch {
    // Storage blocked. Nothing could have been remembered either.
  }
  return PORTAL_PATH;
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
