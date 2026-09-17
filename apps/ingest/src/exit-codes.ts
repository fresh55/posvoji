// The exit-code contract between `pnpm dataset:export` and whatever runs it.
//
// The scheduled crawl gates a deploy on this, so the codes have to say more
// than "worked" and "did not". They mean:
//
//   0  Clean. Every enabled provider crawled, the dataset was written. A
//      provider its schedule held back is clean too when we hold a successful
//      check of it no older than its own crawl interval: not crawling it again
//      is what the interval is for.
//   2  Degraded. Something could not be refreshed, the dataset was still
//      written, and it is safe to deploy. Any of:
//        - One or more providers failed and their previous records were
//          carried forward.
//        - A provider was held back by its schedule with no successful check
//          of it inside its interval, so a recorded attempt alone kept it from
//          being crawled, and its previous records were carried forward.
//        - A per-provider mass-removal guard refused a provider's result: the
//          suspect result is discarded before checkpointing and that
//          provider's previous records are kept.
//        - One or more animals could not be refreshed inside a provider that
//          otherwise finished, and their previous records were carried forward
//          (for an animal we have never held, the listing was skipped).
//      The site goes slightly stale there, which is a better outcome than not
//      deploying everything that did crawl.
//   1  Blocked. Nothing was written, or what was written must not ship. This
//      is an uncaught throw in the pipeline: invalid policies, the final
//      merged-dataset mass-removal guard, invalid merged records, or an
//      unreadable previous dataset. Provider-local throws instead become 2. Node
//      exits 1 on an uncaught throw by itself, so nothing here has to set it.
//
// Anything else is a crash of the runtime rather than a decision of ours, and
// callers should treat it the way they treat 1.
export const EXIT_CLEAN = 0;
export const EXIT_DEGRADED = 2;
export const EXIT_BLOCKED = 1;

export interface RunFailures {
  // Providers whose crawl did not finish at all.
  failedProviders: number;
  // Animals a finished provider could not refresh, over every such provider.
  failedAnimals: number;
}

// Which of the two writing outcomes a finished run earned. A run that never
// gets this far exits 1 through the throw that stopped it.
//
// Both counts are named rather than summed into one number so that a caller
// cannot pass the one it happens to have and silently report a run with stale
// animals in it as clean.
export function exitCodeForRun(failures: RunFailures): number {
  return failures.failedProviders > 0 || failures.failedAnimals > 0
    ? EXIT_DEGRADED
    : EXIT_CLEAN;
}
