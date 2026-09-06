import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The /dev tree is a drawing tool for the map and exists for a dev machine.
// Its route has to exist in a production build all the same: `next dev`,
// `next typegen` and `next build` each write route types under .next, tsc
// checks them against each other, and a route set that differs between them
// fails `pnpm typecheck` on every machine that has run the dev server. And
// `output: export` writes an HTML file for every route it has. So the page
// renders the branded 404 in production (app/dev/map/page.tsx), and this step,
// run after `next build`, removes what it exported. A request for /dev/map in
// production then falls through to 404.html like any other unknown path, with
// the 404 status a static host only gives a missing file.
//
// Only the route directory. The gallery's own chunk stays under
// _next/static/chunks, content-addressed and referenced by nothing, which is
// what an unlinked file on a static host amounts to.
const outDev = resolve(dirname(fileURLToPath(import.meta.url)), "..", "out", "dev");
if (existsSync(outDev)) {
  rmSync(outDev, { recursive: true });
  console.log("removed out/dev");
}
