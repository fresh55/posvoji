import { REGION_SHAPES } from "@/lib/map-regions";
import { intersectionArea, type CalloutRect } from "./map-callout-layout";
import { PLATE_MIN_SCALE } from "./map-marker";

// Major regions orient the small country without labelling every narrow shape.
// The others are named on touch/focus by the map's full callout.
const ORIENTATION_REGIONS = new Set([1, 2, 4, 7, 8, 9, 11, 12]);

/** The narrowest country these names can orient, in drawn pixels.
 *
 *  Under it the whole of Slovenia is about as wide as one of these labels is
 *  long: on a landscape phone the plate draws a 268px country, and Obalno-
 *  kraška printed over Jugovzhodna Slovenija while Osrednjeslovenska ran into
 *  Savinjska. The collision test below is measured off an estimate of the type
 *  and cannot be trusted that far down, and dropping the labels it does catch
 *  would leave two or three names on a map of twelve shapes, which orients
 *  nobody. A plate this small has the callout instead: every region names
 *  itself on a tap, and the footer's instruction line says so.
 *
 *  In rendered pixels and not in plate scale, because what the names need is
 *  room for the words, and that is the country's drawn width. */
export const NAMES_MIN_PLATE_WIDTH = 300;

export function MapRegionNames({ scale, calloutRects }: {
  scale: number;
  calloutRects: CalloutRect[];
}) {
  // Rendered pixels, divided back out of the plate's scale so the names are
  // set at the same size whatever the plate measures.
  //
  // 11.5 on a plate under the threshold everything else here measures itself
  // against. 10.5 is the size the desktop plate was tuned at; on the phone
  // picker, a 341 x 224 plate, the same names came out the smallest type on
  // the site, under the 11px floor its other small print keeps, and by then
  // they are the only thing left on the plate: the paws and the furniture
  // have already gone at this scale. The collision test below drops whatever
  // the larger type no longer has room for.
  const fontSize = (scale < PLATE_MIN_SCALE ? 11.5 : 10.5) / scale;
  const placed: CalloutRect[] = [];

  return (
    <g aria-hidden className="pointer-events-none" data-map-region-names>
      {REGION_SHAPES.filter((region) => ORIENTATION_REGIONS.has(region.id)).map((region) => {
        const lines = region.name.split(/(?<=-)| /);
        const width = Math.max(...lines.map((line) => line.length)) * fontSize * 0.57;
        const box = { x: region.label[0] - width / 2, y: region.label[1] - fontSize,
          width, height: fontSize * lines.length * 1.2 };
        // Any shared area at all drops the name: two of these read through
        // each other long before one covers the other. The arithmetic is the
        // annotation's own, and these rectangles are its own type.
        if ([...placed, ...calloutRects].some((other) => intersectionArea(box, other) > 0)) {
          return null;
        }
        placed.push(box);
        return <text key={region.id} data-map-region-label={region.name}
          x={region.label[0]} y={region.label[1]} textAnchor="middle"
          fontSize={fontSize} fontWeight={500} strokeWidth={2.5 / scale}
          paintOrder="stroke" strokeLinejoin="round"
          className="fill-foreground/80 stroke-background">
          {lines.map((line, index) => <tspan key={line} x={region.label[0]}
            dy={index === 0 ? 0 : fontSize * 1.2}>{line}</tspan>)}
        </text>;
      })}
    </g>
  );
}
