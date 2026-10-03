import { Printer } from "lucide-react";
import type { AnimalFields } from "@/lib/animal";
import { posterPath } from "@/lib/animal-path";
import type { Locale } from "@/lib/i18n";
import { WAY_ON_LINK } from "@/lib/link-styles";
import { cn } from "@/lib/utils";

const posterText = {
  sl: "Natisni plakat",
  en: "Print poster",
} satisfies Record<Locale, string>;

/**
 * The way to an animal's A4 sheet, for a notice board or a vet's waiting room.
 *
 * One component for the animal's page and the dialog. The link used to exist
 * on the page alone, and the page is reached by a shared address, so a visitor
 * browsing the list, who opens every animal in the dialog, had no way to the
 * sheet at all.
 *
 * The mark leads rather than trails: a printer is the subject of this link,
 * and it is what tells it apart from the arrow links it stands beside.
 */
export function PosterLink({
  animal,
  locale,
  newTab = false,
  className,
}: {
  animal: AnimalFields;
  locale: Locale;
  /** Set by the dialog. The sheet is a document of its own, and leaving for
   *  it in the same tab would lose the visitor's place in the list: the way
   *  back lands on the animal's page, not on the dialog over the grid. */
  newTab?: boolean;
  className?: string;
}) {
  return (
    <a
      href={posterPath(animal, locale)}
      data-slot="poster-link"
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      className={cn(WAY_ON_LINK, className)}
    >
      <Printer className="size-4 shrink-0" aria-hidden />
      {posterText[locale]}
    </a>
  );
}
