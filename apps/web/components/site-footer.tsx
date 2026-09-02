import { getMessages, type Locale } from "@/lib/i18n";
import { siteLinks, type SiteLinkKey } from "@/lib/site-links";
import { cn } from "@/lib/utils";

export function SiteFooter({
  locale,
  showSheltersLink = true,
  showFoundAnimalLink = true,
  docked = false,
}: {
  locale: Locale;
  showSheltersLink?: boolean;
  /**
   * The way into the found-animal lookup, on every page rather than only the
   * homepage. Back when the lookup was a mode of the map dialog it existed
   * nowhere else: the dialog is mounted by AnimalGrid, so on /zavetisca/[slug]
   * and /viri and every animal page the flow was unreachable in any form. That
   * matters because "zavetišče Ljubljana" is a likelier search for someone
   * holding a stray than anything that lands on the homepage.
   *
   * Defaulted on. The coverage table is static repo data, so the page this
   * links to exists in every real build; an empty table leaves the finder
   * with no matches to offer rather than the link broken. The found-animal
   * page itself switches it off, being the destination.
   */
  showFoundAnimalLink?: boolean;
  /**
   * Set on a page that floats the filter dock over its bottom edge. The grid
   * carried this clearance, but the grid is not what ends the document: the
   * footer is, and it is a sibling of `main`. So the dock cleared the last
   * row of cards and then sat on top of these links, which are the only way
   * to any other page at phone width. Measured on a 390px phone: every one
   * of them was covered, and every one of them failed a hit test.
   */
  docked?: boolean;
}) {
  const messages = getMessages(locale);
  // The roster lives in lib/site-links.ts, shared with the header menu. Every
  // key in it has to have an opinion recorded here, so a destination added
  // there cannot reach the dropdown and quietly miss the footer: the two
  // surfaces drifting apart is the thing the shared roster exists to stop.
  // For the two links this page can show, what is decided is only whether it
  // shows them, because a page passes its own link off rather than linking to
  // itself. `resources` is unlisted everywhere and never reaches this filter;
  // the shelter login is the header's now, a button from lg and a dropdown
  // item below it.
  const shown: Record<SiteLinkKey, boolean> = {
    shelters: showSheltersLink,
    foundAnimal: showFoundAnimalLink,
    resources: false,
    portal: false,
  };
  const links = siteLinks(locale, messages).filter((link) => shown[link.key]);

  return (
    <footer
      className={cn(
        "bleed border-t py-6 text-xs leading-relaxed text-muted-foreground",
        // Only below lg, which is where the dock is; above it the dock is
        // gone and the extra air would just be a hole under the page.
        // Measured off back-to-top's own inset rather than restated: that
        // button docks at --back-to-top-bottom and is size-11 (2.75rem), so
        // its band reaches 2.75rem higher, and the remaining 0.25rem is the
        // gap above it. Cleared to the dock alone, this padding left the
        // button sitting over these links at the bottom of the document.
        docked && "pb-[calc(var(--back-to-top-bottom)+3rem)] lg:pb-6",
      )}
    >
      {/* Links first in the DOM, prose second. On a phone the column shows
          them in that order, because the links are the footer's working part
          - the only way to any other page - and the provenance note is the
          small print that follows. From sm the row reverses so the reading
          order of the wide layout stays prose left, links right, the shape
          every colophon has taught. */}
      {/* The horizontal gap is the row's minimum, not its usual: from lg the
          two columns are hundreds of pixels apart and it never applies. It
          applies between sm and lg, where the prose is wide enough to reach
          the links, and at 12px it let them touch. Measured at 768: the prose
          ran to 12px short of "Zavetišča" and the first line read on into the
          link row as one sentence. 40px makes the prose wrap a word earlier
          and leaves the two columns legibly apart. */}
      <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start sm:justify-between sm:gap-x-10">
        {links.length > 0 && (
          <nav
            // Not moreInformation, which is the header nav's. On the shelters
            // page both render from lg up, and two navigation landmarks under
            // one name is a rotor that cannot tell them apart.
            aria-label={messages.footerLinks}
            // A step larger below lg: these are destinations under a thumb,
            // not fine print, and text-xs let them read as the latter.
            //
            // 24px between them, the same as the header's row and for the
            // same reason: "Najdena žival" carries a word space of its own,
            // and at 16px the gap between the two links was close enough to
            // it that the row read as one label rather than two.
            className="flex shrink-0 flex-wrap gap-x-6 gap-y-2 max-lg:text-sm"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                // The line boxes here run short of the 24px a finger needs.
                // Same treatment the rest of the small-link grammar uses
                // rather than padding, which would visibly inflate the row.
                className={cn(
                  "underline-offset-4 hover:underline max-lg:tap-target",
                  link.quiet
                    ? "text-muted-foreground hover:text-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}
        {/* The provenance note and, under it, the invitation the header used
            to carry across the top of every page. It was the widest thing up
            there and the only thing up there addressed to nobody who came to
            adopt an animal; down here it is next to the sentence about where
            the data comes from, which is the same subject. The mark stays
            with it so the link is recognisable at a glance in a paragraph of
            small print. */}
        <div className="max-w-3xl space-y-2">
          <p>{messages.footer}</p>
          <a
            href="https://github.com/fresh55/posvoji"
            target="_blank"
            rel="noreferrer"
            title={messages.githubTitle}
            className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline max-lg:tap-target"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            {messages.openSource}
            {messages.canHelp}
          </a>
        </div>
      </div>
    </footer>
  );
}
