import { Suspense } from "react";
import type { Metadata } from "next";
import { PortalPending } from "@/components/portal/notice";
import { PortalPageTransition } from "@/components/portal/portal-transition";
import { QuickAnswersPage } from "@/components/portal/quick-answers-page";
import { portalText } from "@/components/portal/portal-text";

export const metadata: Metadata = {
  // Bare: the root layout's title template appends the site name.
  title: "Hitri odgovori",
  description:
    "Odgovori na vprašanja, po katerih posvojitelji iščejo, v portalu Posvoji.si za zavetišča.",
  robots: { index: false, follow: false },
};

// The shelter and the animal a round is on travel in the query, for the
// reason the editor page gives: the site is a static export, and this page is
// prerendered once for every shelter there is. useSearchParams therefore sits
// inside a Suspense boundary, or the build refuses to prerender the page.
//
// The crossfade wraps the boundary, as it does on the editor page, so the
// step from the list is the same one crossfade.
export default function PortalAnswers() {
  return (
    <PortalPageTransition>
      <Suspense fallback={<PortalPending label={portalText.loading} />}>
        <QuickAnswersPage />
      </Suspense>
    </PortalPageTransition>
  );
}
