"use client";

import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { requestMunicipalityLookup } from "@/lib/found-animal";

// The visible entry point for the other question people arrive with: not
// "which animal do I want" but "I found one, who takes it". It sits on the
// hero's meta line and opens the map dialog's municipality mode.
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
// dock's picker opens this same dialog on its "Najdena žival" tab, labelled
// and always visible at any scroll position, and /?najdena deep-links it for
// municipality sites linking in (lib/found-animal.ts). What the hero uniquely
// does is name that the flow exists, and a line names it as well as a block.
//
// Button and not a bare <button>: variant="link" keeps buttonVariants' focus
// ring, disabled handling and svg sizing rather than a second hand-rolled copy
// of them, and h-auto p-0 is what lets it draw inline instead of as a control
// with a height. aria-haspopup because a dialog is what opens, and
// buttonVariants reads it to drop the press-down translate, which is how the
// picker's own Radix trigger already behaves.
export function FoundAnimalButton() {
  const { messages } = useI18n();

  return (
    <Button
      variant="link"
      onClick={requestMunicipalityLookup}
      aria-haspopup="dialog"
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
      {messages.muniPromptTitle}
      {/* The one mark left, and it is an affordance rather than a subject:
          the words say what this is, the arrow says it goes somewhere. Small
          enough to read as punctuation. */}
      <ArrowRight
        className="size-3.5 transition-transform group-hover/button:translate-x-0.5"
        aria-hidden
      />
    </Button>
  );
}
