import { newListingsScript } from "@/lib/last-visit";
import { PREHYDRATION_CLEAR_MS } from "@/lib/prehydration-script";

/** The blocking script that holds the new-listings notice's place before the
 *  results are painted (lib/last-visit.ts). Drawn right before the grid, so it
 *  has run by the time the parser reaches the place it holds, and not at all
 *  when no animal on the page carries a listing time. A server component, so
 *  the pre-hydration allowance it reads stays out of the client bundle. */
export function NewListingsScript({ newest }: { newest: number | undefined }) {
  if (newest === undefined) return null;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: newListingsScript(newest, PREHYDRATION_CLEAR_MS),
      }}
    />
  );
}
