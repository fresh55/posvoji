import type { Messages } from "@/lib/i18n";

/**
 * The map's data credit, floated on the plate's bottom-left corner.
 *
 * CC BY 4.0 requires it visible wherever the boundaries are drawn, and the
 * boundaries are drawn in two places: the homepage picker dialog and the
 * found-animal page. One component, so the licence has one home and the two
 * plates cannot drift into crediting differently.
 *
 * Opaque, unlike the /80 the dialog's title chip and close button wear. Those
 * are chrome and can afford to let the map through. This is 10px type that
 * has to clear 4.5:1, and the ratio the size was chosen against was measured
 * on the paper; over a hillshade that varies underneath it the ratio would
 * vary with it, so the paper travels with the text.
 *
 * pointer-events-none on the paragraph and auto on the links alone: the box
 * sits over a corner of the country that can be picked, and a credit is not
 * allowed to eat a region's taps. Bottom-left because that is the emptiest
 * corner the plate has, sea and the Italian border, and because it is where
 * the letterbox leaves bare paper when the viewBox does not fill the row.
 *
 * The prose halves are description, not licence. CC BY 4.0 asks for the
 * creator, the licence and a link, and those three stay at every width; the
 * sentence they sit in is what a phone can do without. Hidden by CSS rather
 * than dropped from the tree, so the markup is one paragraph.
 */
export function MapAttribution({
  messages,
}: {
  messages: Pick<Messages, "regionBoundaries" | "reliefSource">;
}) {
  return (
    <p
      data-slot="map-attribution"
      className="pointer-events-none absolute bottom-0 left-0 max-w-[26rem] rounded-ui bg-background px-1.5 py-0.5 text-3xs leading-tight text-muted-foreground"
    >
      <span className="max-lg:hidden">{messages.regionBoundaries}: </span>
      <a
        href="https://www.gov.si/drzavni-organi/organi-v-sestavi/geodetska-uprava/"
        className="pointer-events-auto underline underline-offset-2 hover:text-foreground"
        target="_blank"
        rel="noreferrer"
      >
        GURS
      </a>
      , CC BY 4.0.{" "}
      <span className="max-lg:hidden">{messages.reliefSource}: </span>
      <a
        href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
        className="pointer-events-auto underline underline-offset-2 hover:text-foreground"
        target="_blank"
        rel="noreferrer"
      >
        Terrain Tiles
      </a>
      <span className="max-lg:hidden"> (AWS Open Data)</span>, SRTM / NASA.
    </p>
  );
}
