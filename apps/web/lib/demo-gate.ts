/**
 * The demo gate, the browser's half.
 *
 * While the site is shown to invited shelters and nobody else, Caddy answers
 * every page with 401 unless the request carries this cookie with the agreed
 * value, and renders the gate page as the body of that 401. The page puts the
 * typed password in the cookie and reloads; Caddy does the comparing. Nothing
 * in the export knows the password. See docs/DEMO-GATE.md for the server half.
 */
export const DEMO_COOKIE = "posvoji_demo";

/** Where the gate page lives on its own, for a link or a bookmark. */
export const GATE_PATHS = { sl: "/vstop", en: "/en/enter" } as const;

/** Thirty days, then the shelter types it once more. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function readGateCookie(cookie = document.cookie): string {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DEMO_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function gateCookieHeader(value: string, secure = true): string {
  // An empty value is the clearing form: same name and path, expired.
  const age = value ? COOKIE_MAX_AGE : 0;
  return `${DEMO_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Passing "" clears it. A Secure cookie is dropped on the plain http of `next dev`. */
export function writeGateCookie(value: string) {
  document.cookie = gateCookieHeader(value, location.protocol === "https:");
}

/**
 * Caddy rewrites, it does not redirect, so a refused visitor sees the page at
 * the address they asked for. On the page's own address nobody was refused.
 */
export function isGatedView(pathname: string): boolean {
  // The exported file answers to its own name as well as the clean address.
  const clean = pathname.replace(/\.html$/u, "");
  return !(Object.values(GATE_PATHS) as string[]).includes(clean);
}
