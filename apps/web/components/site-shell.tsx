import type { ReactNode } from "react";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteHeader } from "@/components/site-header";
import type { Locale } from "@/lib/i18n";
import { CONTENT_ID } from "@/lib/skip-link";

type SiteShellProps = {
  locale: Locale;
  /** This page's address in both locales, handed to the header for the
   *  language switcher. Optional, and the switcher falls back to the homepage
   *  pair (site-header.tsx): the home page is the one page with no twin to
   *  name, and leaving it out there is the right answer rather than an
   *  oversight. */
  languagePaths?: Record<Locale, string>;
  /** The <main>'s own classes, and the one part of the shell the pages
   *  genuinely disagree about. They pick a measure, a gap and whether the
   *  column is a grid; everything around it is the same on all nine. */
  mainClassName?: string;
  /** Inside the frame, above the header. The home page's /?najdena redirect
   *  is the only thing that wants to be there. */
  before?: ReactNode;
  /** Between the main and the footer, where the two long pages mount
   *  BackToTop. */
  afterMain?: ReactNode;
  /** The page's own <SiteFooter>. A node and not a widened set of props: see
   *  the note above. */
  footer: ReactNode;
  children: ReactNode;
};

/**
 * The chrome every page draws: the i18n context, the page frame, the header,
 * and the <main> the header's skip link aims at.
 *
 * The skip link and its landmark are two halves of one contract, and this is
 * the only place that can hold both. The header emits the link centrally; the
 * id and the tabIndex it lands on were written out on every page, so a page
 * added later could render the header, forget them, and ship a bypass link
 * that scrolls nowhere in both locales with nothing failing. That is the
 * failure nothing else could check: the link is present, its target is not,
 * and it is visible only to somebody pressing Tab on that one page. Rendering
 * this is now the whole of what a page has to do to get the pair, and it
 * cannot get one half of it.
 *
 * The nine pages that spelled the shell out were byte identical down to the
 * frame's class string, and it had already cost one hand edit per page per
 * feature: the id and the tabIndex went into all nine at once, and the
 * header's locale prop into ten call sites.
 *
 * A server component. I18nProvider is a client component it renders, and
 * `children`, `footer`, `before` and `afterMain` reach it as slots, so what a
 * page puts inside stays server rendered unless the page says otherwise.
 *
 * What it deliberately does not own:
 *
 * The footer, which arrives as a node. Every page turns a different set of its
 * links off, one page passes a timestamp and another has to count a coverage
 * table before it can answer for the found-animal link, so carrying it as
 * props would pull the footer's whole surface into this signature and settle
 * none of it here.
 *
 * BackToTop, which is `afterMain` on the two pages that mount it, and the
 * `docked` those pages give their footer. The two are one distance: `docked`
 * reserves the strip the button parks in, derived from --back-to-top-bottom
 * (site-footer.tsx), and nothing here enforces that. Mounting the button and
 * deriving the prop would make the pairing structural, which is a change of
 * behaviour to argue on its own rather than inside a move.
 */
export function SiteShell({
  locale,
  languagePaths,
  mainClassName,
  before,
  afterMain,
  footer,
  children,
}: SiteShellProps) {
  return (
    <I18nProvider locale={locale}>
      {/* The column is the viewport's width and the page frame sits inside
          it, around the main alone. The header and the footer each draw a
          rule, and while the frame held all three the rules stopped at the
          frame's edge: at 1440 they ended 80px short of the viewport on each
          side, and a rule that stops short reads as unfinished. So the two
          bands are the column's full width and centre their own contents on
          the same max-w-7xl the frame here uses (site-header.tsx,
          site-footer.tsx). Below 1344px nothing changes, because the frame
          already reached the viewport there. */}
      <div className="flex min-h-dvh flex-col">
        {before}

        <SiteHeader locale={locale} languagePaths={languagePaths} />

        {/* The page frame: the measure every page's main used to share with
            the chrome. flex-1 so the footer stays at the foot of a short page
            the way it did when this was the outer column, and flex-col so a
            main asking for flex-1 of its own still fills it. */}
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-gutter">
          {/* Where the header's skip link lands, on every page that has one.
              One id for both locales rather than a Slovenian and an English
              spelling: these mains live in components the two share, and a
              second name would buy a locale branch in nine files for a
              fragment nobody reads. tabIndex so focus moves here rather than
              only scrolling the page. */}
          <main id={CONTENT_ID} tabIndex={-1} className={mainClassName}>
            {children}
          </main>

          {afterMain}
        </div>

        {footer}
      </div>
    </I18nProvider>
  );
}
