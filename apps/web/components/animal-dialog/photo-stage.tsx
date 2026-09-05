"use client";

import { useState } from "react";
import { useMotionValue } from "motion/react";
import { PhotoSpread } from "@/components/animal-dialog/photo-spread";
import {
  StageWash,
  type WashLayer,
} from "@/components/animal-dialog/photo-wash";
import type { ClientAnimal } from "@/lib/animal";

/**
 * The fan and the light behind it.
 *
 * Everything a photo step changes lives here rather than on the dialog. The
 * walk and the window of photos the wash is holding used to be the dialog's own
 * state, so turning one picture re-rendered the title row, the facts and the
 * shelter block with it: about 200 nodes for something that moved inside the
 * photos. What this component is handed is the animal and where to start, and
 * neither of those changes on a step, so a step stops here.
 */
export function PhotoStage({
  animal,
  initialIndex,
  onIndexChange,
}: {
  animal: ClientAnimal;
  /** Which photo to open on. A shared link can name one. */
  initialIndex?: number;
  /** Reports the photo on show, so the share link can name it. */
  onIndexChange?: (index: number) => void;
}) {
  // The fan's walk, held above the fan rather than inside it: the wash is
  // mounted above the fan's per-animal remount and has to keep reading the
  // same number.
  const washProgress = useMotionValue(0);
  // The fan is remounted per animal so its photos start over, which means the
  // wash cannot live inside it: it would go out with the old animal and come
  // back from nothing. Held here instead, it is one continuous layer, and
  // stepping animals crossfades one colour into the next. On the way out it
  // keeps the last animal's colour and leaves with the dialog.
  const [washLayers, setWashLayers] = useState<WashLayer[]>([]);

  return (
    <>
      <StageWash
        layers={washLayers}
        progress={washProgress}
        status={animal.status}
        animalId={animal.id}
      />
      {/* Keyed, so stepping to another animal starts its photos over rather
          than inheriting the last one's state. */}
      <PhotoSpread
        key={animal.id}
        animal={animal}
        initialIndex={initialIndex}
        onIndexChange={onIndexChange}
        washProgress={washProgress}
        onWashWindow={setWashLayers}
      />
    </>
  );
}
