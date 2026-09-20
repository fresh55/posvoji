# Demo gate

While the site is shown to invited shelters and to nobody else, a visitor
meets a password page instead of the browser's basic-auth prompt. The page is
`/vstop` (`/en/enter` in English), built by `apps/web` like any other route,
with Srečko's 3D model on it. Caddy does the checking; the export never learns
the password.

## How it works

Caddy keeps the `basic_auth` gate from DEPLOY-PORTAL.md, with a matcher in
front of it. A request is a guest unless it carries the cookie `posvoji_demo`
with the agreed value, or asks for the gate page itself or one of the few
files that page needs to draw. Guests meet `basic_auth`, so
`scripts/verify-release.sh` and `scripts/monitor-production.sh` keep working
through their netrc file, unchanged.

A browser asking for a page gets a 401 whose body is the gate page, served
at the address the visitor asked for, and without the `WWW-Authenticate`
header, which is what stops the browser from opening its own prompt. The page
puts the typed password in the cookie and reloads. If Caddy accepts it, the
reload is the site. If not, the reload is the gate page again, and the page
reads the cookie it is still carrying as the answer: it says the password was
wrong and clears the cookie. A curl with no cookie gets the plain 401 and the
challenge, as before.

The cookie holds the password as typed, for thirty days, `Secure` and
`SameSite=Lax`. That is fine for a gate whose only job is to keep the demo
out of search results and off strangers' screens. It is not a login and it
protects no personal data; the portal has its own.

Everything else stays behind the gate, including `/media/*`. The paths a
guest may fetch are `/vstop`, `/en/enter`, `/_next/static/*` (the code and
CSS, which carry no listings; the animal data is in the pages and their RSC
payloads, which stay gated), `/models/our-cat/*`, the site icons and
`/manifest.webmanifest`.

## Caddy

Add this to the `posvoji.si` block, replacing the existing bare `basic_auth`.
Keep the account line as it is; the health checks depend on it.

```caddy
@guest {
    expression `{http.request.cookie.posvoji_demo} != "{$POSVOJI_DEMO_KEY}" || "{$POSVOJI_DEMO_KEY}" == ""`
    not path /vstop /vstop.html /en/enter /en/enter.html /_next/static/* /models/our-cat/* /icon.svg /favicon.ico /apple-icon.png /icon-192.png /icon-512.png /icon-maskable-512.png /manifest.webmanifest /.well-known/security.txt
}
basic_auth @guest {
    health <the existing hash>
}

handle_errors 401 {
    @page header Accept *text/html*
    handle @page {
        header -WWW-Authenticate
        @en path /en /en.html /en/*
        handle @en {
            rewrite * /en/enter.html
        }
        handle {
            rewrite * /vstop.html
        }
        file_server
    }
}
```

`POSVOJI_DEMO_KEY` is read from Caddy's environment when the Caddyfile is
adapted. Put it in a systemd override for the caddy unit:

```bash
sudo systemctl edit caddy
```

```ini
[Service]
Environment=POSVOJI_DEMO_KEY=the-password-the-shelters-get
```

Then `sudo systemctl restart caddy`. Reloading is not enough for a changed
environment, and a Caddyfile reload does not reread it either.

The `|| ... == ""` half is what an unset variable does: with no key, every
request is a guest and the site is back to plain `basic_auth`. Without it an
empty key would have let an empty cookie through. Both halves were run in a
container against the exported page names before this was written down, in
the states key set, key unset and key empty, and the deploy's
`scripts/validate-caddy-layout.cjs` accepts the shape (its test file carries
the case).

Both `.html` names are in the path list because `try_files` runs before
`basic_auth` in Caddy's directive order, so the matcher sees the rewritten
path. `@en` lists `/en.html` for the same reason.

Keep `/.well-known/security.txt` outside authentication so security researchers
can find the reporting address while the demo gate is active. Apply this matcher
when deploying the file; changing this document alone does not update the host.

`/manifest.webmanifest` is in the list because a browser fetches a manifest
with credentials omitted. The cookie never rides along, so the request is a
guest request even on a page an invited shelter is already reading: every page
logs a failed manifest fetch, and Add to Home Screen falls back to the page
title and a guessed icon, which is the case `app/manifest.ts` exists to
prevent. The three PNG icons the manifest names are fetched the same way and
are listed with it, so an install finds them. The file holds the site name, its
description and the icon paths, all of which the gate page itself already
serves. Putting `crossorigin="use-credentials"` on the link instead is not
available: Next writes that tag itself from the `app/manifest.ts` file
convention, and its metadata API takes no attribute for it.

Measured on 20 September 2026 before the host update, with no cookie:
`/icon.svg`, `/favicon.ico` and `/apple-icon.png` answer `200`, while
`/manifest.webmanifest`, the three PNG icons and `/.well-known/security.txt`
answer `401`. The host was running an older list than the one above. The list
as written was run the same day in a `caddy:2` container against the exported
names, with the key set and empty: a guest gets `200` for the manifest and its
icons, pages and `.json` still answer `401`, and the health account still
reaches the site.

Applied to production on 20 September 2026 by adding those five paths to the
host's existing `@gated` matcher. Its existing portal and asset exceptions,
account lines and cookie expression were preserved. When updating an existing
host, add the missing paths without replacing its intentional public routes.
Caddy validated and reloaded without a restart or environment change; the
active configuration passed `scripts/validate-caddy-layout.cjs`.

Verified after reload, with no cookie: all five paths return `200` and exactly
match the exported files. `/o-nas` and `/en/about` still return `401` with the
appropriate gate page and no browser authentication challenge. Plain requests
to `/o-nas`, `/_posvoji/status.json`, `/_posvoji/operations.json` and `/media/`
remain `401`. The existing health credentials still reach the page and release
status, and the demo cookie still reaches `/o-nas`. The previous configuration
is saved on the host at
`/etc/caddy/Caddyfile.before-demo-assets-20260920T184725Z`.

`handle_errors 401` sits beside the existing `handle_errors` block for the
404 page; Caddy lets a block claim its status codes and leaves the rest to
the bare one.

## Taking it off

Remove the matcher and the `handle_errors 401` block, or remove `basic_auth`
altogether when the site launches. Nothing has to ship at the same moment:
with `POSVOJI_DEMO_KEY` unset every request is a guest again, which is plain
`basic_auth` and the state the host was in before this.

What is left in the repository afterwards, and whether it goes:

| Path | On removal |
| --- | --- |
| `app/(sl)/vstop`, `app/(en)/en/enter` | Delete, but only after the Caddy block above is gone: the `not path` list and the `handle_errors 401` rewrite both name `/vstop.html` and `/en/enter.html`, so a release without them breaks a host still running the gate. Until then they are harmless, and the page states the password as a condition rather than announcing a closed preview, so neither route claims anything untrue once the gate is off. |
| `components/demo-gate-page.tsx` and its test | Delete. |
| `lib/demo-gate.ts` and its test | Delete. |
| `components/cat-model.tsx` and its test | **Keep.** The about page renders it. |
| `onHandle` / `CatModelHandle` on `CatModel` | Delete, if nothing else has taken it up. Only the gate asks the cat to react. |
| `react()` and `CatReaction` in `lib/cat-interaction.ts` | Delete with `onHandle`, same condition. |
| The gate case in `scripts/validate-caddy-layout.test.cjs` | Delete. |
| The DEMO-GATE line in `DEPLOY-PORTAL.md` | Delete. |

The routes carry `robots: noindex` and are harmless while they wait: the form
sets a cookie nobody reads and sends the visitor to the home page. Their copy
is written for both states, so nothing has to ship on the day the gate comes
off.
