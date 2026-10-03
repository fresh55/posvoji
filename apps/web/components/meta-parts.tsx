import { META_DOT_CLASS, META_SEPARATOR } from "@/lib/labels";

/**
 * The parts of an animal's fact line (animalMetaParts in lib/labels.ts) with
 * the separating middot drawn between them, one step under the facts. The grid
 * card and the shelter's other animals on the animal page print the same line,
 * so how the parts are glued lives here.
 */
export function MetaParts({ parts }: { parts: readonly string[] }) {
  return parts.flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <span key={index} className={META_DOT_CLASS}>
            {META_SEPARATOR}
          </span>,
          part,
        ],
  );
}
