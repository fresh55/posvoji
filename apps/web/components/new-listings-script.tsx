import { newListingsScript } from "@/lib/last-visit";

/** The blocking script that holds the new-listings notice's place before the
 *  results are painted (lib/last-visit.ts). Drawn right before the grid, so it
 *  has run by the time the parser reaches the place it holds, and not at all
 *  when no animal on the page carries a listing time. */
export function NewListingsScript({ newest }: { newest: number | undefined }) {
  if (newest === undefined) return null;
  return <script dangerouslySetInnerHTML={{ __html: newListingsScript(newest) }} />;
}
