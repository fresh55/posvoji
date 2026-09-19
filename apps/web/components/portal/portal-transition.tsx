import { ViewTransition, type ReactNode } from "react";

/**
 * The crossfade between the portal's two pages.
 *
 * Wrapped around what each page renders, never around the layout. The layout
 * persists across a client navigation, so a wrapper up there would never be
 * mounted or unmounted and enter and exit would never fire. That split is
 * also what keeps the portal's header and footer still: PortalShell is drawn
 * by the layout, so the only thing that leaves and arrives is the page body,
 * and the chrome around it is never part of the animation.
 *
 * `default="none"` turns off every trigger that is not named here. Without it
 * this wrapper would animate on any transition that touched the page, and
 * both pages have plenty: a status saved from a row, a filter typed into the
 * list, a form section opening. Those are changes within one page and have
 * their own motion already. The step between the two pages is the whole
 * feature, so enter and exit are the only two triggers left on.
 *
 * The classes are styled in portal-transitions.css, which the portal layout
 * loads. Where the browser has no View Transitions API, and under jsdom,
 * React renders the children as they are and the pages simply swap.
 */
export function PortalPageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" enter="portal-enter" exit="portal-exit">
      {children}
    </ViewTransition>
  );
}
