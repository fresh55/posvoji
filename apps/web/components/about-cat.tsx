import { CatModel } from "@/components/cat-model";
import type { Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { SRECKO_PATHS, SRECKO_TEXT } from "@/lib/srecko";
import { cn } from "@/lib/utils";

const copy = {
  sl: { story: "Spoznajte Srečka" },
  en: { story: "Meet Srečko" },
} satisfies Record<Locale, Record<string, string>>;

/**
 * The cat on the about page: the shared model under his introduction.
 *
 * The model, its camera and its touch controller live in cat-model.tsx,
 * because the demo gate shows the same cat. No posterPriority here: he sits
 * below the fold on this page and is often never fetched at all.
 */
export function AboutCat({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const memorial = SRECKO_TEXT[locale];

  return (
    <figure className="mx-auto w-full max-w-md">
      <CatModel
        locale={locale}
        className="h-48 sm:h-64 lg:h-[31rem]"
        sizes="(min-width: 1024px) 420px, (min-width: 640px) 448px, 100vw"
      />
      <figcaption className="mx-auto mt-3 max-w-xs space-y-2 text-center text-sm leading-relaxed text-muted-foreground">
        <p>{memorial.intro}</p>
        <a href={SRECKO_PATHS[locale]} className={cn(MUTED_LINK, "rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4")}>
          {text.story}
        </a>
      </figcaption>
    </figure>
  );
}
