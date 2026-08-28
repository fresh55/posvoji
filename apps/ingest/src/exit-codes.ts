// The exit-code contract between `pnpm dataset:export` and whatever runs it.
//
// The scheduled crawl gates a deploy on this, so the codes have to say more
// than "worked" and "did not". They mean:
//
//   0  Clean. Every enabled provider crawled, the dataset was written.
//   2  Degraded. One or more providers failed, their previous records were
//      carried forward, and the dataset was still written and is safe to
//      deploy. The site goes slightly stale for those shelters, which is a
//      better outcome than not deploying the shelters that did crawl.
//   1  Blocked. Nothing was written, or what was written must not ship. This
//      is every throw in the pipeline: invalid policies, a mass-removal guard
//      trip, a misattributed animal, an unreadable previous dataset. Node
//      exits 1 on an uncaught throw by itself, so nothing here has to set it.
//
// Anything else is a crash of the runtime rather than a decision of ours, and
// callers should treat it the way they treat 1.
export const EXIT_CLEAN = 0;
export const EXIT_DEGRADED = 2;
export const EXIT_BLOCKED = 1;

// Which of the two writing outcomes a finished run earned. A run that never
// gets this far exits 1 through the throw that stopped it.
export function exitCodeForRun(failedProviderCount: number): number {
  return failedProviderCount > 0 ? EXIT_DEGRADED : EXIT_CLEAN;
}
