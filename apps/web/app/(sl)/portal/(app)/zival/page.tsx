import { Suspense } from "react";
import type { Metadata } from "next";
import { AnimalEditorPage } from "@/components/portal/animal-editor-page";
import { PortalPending } from "@/components/portal/notice";
import { PortalPageTransition } from "@/components/portal/portal-transition";
import { portalText } from "@/components/portal/portal-text";

export const metadata: Metadata = {
  // Bare: the root layout's title template appends the site name.
  title: "Uredi žival",
  description:
    "Urejanje podatkov o eni živali v portalu Posvoji.si za zavetišča.",
  robots: { index: false, follow: false },
};

// The animal is named by the query, not by a path segment: the site is a
// static export and this one page is prerendered for every animal there is.
// useSearchParams therefore has to sit inside a Suspense boundary, or the
// build refuses to prerender the page at all. What the boundary shows is the
// same line the portal uses everywhere else while it is still reading.
//
// The crossfade wraps the boundary and not what is inside it, so whichever of
// the two the page has at the moment it arrives, the waiting line or the
// form, is what fades in. Inside the wrapper the swap from one to the other
// is an update, and default="none" leaves updates alone: the line does not
// fade out again once the animal is there.
export default function PortalAnimal() {
  return (
    <PortalPageTransition>
      <Suspense fallback={<PortalPending label={portalText.loading} />}>
        <AnimalEditorPage />
      </Suspense>
    </PortalPageTransition>
  );
}
