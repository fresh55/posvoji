import { Check, Search } from "lucide-react";
import {
  SEARCHABLE_FIELDS,
  SEARCHABLE_LABELS,
} from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";

/**
 * The five filters an adopter narrows the grid by, ticked off as the shelter
 * answers them. Read off the saved record, so it says what the public site
 * knows rather than what is typed but not sent.
 *
 * A crawled animal and a manual listing answer the same five, and both editor
 * pages draw this beside the form.
 */
export function SearchableChecklist({
  animal,
}: {
  animal: Record<(typeof SEARCHABLE_FIELDS)[number]["key"], string | null>;
}) {
  const answered = SEARCHABLE_FIELDS.filter(
    (field) => animal[field.key] !== null,
  ).length;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {portalText.sectionSearchable}
      </p>
      <ul className="space-y-1">
        {SEARCHABLE_FIELDS.map((field) => {
          const done = animal[field.key] !== null;
          return (
            <li key={field.key} className="flex items-center gap-1.5 text-xs">
              {done ? (
                <Check
                  className="size-3.5 shrink-0 text-brand-foreground"
                  strokeWidth={2.4}
                  aria-hidden
                />
              ) : (
                <Search
                  className="size-3.5 shrink-0 text-warn-mark"
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
              <span className={done ? "text-muted-foreground" : "font-medium"}>
                {SEARCHABLE_LABELS[field.key]}
              </span>
            </li>
          );
        })}
      </ul>
      {/* Which of the two sentences is true right now, rather than a legend
          for the icons above. */}
      <p className="text-2xs leading-relaxed text-muted-foreground">
        {answered === SEARCHABLE_FIELDS.length
          ? portalText.searchableDone
          : portalText.searchableLead}
      </p>
    </div>
  );
}
