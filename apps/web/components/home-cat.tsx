import { type CatFraming, CatModel } from "@/components/cat-model";
import { SreckoLink } from "@/components/srecko-link";
import type { Locale } from "@/lib/i18n";

// Keep the camera and still aligned; bump ?v when replacing the still.
export const HOME_CAT_FRAMING: CatFraming = {
  orbit: "-19deg 81deg 1.3m",
  target: "0m 0.24m 0m",
  poster: "/models/our-cat/poster-home.webp?v=3",
};

// Shared with the hero padding to keep the model and caption clear of text.
export const CAT_CORNER =
  "[--cat-corner:11.5rem] lg:[--cat-corner:12.5rem] short-desktop:[--cat-corner:10rem] short:[--cat-corner:0rem]";

// Match md:flex and short:hidden so hidden viewports do not fetch the still.
export const HOME_CAT_POSTER_MEDIA =
  "(min-width: 48rem) and (min-height: 32.01rem)";

export function HomeCat({ locale }: { locale: Locale }) {
  return (
    <figure className="absolute right-0 -bottom-section-gap hidden w-[calc(var(--cat-corner)-2rem)] flex-col items-center md:flex short:hidden">
      <CatModel
        locale={locale}
        className="aspect-[192/152] w-full"
        sizes="(min-width: 64rem) and (max-height: 799px) 128px, (min-width: 64rem) 168px, 152px"
        framing={HOME_CAT_FRAMING}
        posterMedia={HOME_CAT_POSTER_MEDIA}
        // Defer model loading until pointer entry or keyboard focus.
        startOnReach
      />
      <figcaption className="mt-1 leading-4">
        <SreckoLink locale={locale} className="text-xs" />
      </figcaption>
    </figure>
  );
}
