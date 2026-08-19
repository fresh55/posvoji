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
        <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
          <header className="bleed flex items-center justify-between gap-3 border-b py-4">
            {/* The site is a static export and navigates with plain anchors
                everywhere; next/link is not used in this repo. */}
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

          <main
            className={cn(
              "mx-auto flex w-full flex-1 flex-col py-page-y",
              narrow
                ? "max-w-md justify-center gap-6"
                : "max-w-5xl gap-8 sm:gap-10",
            )}
          >
            {children}
          </main>

          <SiteFooter locale="sl" showPortalLink={false} />
        </div>
      </LazyMotion>
    </I18nProvider>
  );
}
