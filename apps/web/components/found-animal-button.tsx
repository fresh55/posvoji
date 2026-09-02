"use client";

import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";

// The visible entry point for the other question people arrive with: not
// "which animal do I want" but "I found one, who takes it". It sits on the
// hero's meta line and links to the found-animal page.
//
// A link and not a button. It used to open the homepage map dialog on its
// "Najdena žival" tab, which is why it reported aria-haspopup="dialog"; the
// lookup is a page of its own now (found-animal-page.tsx), the dialog picks
// shelters and nothing else, and what this control does is go there. That also
// makes it openable in a new tab and readable in the status bar, which a
// button never was.
//
// A quiet line, and it used to be a full-width bordered button carrying a
// 24px silhouette of Slovenia. Two things were wrong with that.
//
// The mark. On a phone that silhouette was on screen twice at once: here at
// 24px without pins, and 546px below in the dock on the shelter picker's own
// trigger at 16px with them (location-picker.tsx). Same drawing, two jobs,
// and the only thing telling them apart is a density tint nobody can see at
// that size. There the map is not a symbol at all but a live readout of the
// selection; here it was that control's face worn with the data removed. A
// country silhouette also says "browse by region" to someone standing over a
// stray, which is the browsing question and not this one. No mark is the
// honest answer for a line of text: the words are what make this findable,
// and a 24px drawing never was.
//
// The weight. This is the smaller of the two questions the page answers, and
// as a full-width outline button it was the widest, most button-shaped object
// above the fold. That made the first pressable thing on an adoption site a
// control that is not about adopting. It also was never the only way in: the
// footer carries the same link on every page, and /?najdena still lands on the
// page for the municipality sites that published it
// (found-animal-redirect.tsx). What the hero uniquely does is name that the
// flow exists, and a line names it as well as a block.
//
// Button asChild and not a bare <a>: variant="link" keeps buttonVariants'
// focus ring and svg sizing rather than a second hand-rolled copy of them, and
// h-auto p-0 is what lets it draw inline instead of as a control with a
// height.
export function FoundAnimalButton() {
  const { locale, messages } = useI18n();

  return (
    <Button
      asChild
      variant="link"
      // Foreground and underlined at rest, unlike the muted meta line above
      // it. This spent a pass as muted hover-underline text, which on a phone
      // -- no hover -- rendered as one more line of metadata, and the person
      // it exists for is scanning the top of the page for something to act
      // on. The freshness line is information; this is an action; the ink and
      // the underline are what say so at zero pixels of extra height. The
      // drawing is still 14px text, so tap-target grows the tappable box
      // without moving what is drawn (globals.css).
      className="h-auto gap-1 p-0 text-sm font-normal text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground max-lg:tap-target"
    >
      <a href={FOUND_ANIMAL_PATHS[locale]}>
        {messages.muniPromptTitle}
        {/* The one mark left, and it is an affordance rather than a subject:
            the words say what this is, the arrow says it goes somewhere. Small
            enough to read as punctuation. */}
        <ArrowRight
          className="size-3.5 transition-transform group-hover/button:translate-x-0.5"
          aria-hidden
        />
      </a>
    </Button>
  );
}
