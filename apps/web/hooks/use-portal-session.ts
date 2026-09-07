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
 * One sessionStorage entry, with the guard every use of it needs: a browser
 * that stores nothing throws on each of these calls, and the portal carries on
 * as if the entry were simply empty.
 */
function slot(key: string) {
  return {
    write(value: string): void {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        // Storage blocked. Nothing is kept, and the caller has a landing to
        // fall back to.
      }
    },
    /** What is stored, left in place. */
    peek(): string | null {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    /** What is stored, cleared on the way out, so it is used once. */
    take(): string | null {
      try {
        const stored = window.sessionStorage.getItem(key);
        // Only when there is something to clear. take() runs on every load of
        // a page with a session behind it, and the entry is absent on all of
        // them, so an unconditional write is a storage round trip per load.
        if (stored !== null) window.sessionStorage.removeItem(key);
        return stored;
      } catch {
        return null;
      }
    },
  };
}

/**
 * A verification that worked, noted for the page it hands over to.
 *
 * The session lives in a cookie the API sets. A browser that keeps no cookie
 * for the API lets the exchange succeed and then answers /portal with a 401,
 * and the login link is single use, so a silent bounce back to the login page
 * leaves the shelter with a burnt link and no idea why. The note survives that
 * one hop and nothing more.
 */
export const PORTAL_VERIFIED_KEY = "portal:verified";

const verified = slot(PORTAL_VERIFIED_KEY);

/** Called on the way to the workspace, before the page is replaced. */
function markVerified(): void {
  verified.write("1");
}

/** Reads the note and clears it, so it explains one bounce and no later one. */
export function takeVerified(): boolean {
  return verified.take() === "1";
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

/**
 * Where a shelter sent to the login page was going, so the login can take
 * them back there rather than to the list. sessionStorage, so it lives as
 * long as the tab and no longer, and a key of its own so clearing the drafts
 * leaves it alone. Same tab only: a magic link clicked in the mail opens a
 * new tab, which has no storage of its own to read this from. For that tab
 * the login page sends the path along with the request for the link, and the
 * link brings it back as its `nazaj` parameter.
 */
export const PORTAL_RETURN_KEY = "posvoji.portal.return";

const returnPath = slot(PORTAL_RETURN_KEY);

/**
 * Longer than any address the portal writes. The same cap as
 * MAX_RETURN_PATH_LENGTH in apps/portal/core/api/auth.py.
 */
const MAX_RETURN_PATH_LENGTH = 500;

/**
 * Every control character, which is the whole of Unicode's Cc category: the C0
 * range, DEL and the C1 range. Tab and the line ends included, unlike in free
 * text. The same ranges as _ANY_CONTROL_CHARACTER in
 * apps/portal/core/models.py.
 */
const CONTROL_CHARACTER = /[\x00-\x1f\x7f-\x9f]/;

/**
 * Whether `path` is an address inside the portal that a login may send the
 * browser to. Same-origin by construction: it starts with /portal, so it can
 * be neither an absolute URL nor a protocol-relative one, and the login page
 * itself is out, or a login could bounce straight back to a login.
 *
 * The same rule as return_path in apps/portal/core/api/auth.py, which is the
 * other half of this: the link in the mail carries the path back to a tab that
 * has no storage to read it from, so both sides check it and neither may be
 * the weaker.
 */
function isPortalReturnPath(path: string): boolean {
  if (path.length > MAX_RETURN_PATH_LENGTH) return false;
  // Two rules, not one scan. A control character is not something a portal
  // address holds at all; whitespace and the backslash are what could break
  // the value out of the query it travels in.
  if (CONTROL_CHARACTER.test(path)) return false;
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
  returnPath.write(path);
}

/**
 * The remembered page, left in place, or null when there is none or what is
 * there is not a portal address. For the request for a login link, which
 * sends the page along so the link can carry it into a new tab: the login
 * that follows in this tab still takes it.
 */
export function peekPortalReturn(): string | null {
  const stored = returnPath.peek();
  return stored && isPortalReturnPath(stored) ? stored : null;
}

/**
 * The remembered page, taken so it is used once, or the list when there is
 * none or what is there is not a portal address.
 */
function takePortalReturn(): string {
  const stored = returnPath.take();
  return stored && isPortalReturnPath(stored) ? stored : PORTAL_PATH;
}

/**
 * Hands the tab over to the page a login that went through belongs on.
 *
 * `linkPath` is the page a link from the mail was asked to come back to, or
 * null when it named none. It is the first answer: a tab the mail opened has
 * no storage of ours, so the link is all such a tab has. The remembered page
 * is taken whether it is used or not, so a spent one is never left behind for
 * a later login in this tab. Neither is trusted without being vetted, and
 * with both gone the list stands in.
 *
 * The verification is noted before the hand over, so that a workspace which
 * finds no session can say the cookie is what went missing rather than send
 * the shelter back here with a blank form and a spent link. replace, not
 * assign: the link is single use and must not become a history entry the back
 * button can walk into.
 */
export function landAfterLogin(linkPath: string | null): void {
  markVerified();
  const remembered = takePortalReturn();
  window.location.replace(
    linkPath !== null && isPortalReturnPath(linkPath) ? linkPath : remembered,
  );
}

/**
 * Sends a page with no session behind it out to the login. The page being
 * left is remembered first, so the login can bring the shelter back to it: a
 * link to one animal opened from a mail would otherwise end on the list.
 * replace(), so the back button does not walk into a page that will only
 * bounce again.
 *
 * A visitor who has just verified a link and still has no session is here
 * because the browser kept no cookie. Their link is spent, so the login page
 * is told what happened and says so; every other anonymous visitor is simply
 * asked for an address.
 */
export function bounceToLogin(): void {
  rememberPortalReturn();
  window.location.replace(
    takeVerified() ? PORTAL_LOGIN_NO_SESSION_PATH : PORTAL_LOGIN_PATH,
  );
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
