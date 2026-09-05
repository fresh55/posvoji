import { Suspense } from "react";
import type { Metadata } from "next";
import { LoaderCircle } from "lucide-react";
import { AnimalEditorPage } from "@/components/portal/animal-editor-page";
import { portalText } from "@/components/portal/portal-text";

export const metadata: Metadata = {
  title: "Uredi žival | Posvoji.si",
  description:
    "Urejanje podatkov o eni živali v portalu Posvoji.si za zavetišča.",
  robots: { index: false, follow: false },
};

// The animal is named by the query, not by a path segment: the site is a
// static export and this one page is prerendered for every animal there is.
// useSearchParams therefore has to sit inside a Suspense boundary, or the
// build refuses to prerender the page at all. What the boundary shows is the
// same line the portal uses everywhere else while it is still reading.
export default function PortalAnimal() {
  return (
    <Suspense
      fallback={
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {portalText.loading}
        </p>
      }
    >
      <AnimalEditorPage />
    </Suspense>
  );
}
