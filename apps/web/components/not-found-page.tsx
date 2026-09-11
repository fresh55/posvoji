import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { getMessages, type Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { HOME_PATHS, homePath, sheltersIndexPath } from "@/lib/shelter-path";

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
    <SiteShell
      locale={locale}
      // HOME_PATHS and not the pair written out here. There is no English
      // twin of an arbitrary bad path, so this is the one page where the
      // switcher cannot keep the reader's place; the root is the honest
      // answer, and it is named once in lib/shelter-path.ts.
      languagePaths={HOME_PATHS}
      mainClassName="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-3 py-page-y text-center"
      footer={<SiteFooter locale={locale} />}
    >
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {messages.notFoundTitle}
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
        {messages.notFoundBody}
      </p>
      {children}
      {/* allAnimals, which is what the breadcrumb calls the root on every
          page that has one. This row and the error page were the two
          places the site kept a second name for it, and the arrow dressed
          it as a back action on the one page a search engine sends people
          to with nothing behind them. The link beside it is already the
          plain name of its destination, so the two are a pair now. */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        <a
          href={homeHref}
          className="max-lg:tap-target font-medium text-foreground underline-offset-4 hover:underline"
        >
          {messages.allAnimals}
        </a>
        <a href={sheltersIndexPath(locale)} className={MUTED_LINK}>
          {messages.shelters}
        </a>
      </div>
    </SiteShell>
  );
}
