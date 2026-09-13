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
 * The camera the home stage is framed at, and the still rendered from it.
 *
 * Closer than the about page's 1.45m, at which he filled a third of a stage
 * this size. The target sits a little higher than the default so the seated
 * pose keeps headroom under the header rule; what that costs is the floor
 * shadow, which may touch the stage's bottom edge, where nothing is drawn.
 */
export const HOME_CAT_FRAMING: CatFraming = {
  orbit: "-19deg 81deg 1.3m",
  target: "0m 0.24m 0m",
  poster: "/models/our-cat/poster-home.webp?v=2",
};

/**
 * Srečko in the home page's top right corner, beside the hero.
 *
 * The hero is a heading and one line, 64px tall, and the right half of it
 * stood empty from tablet width up. He does not sit in that row: any stage
 * tall enough to show him would grow the row and leave the heading with
 * dead space above it (measured: 48px of it, and Bruno circled it). He is
 * positioned out of flow instead, in the corner the page already has: from
 * the header rule down to the top of the toolbar, which at lg is the top
 * padding, the hero and the section gap, 152px, with nothing else in it.
 * The heading, the meta line, the tabs and the cards all keep their places.
 *
 * The one link the about page also gives him sits at his left, on the meta
 * line's baseline, and nothing else: the page's sentence stays the heading.
 *
 * Below md there is no such corner beside a two-line title, and above the
 * title he would push the tabs and the first cards under the fold, so the
 * figure is not drawn there. The poster is still downloaded on phones
 * (21KB, low priority: lazy inside display:none was measured and still
 * fetched); the model is gated on intersection in cat-model.tsx and never
 * starts.
 */
export function HomeCat({ locale }: { locale: Locale }) {
  const text = copy[locale];

  return (
    <figure className="absolute right-0 -bottom-section-gap hidden h-38 w-48 md:block">
      <CatModel locale={locale} className="h-full" sizes="192px" framing={HOME_CAT_FRAMING} />
      <figcaption className="absolute right-full bottom-section-gap mr-2 whitespace-nowrap">
        <a href={SRECKO_PATHS[locale]} className={cn(MUTED_LINK, "rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4")}>
          {text.story}
        </a>
      </figcaption>
    </figure>
  );
}
