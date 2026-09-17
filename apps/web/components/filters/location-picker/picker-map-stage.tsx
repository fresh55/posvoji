import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { MAP_STAGE_TRANSITION_CLASS } from "./motion";
import type { LocationPickerController } from "./controller";

// The country plate and everything printed on it: the regions, the relief, the
// markers, the callouts, the legend and the municipality centroid table the
// region names are read off. None of it is on the home page until the picker
// is opened, and the picker's dialog does not mount this stage until then, so
// the press that asks for the map is what fetches it. Measured with
// scripts/measure-chunks.mjs: the home document asked for 373.7 KB of script
// gzipped with the plate imported and 359.2 KB with it fetched.
//
// The mini-map in the sidebar's Kje plate is a different and much smaller
// drawing (mini-map.tsx) and stays where it is. It is on the first paint.
//
// ssr: false because the stage only ever renders inside an open dialog, which
// is a state a static export has no way to prerender: the server pass would
// emit the chunk's preload for markup nobody is shown.
//
// The stand-in is a skeleton and not nothing: the press has already opened the
// dialog, the chunk is in flight, and this is the largest surface in the
// frame. A skeleton is a promise that something is on its way, and here
// something is.
//
// It needs a height of its own. flex-1 is `flex: 1 1 0%`, which is 0 in a
// column sized by its content, and below lg with the list put away the stage
// is exactly that: the dialog painted as a header, a strip of padding and a
// footer, then jumped to full height when the chunk landed. min-h-52 is the
// plate's own 210-unit viewBox at 1:1, and shrink lets it go when the box is
// shorter than that, the same as the real map does.
const PickerMapPlate = dynamic(
  () =>
    import("./picker-map-plate").then((module) => module.PickerMapPlate),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-52 w-full flex-1 shrink" />,
  },
);

export function PickerMapStage({ controller, hug = false }: {
  controller: LocationPickerController;
  /** Whether this stage is what the dialog takes its height from, which it
   *  is below lg with the list put away (view.tsx). In flow it is as tall as
   *  the map and the legend under it; pinned to the box's edges it was as
   *  tall as the dialog, with the map floating in the middle of it. */
  hug?: boolean;
}) {
  const { panelOpen, sheetOpen } = controller;
  return (
          <div
            data-map-stage={panelOpen ? "panel" : "rail"}
            className={cn(
              "absolute inset-x-0 top-0 bottom-(--picker-footer-h) flex flex-col gap-3 p-3 sm:p-4",
              "@container/map-stage",
              // A landscape phone: wide, and with no height to spare. The
              // legend and the line above it are as tall as a fifth of the
              // stage there and the map is the part that pays for them, so
              // they go beside it instead and the country gets the whole
              // column. sm:short: is the repo's pair for that viewport (the
              // custom variant in globals.css), and the padding tightens with
              // it for the same reason every other short: rule does.
              "sm:short:flex-row sm:short:items-stretch sm:short:py-2",
              // In flow it is also the part that gives way when the screen is
              // short. The dialog caps at 94dvh, and under about 512px of
              // viewport (a landscape phone, or a portrait one with the
              // keyboard up) this stage's natural height is taller than the
              // cap, so the overflow fell out of the bottom of the box and
              // took the confirm button in the footer with it. min-h-0 is
              // what lets it shrink instead: the map inside is already
              // flex-1 over a shrink-0 legend, so the map gives up the
              // pixels and everything under it stays on screen.
              hug && "max-lg:static max-lg:min-h-0",
              sheetOpen && "max-lg:hidden",
              "lg:right-auto",
              MAP_STAGE_TRANSITION_CLASS,
              panelOpen
                ? "lg:w-[calc(100%-24rem)]"
                : "lg:w-[calc(100%-3rem)]",
            )}
          >
            <PickerMapPlate controller={controller} />
          </div>
  );
}
