import { PREHYDRATION_FILTER_SCRIPT } from "@/lib/prehydration-script";

/** The blocking script both locale layouts open their body with. It stood in
 *  each of them as the same tag under the same comment, which is two places to
 *  keep one rationale and one place for them to drift apart. */
export function PrehydrationFilterScript() {
  return (
    // Blocking, and first, so it has run before the results block further
    // down the document has been parsed. See lib/prehydration-script.ts.
    <script dangerouslySetInnerHTML={{ __html: PREHYDRATION_FILTER_SCRIPT }} />
  );
}
