import { Building2, CalendarClock, type LucideIcon } from "lucide-react";
import type { AnimalSize } from "@posvoji/schema";
import {
  AGE_STAGE_PATHS,
  type AgeStage,
} from "@/components/filters/age-stage-paths";
import type { AnimalFields } from "@/lib/animal";
import {
  filterValueGlyph,
  GOOD_WITH_ICONS,
  HEALTH_ICONS,
  SPECIES_ICONS,
} from "@/lib/animal-icons";
import {
  ageGroup,
  ageInMonths,
  GOOD_WITH_KEYS,
  TOGGLES,
  toggleLabel,
} from "@/lib/filters";
import { getMessages, type Locale, type TranslationKey } from "@/lib/i18n";
import {
  ageLabel,
  longStayMonths,
  monthsInShelter,
  sexLabel,
  sizeLabel,
  speciesLabel,
} from "@/lib/labels";

/**
 * What the sheet knows about the animal, as tiles.
 *
 * The same facts the animal's own page states, wearing the same marks and the
 * same three tones: neutral for who the animal is, the filter green for what
 * the health record says, amber for the wait. A poster read across a room
 * cannot hold a sentence, and a middot list of five words is a sentence with
 * the punctuation taken out. A row of small drawings can be read at a glance
 * from the far side of a waiting room, which is the whole job.
 *
 * Nothing is printed for a fact the dataset does not hold. A tile that said
 * "ni znano" would spend paper saying we do not know, and there are five of
 * those on a typical listing.
 */

/** The mark a tile wears. Lucide for most of them; the age stages are drawn
 *  from their own path data, because the icon that owns them on screen is a
 *  Motion component and cannot be server-rendered. */
type Glyph =
  | { kind: "lucide"; Icon: LucideIcon; size?: GlyphSize }
  | { kind: "age"; stage: AgeStage };

/** Only size uses this. The size filter says its three values with one paw at
 *  three sizes (size-paw-cards.tsx, filterValueGlyph), so the paw itself is
 *  the measurement and a tile that drew all three the same would have thrown
 *  the fact away. */
type GlyphSize = "sm" | "lg";

const SIZE_GLYPH: Record<AnimalSize, GlyphSize | undefined> = {
  small: "sm",
  medium: undefined,
  large: "lg",
};

export type PosterTileTone = "identity" | "health" | "wait";

export type PosterTile = {
  key: string;
  label: string;
  tone: PosterTileTone;
  glyph: Glyph;
};

// The household questions, in the words the dialog gives a yes. Only a yes
// reaches a tile: "Raje brez otrok" is a fair thing to say on the animal's own
// page, beside the sentence that explains it, and it is not a thing to print
// in letters big enough to read across a room.
const GOOD_WITH_YES: Record<(typeof GOOD_WITH_KEYS)[number], TranslationKey> = {
  kids: "goodWithYesKids",
  dogs: "goodWithYesDogs",
  cats: "goodWithYesCats",
};

/**
 * Every tile the sheet prints, in reading order: who, then the health record,
 * then the household, then the wait.
 *
 * Pure and exported so a test can hold the list still without rendering a
 * sheet. The wait is the one tile that is not a property of the animal but of
 * how long it has been waiting, so it comes last and wears the one warm
 * colour on the page.
 */
export function posterTiles(
  animal: AnimalFields,
  locale: Locale,
  reference: Date,
): PosterTile[] {
  const messages = getMessages(locale);
  const tiles: PosterTile[] = [];

  tiles.push({
    key: "species",
    label: speciesLabel(animal.species, locale),
    tone: "identity",
    glyph: { kind: "lucide", Icon: SPECIES_ICONS[animal.species] },
  });

  if (animal.sex && animal.sex !== "unknown") {
    tiles.push({
      key: "sex",
      label: sexLabel(animal.sex, locale),
      tone: "identity",
      // Mars and Venus, the marks the sex cards and the dialog's badge both
      // wear. Read through filterValueGlyph rather than from the dialog's own
      // map, which lives in a "use client" file.
      glyph: { kind: "lucide", Icon: filterValueGlyph("sex", animal.sex).Icon },
    });
  }

  const months = ageInMonths(animal, reference);
  if (months !== undefined) {
    tiles.push({
      key: "age",
      label: ageLabel(months, locale),
      tone: "identity",
      // The same sprout, shrub or tree the age filter buckets by.
      glyph: { kind: "age", stage: ageGroup(months) },
    });
  }

  if (animal.size) {
    tiles.push({
      key: "size",
      label: sizeLabel(animal.size, locale),
      tone: "identity",
      glyph: {
        kind: "lucide",
        Icon: filterValueGlyph("size", animal.size).Icon,
        size: SIZE_GLYPH[animal.size],
      },
    });
  }

  // Exactly what the dialog's green row says, itemized. It collapses a full
  // record behind one summary badge because a row of ticks decays into
  // wallpaper on a screen you can press; paper cannot be pressed, so the sheet
  // prints the items.
  for (const { key } of TOGGLES.filter((toggle) => toggle.matches(animal))) {
    tiles.push({
      key,
      label: toggleLabel(key, locale),
      tone: "health",
      glyph: { kind: "lucide", Icon: HEALTH_ICONS[key] },
    });
  }

  for (const key of GOOD_WITH_KEYS) {
    if (animal.goodWith?.[key] !== "yes") continue;
    tiles.push({
      key: `goodWith-${key}`,
      label: messages[GOOD_WITH_YES[key]],
      tone: "identity",
      glyph: { kind: "lucide", Icon: GOOD_WITH_ICONS[key] },
    });
  }

  if (animal.apartmentOk === "yes") {
    tiles.push({
      key: "apartment",
      label: messages.apartmentYes,
      tone: "identity",
      glyph: { kind: "lucide", Icon: Building2 },
    });
  }

  const stay = stayTile(animal, locale, reference);
  if (stay) tiles.push(stay);

  return tiles;
}

/**
 * The quiet "V zavetišču: 2 meseca" aside, as a tile.
 *
 * Nothing for an animal that has waited long enough for the sheet to make the
 * plea instead: that sentence says the same number in the animal's own name,
 * and printing both would be the sheet saying it twice. Which of the two an
 * animal gets is labels.ts's call, the same one the dialog reads.
 */
function stayTile(
  animal: AnimalFields,
  locale: Locale,
  reference: Date,
): PosterTile | undefined {
  if (longStayMonths(animal, reference) !== undefined) return undefined;
  // An adopted animal has left, so its stay is history. It has no business on
  // a poster at all, but a dataset can be a day behind a shelter's listing.
  if (!animal.intakeDate || animal.status === "adopted") return undefined;
  const months = monthsInShelter(animal.intakeDate, reference);
  if (months === undefined) return undefined;
  return {
    key: "stay",
    label: `${getMessages(locale).factTimeInShelter}: ${ageLabel(months, locale)}`,
    tone: "wait",
    glyph: { kind: "lucide", Icon: CalendarClock },
  };
}

// Lucide draws at 1.75 everywhere on this site, and a stroke width is in
// viewBox units, so it thins and thickens with the glyph rather than with the
// paper. At the 5mm a tile draws them, 1.75 of 24 is a 0.36mm line, which is
// about a printer's hairline doubled and holds at arm's length.
const STROKE = 1.75;

function TileGlyph({ glyph }: { glyph: Glyph }) {
  if (glyph.kind === "age") {
    return (
      <svg
        className="poster-tile-glyph"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {AGE_STAGE_PATHS[glyph.stage].map(({ d }) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  const { Icon, size } = glyph;
  return (
    <Icon
      className={
        size ? `poster-tile-glyph poster-tile-glyph--${size}` : "poster-tile-glyph"
      }
      strokeWidth={STROKE}
      aria-hidden
    />
  );
}

export function PosterFacts({ tiles }: { tiles: PosterTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <ul className="poster-tiles">
      {tiles.map((tile) => (
        <li
          key={tile.key}
          // Which fact this is, for anything that has to find one tile among
          // the others: the printed row says it with a drawing and a word,
          // and neither of those is a handle.
          data-fact={tile.key}
          className={`poster-tile poster-tile--${tile.tone}`}
        >
          <TileGlyph glyph={tile.glyph} />
          <span>{tile.label}</span>
        </li>
      ))}
    </ul>
  );
}
