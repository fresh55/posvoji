import { type CatFraming, CatModel } from "@/components/cat-model";
import type { Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { SRECKO_PATHS } from "@/lib/srecko";
import { cn } from "@/lib/utils";

const copy = {
  sl: { story: "Spoznajte Srečka" },
  en: { story: "Meet Srečko" },
} satisfies Record<Locale, Record<string, string>>;

/**
 * Srečko at the right end of the home page's hero row.
 *
 * The row is a heading and one line, and the right half of it stood empty
 * from tablet width up. He sits there on the meta line's floor, with the
 * one link the about page also gives him at his side and nothing else: the
 * page's sentence stays the heading, and the cat is not a caption for it.
 *
 * The stage is taller than the row and rises through the page's top padding
 * to the header rule (-mt-page-y), so the row grows by the difference and
 * not by the whole stage: a stage the row's own height showed a cat about
 * 40px tall. The camera is closer than the about page's for the same reason.
 * At 1.45m he filled about a third of the stage's height; at 1m he fills
 * about half, and the stage is wide enough that no heading cuts him.
 *
 * Below md there is no room beside a two-line title, and above the title he
 * would push the tabs and the first cards under the fold, so the figure is
 * not drawn there. The poster is still downloaded on phones (21KB, low
 * priority: lazy inside display:none was measured and still fetched); the
 * model is gated on intersection in cat-model.tsx and never starts.
 */
export const HOME_CAT_FRAMING: CatFraming = {
  orbit: "-19deg 81deg 1.25m",
  target: "0m 0.2m 0m",
  poster: "/models/our-cat/poster-home.webp?v=1",
};

export function HomeCat({ locale }: { locale: Locale }) {
  const text = copy[locale];

  return (
    <figure className="hidden shrink-0 items-end gap-2 md:-mt-page-y md:flex">
      <figcaption>
        <a href={SRECKO_PATHS[locale]} className={cn(MUTED_LINK, "rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4")}>
          {text.story}
        </a>
      </figcaption>
      <CatModel
        locale={locale}
        className="h-40 w-48"
        sizes="192px"
        framing={HOME_CAT_FRAMING}
      />
    </figure>
  );
}
