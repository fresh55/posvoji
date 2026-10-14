"use client";

import { CatModel } from "@/components/cat-model";
import { SreckoLink } from "@/components/srecko-link";
import type { Locale } from "@/lib/i18n";
import {
  SRECKO_TEXT,
} from "@/lib/srecko";

export function AboutCat({ locale }: { locale: Locale }) {
  const memorial = SRECKO_TEXT[locale];

  return (
    <figure className="mx-auto w-full max-w-md">
      <CatModel
        locale={locale}
        className="h-48 sm:h-64 lg:h-[31rem]"
        sizes="(min-width: 1024px) 420px, (min-width: 640px) 448px, 100vw"
        deferOnLimitedConnection
        renderCaption={(action) => (
          <figcaption className="mx-auto mt-3 max-w-xs space-y-2 text-center text-sm leading-relaxed text-muted-foreground">
            <p>{memorial.intro}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <SreckoLink locale={locale} />
              {action}
            </div>
          </figcaption>
        )}
      />
    </figure>
  );
}
