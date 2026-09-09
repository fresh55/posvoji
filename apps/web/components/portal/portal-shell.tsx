"use client";

import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "motion/react";
import { I18nProvider } from "@/components/i18n-provider";
import { Logo } from "@/components/logo";
import { portalText } from "@/components/portal/portal-text";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";

/**
 * The portal's own frame. It borrows the site's shell and footer but drops
 * the language switcher: the portal is Slovenian only.
 */
export function PortalShell({
  actions,
  narrow = false,
  children,
}: {
  actions?: ReactNode;
  /** Centres a single card, for the login page. */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <I18nProvider locale="sl">
      {/* One motion feature bundle for the whole portal, so no page or card
          has to carry its own. */}
      <LazyMotion features={domAnimation}>
        <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
          <header className="bleed relative flex items-center justify-between gap-3 border-b py-4">
            {/* The public header's bypass, spelled again here because this
                header is hand-rolled and does not render SiteHeader. Fewer
                stops to skip than on the public site, but the list is a long
                table and the editor a long form, and a keyboard visitor pays
                the brand and the actions again on every step between them.
                relative on the header and left-gutter here for the reason
                site-header.tsx records: the header bleeds, so an absolutely
                positioned child otherwise measures from outside the page's
                own column. */}
            <a
              href="#vsebina"
              className="sr-only rounded-ui bg-background px-3 py-2 text-sm underline underline-offset-4 focus:not-sr-only focus:absolute focus:top-2 focus:left-gutter focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
            >
              {portalText.skipToContent}
            </a>
            {/* The public site is a static export and navigates with plain
                anchors. Not to keep the router out, which was the reason
                recorded here and is not true: the app-router chunk is in
                every page's script list whether or not a Link is on the
                page. What next/link would add is prefetch traffic. Prefetch
                defaults to auto and fetches a route's segment tree for every
                link in the viewport, and the home grid puts sixty of them
                there at once. The portal's own two pages are the exception
                and do use next/link, because the session and the loaded list
                have to survive the step between them. This link leaves the
                portal, so it is an anchor. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="flex items-center gap-2 tracking-tight"
              aria-label={`posvoji.si, ${portalText.brand}`}
            >
              <Logo className="h-10 w-auto" />
              <span className="flex flex-col leading-tight">
                <span className="font-medium">posvoji.si</span>
                <span className="text-xs text-muted-foreground">
                  {portalText.brand}
                </span>
              </span>
            </a>
            {actions}
          </header>

          {/* The same id the public pages use, so there is one name for
              "the content" across the whole export. tabIndex so focus moves
              here rather than only scrolling the page. */}
          <main
            id="vsebina"
            tabIndex={-1}
            className={cn(
              "mx-auto flex w-full flex-1 flex-col py-page-y",
              narrow
                ? "max-w-md justify-center gap-6"
                : "max-w-5xl gap-8 sm:gap-10",
            )}
          >
            {children}
          </main>

          {/* The portal states the address itself, under the login form and in
              the workspace's no-shelters lead, and takes it away again on the
              card that has said its piece. A footer copy would put it back on
              all three. */}
          <SiteFooter locale="sl" showContact={false} />
        </div>
      </LazyMotion>
    </I18nProvider>
  );
}
