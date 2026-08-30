import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getMessages, type Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { homePath, sheltersIndexPath } from "@/lib/shelter-path";

/**
 * The body of every 404 this site serves, in one place.
 *
 * Three route files render it: each locale's not-found.tsx, which catches a
 * miss under that root layout, and app/global-not-found.tsx, which catches a
 * URL that matched neither locale and so has no root layout of its own. That
 * third one supplies the <html> and <body> this component deliberately does
 * not, because the other two inherit theirs from the layout they sit beside.
 */
export function NotFoundPage({
  locale,
  children,
}: {
  locale: Locale;
  /** An extra line under the message, for the global page that cannot know
   *  which language the visitor was reaching for. */
  children?: React.ReactNode;
}) {
  const messages = getMessages(locale);
  const homeHref = homePath(locale);

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={homeHref} languagePaths={{ sl: "/", en: "/en" }} />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-3 py-page-y text-center">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            {messages.notFoundTitle}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {messages.notFoundBody}
          </p>
          {children}
          <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <a
              href={homeHref}
              className="max-lg:tap-target font-medium text-foreground underline-offset-4 hover:underline"
            >
              ← {messages.backToAnimals}
            </a>
            <a href={sheltersIndexPath(locale)} className={MUTED_LINK}>
              {messages.shelters}
            </a>
          </div>
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
