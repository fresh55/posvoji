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
// something is. It fills the plate the way the plate's own contents do, a
// flexible column against the stage's box, so nothing under it moves when the
// map lands.
const PickerMapPlate = dynamic(
  () =>
    import("./picker-map-plate").then((module) => module.PickerMapPlate),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-0 w-full flex-1" />,
  },
);

export function PickerMapStage({ controller }: { controller: LocationPickerController }) {
  const { panelOpen, sheetOpen } = controller;
  return (
          <div
            data-map-stage={panelOpen ? "panel" : "rail"}
            className={cn(
              "absolute inset-x-0 top-0 bottom-(--picker-footer-h) flex flex-col gap-3 p-3 sm:p-4",
              "@container/map-stage",
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
