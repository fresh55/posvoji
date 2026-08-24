"use client";

import { ArrowRight } from "lucide-react";
import { MiniMap } from "@/components/filters/mini-map";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { requestMunicipalityLookup } from "@/lib/found-animal";
import { type ShelterPin } from "@/lib/map-layout";

// The visible entry point for the other question people arrive with: not
// "which animal do I want" but "I found one, who takes it". It sits on the
// hero's own line from lg up and opens the map dialog's municipality mode.
//
// One Button, and nothing around it. This was a bordered card holding a span
// dressed up as a button, which meant hover, focus, press and dark mode were
// all hand-wired through group-* utilities that buttonVariants already ships:
// focus-visible:ring-3, the disabled and aria-invalid states, dark:border-input,
// and the icon sizing rule. Reimplementing that guaranteed it would drift from
// every other control on the site.
//
// Its anatomy is deliberately the location picker's trigger: same MiniMap as
// the leading mark, same outline variant, same default height. That trigger
// opens this same dialog on its shelter tab, so the two ways in are siblings
// and now look like it.
//
// aria-haspopup because a dialog is what opens. buttonVariants reads it and
// drops the press-down translate, which is how the picker's own Radix trigger
// already behaves.
//
// Module scope, so MiniMap's memo sees the same two arrays on every render.
const NO_PINS: ShelterPin[] = [];
const NO_SELECTION: string[] = [];

export function FoundAnimalButton() {
  const { messages } = useI18n();

  return (
    <Button
      variant="outline"
      onClick={requestMunicipalityLookup}
      aria-haspopup="dialog"
      // Full width on a phone, its own width everywhere else. Held to w-full
      // up to lg it spent a 900px tablet row as an 830px empty box with the
      // label adrift in the middle of it.
      // The button is 36px tall and a finger needs 44, so on the one width
      // where it is pressed by finger it gets the same invisible reach the
      // species tabs use rather than a taller drawing.
      className="w-full max-sm:tap-target sm:w-fit"
    >
      {/* No pins on purpose. The density tint answers "where are the animals",
          which is the browsing question and not this one; here the country is
          a place mark, so every region stays inert and the silhouette carries
          it alone. aria-hidden lives in MiniMap.
          size-6 rather than the h-6 w-auto the picker's trigger passes:
          buttonVariants forces size-4 on any descendant svg whose class does
          not already name a size, so a width set any other way is overruled
          and the mark comes out at the icon default. */}
      <MiniMap
        pins={NO_PINS}
        selected={NO_SELECTION}
        className="size-6 opacity-70"
      />
      {messages.muniPromptTitle}
      <ArrowRight
        className="transition-transform group-hover/button:translate-x-0.5"
        aria-hidden
      />
    </Button>
  );
}
