import type { ReactNode } from "react";
import { mailtoHref } from "@/lib/contact-links";
import { GITHUB_MARK } from "@/lib/github-mark";
import { getMessages, interpolate, type Locale } from "@/lib/i18n";
import { registerDateLabel } from "@/lib/labels";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";
import { siteLinks, type SiteLinkKey } from "@/lib/site-links";
import { cn } from "@/lib/utils";

/**
 * What every link down here wears.
 *
 * The ring is the part that was missing. globals.css applies outline-ring in
 * @layer base, which sets a colour and not a ring, so a link that says nothing
 * further is left with whatever the browser draws at whatever width it likes.
 * Every other link of this weight states it for itself: ui/breadcrumb.tsx and
 * the poster link on animal-page.tsx both carry this exact string. These did
 * not, and at the end of the homepage they are the only navigation left in the
 * document.
 *
 * rounded-ui for the reason breadcrumb.tsx carries it: it shapes the ring, not
 * the link, which draws no box of its own.
 */
const FOOTER_LINK =
  "rounded-ui underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring";

/**
 * The two things a reader can do about the sentence above them: write to
 * somebody, or open the code.
 *
 * Foreground and underlined at rest, which is what found-animal-button.tsx
 * settled on in the hero after the same failure. The quiet-link rule in
 * lib/link-styles.ts is muted ink that turns foreground on hover, and it works
 * everywhere else because the text around it is foreground ink and the muting
 * is itself the signal. In here everything is already muted, so a muted link
 * reads on a phone, where there is no hover, as one more line of small print.
 * decoration-border keeps the line quiet while the ink is not.
 *
 * A drawn box below lg rather than the tap-target overlay, which is the branch
 * globals.css names on that utility: overlay an isolated control, grow a
 * crowded one. These are crowded twice over. They sit beside each other in a
 * row, and on the about page the model credit follows them wearing an overlay
 * of its own. A 19.5px line under a 44px overlay overhangs 12.25px per side,
 * so the credit was reaching into the row above it and, being later in the DOM
 * with neither carrying a z-index, taking the presses meant for the repository
 * link.
 */
const FOOTER_ACTION =
  "inline-flex items-center gap-1.5 text-foreground underline decoration-border hover:decoration-foreground max-lg:min-h-11";

export function SiteFooter({
  locale,
  showSheltersLink = true,
  showFoundAnimalLink = true,
  showAboutLink = true,
  showContact = true,
  updatedAt,
  docked = false,
  children,
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
  /** The about page passes its own link off, the same as the two above. */
  showAboutLink?: boolean;
  /**
   * The correction route, passed off by a page that already states the address
   * itself. Same rule as the three flags above, for the same reason: /o-nas
   * prints it in its contact block and the portal's login prints it under the
   * form, so on those two a footer copy is the second time the reader is given
   * the same address on one screen.
   *
   * The portal has a further reason. Its login card takes the address away once
   * the link is sent, because at that point the way out is the mail already on
   * its way and not another address to write to. A footer that keeps offering
   * one underneath is the same contradiction, and portal-login.test.tsx pins it.
   */
  showContact?: boolean;
  /**
   * When the dataset behind this page was written, as the ISO timestamp the
   * export stamps on it. The sentence above says whose the data is; this says
   * how old the copy on the screen is, which the site printed in exactly one
   * place, the homepage hero. An animal page is where a shared link lands, and
   * a stranger reading one had no way to tell a listing captured last night
   * from one captured in March. For an index whose failure mode is a stale
   * listing, that is the fact a colophon is for.
   *
   * Passed in rather than read here, and that is not a preference. PortalShell
   * is a client component and imports this file, so every module reachable
   * from here is compiled into the portal's client bundle, and lib/dataset.ts
   * opens node:fs at module scope. The pages that hold a dataset already call
   * loadDataset, so they answer for this the way site-page.tsx already answers
   * for the found-animal link.
   *
   * Left off where there is no dataset: the about page and the cat's, the
   * resources page, the 404, the error boundary and the portal. A date at the
   * bottom of a page with no listing on it states a fact about nothing on the
   * screen. The five that pass it are site-page.tsx, animal-page.tsx,
   * shelter-detail-page.tsx, shelters-page.tsx and found-animal-page.tsx.
   */
  updatedAt?: string;
  /**
   * Set on a page that mounts BackToTop, which is what this reserves the strip
   * for. The grid carried this clearance, but the grid is not what ends the
   * document: the footer is, and it is a sibling of `main`. So the dock
   * cleared the last row of cards and then sat on top of these links, which
   * are the only way to any other page at phone width. Measured on a 390px
   * phone: every one of them was covered, and every one of them failed a hit
   * test.
   *
   * The name says dock and the arithmetic says button, because on the homepage
   * the two arrived together. /zavetisca has no dock and needs this anyway,
   * which back-to-top.tsx states as its own rule: a page mounting BackToTop
   * without a docked footer has no clearance below lg.
   */
  docked?: boolean;
  /** Optional page-specific credits alongside the provenance note. */
  children?: ReactNode;
}) {
  const messages = getMessages(locale);
  // The roster lives in lib/site-links.ts, shared with the header menu. Every
  // key in it has to have an opinion recorded here, so a destination added
  // there cannot reach the dropdown and quietly miss the footer: the two
  // surfaces drifting apart is the thing the shared roster exists to stop.
  // For the three links this page can show, what is decided is only whether
  // it shows them, because a page passes its own link off rather than linking
  // to itself. `resources` is unlisted everywhere and never reaches this filter;
  // the shelter login is the header's now, a button from lg and a dropdown
  // item below it.
  //
  // The two controls under the provenance note are deliberately not roster
  // entries and never will be. The roster holds pages of this site; a mail
  // composer and a repository on another domain are neither, and putting them
  // in it would put them in the header's dropdown as well.
  const shown: Record<SiteLinkKey, boolean> = {
    shelters: showSheltersLink,
    foundAnimal: showFoundAnimalLink,
    about: showAboutLink,
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
        //
        // The arithmetic stays on this element and does not move into a
        // :root property. A custom property substitutes at computed-value
        // time on the element it is declared on, so a clearance derived on
        // :root would resolve --back-to-top-bottom against :root and a page
        // overriding the input further down could not reach back into it.
        // Here it resolves against the footer, which is what a page wrapper
        // can still change.
        //
        // The strip is derived from the token and not from this footer's own
        // height, so nothing added inside changes the arithmetic.
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
            // text-sm at every width, where this used to step up below lg
            // only. Two reasons were recorded for the step and only the thumb
            // one was implemented: text-xs also let a destination read as fine
            // print, and that does not stop being true at 1024px. From lg
            // these three were drawn the same size as the small print beside
            // them, and they are the only way off a document that runs about
            // 67,000px. Nothing else moves with it: the 40px column gap was
            // measured in the sm-to-lg band, which was already text-sm, and
            // from lg the prose column tops out at max-w-3xl with hundreds of
            // pixels to spare.
            //
            // 24px between them, the same as the header's row and for the
            // same reason: "Najdena žival" carries a word space of its own,
            // and at 16px the gap between the two links was close enough to
            // it that the row read as one label rather than two.
            //
            // The vertical gap is 24px and not 8px, which only shows when the
            // row wraps: at 320px, or at a large text setting. These links
            // take the overlay rather than a drawn box, and globals.css says
            // what two overlays closer than their overhang do to each other.
            // A 20px line under a 44px overlay overhangs 12px, so two wrapped
            // rows need 24px between them or the lower row takes the upper
            // row's presses. Nothing changes while the row fits.
            className="flex shrink-0 flex-wrap gap-x-6 gap-y-6 text-sm"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                // The line boxes here run short of the 24px a finger needs.
                // Same treatment the rest of the small-link grammar uses
                // rather than padding, which would visibly inflate the row.
                className={cn(
                  FOOTER_LINK,
                  "max-lg:tap-target hover:underline",
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
        {/* The provenance note, then when it was last true, then the two
            things a reader can do about it. */}
        <div className="max-w-3xl space-y-2">
          <p>{messages.footer}</p>
          {/* When, beside where. The sentence above says the data is the
              shelters' and that adoption goes through them, and says nothing
              about how old the copy on the screen is.

              Its own line rather than the tail of the paragraph above, which
              wraps to three or four lines at phone width; a date appended to
              the end of that is a date nobody finds.

              registerDateLabel and not toLocaleDateString: it pins the time
              zone to UTC, so the footer and the poster print the same day for
              the same dataset near a boundary, it builds its two formatters
              once where this renders on every animal page in both locales,
              and lib/labels.test.ts fixes its output in both. */}
          {updatedAt && (
            <p>
              {interpolate(messages.footerUpdated, {
                date: registerDateLabel(updatedAt, locale),
              })}
            </p>
          )}
          {/* The correction route is here rather than only on /o-nas for the
              reason showFoundAnimalLink records above: a flow that lives on
              one page is unreachable for the person who needs it, and the
              person who spots a stale listing or an animal already home is on
              that animal's page. The address is printed as itself and not
              behind a word, the rule about-page.tsx records: a reader writing
              from their own mail client has to be able to read it off the
              page.

              A row and not a stack, and at phone width it wraps to two lines
              anyway: at 12px the Slovenian pair comes to about 470px against
              343px of content at 375. That is the wrap this can afford.
              Each is a drawn box below lg with no overhang to lend a
              neighbour, so the 8px a wrap leaves between them is enough,
              where two stacked overlays at that distance are the collision
              described on FOOTER_ACTION.

              One mark between them, on the repository link, and none on the
              address. The mark says which site the link opens, which is a
              thing a reader cannot read off "odprta koda"; an address says
              what it is by being one. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {showContact && (
              <span className="inline-flex flex-wrap items-center gap-x-1.5">
                {messages.footerContact}
                <a
                  href={mailtoHref(CONTACT_EMAIL)}
                  className={cn(FOOTER_LINK, FOOTER_ACTION)}
                >
                  {CONTACT_EMAIL}
                </a>
              </span>
            )}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              // Kept, knowing what it is: a title renders on pointer hover and
              // nowhere else, so this line reaches a desktop mouse and neither
              // touch nor the keyboard. A Tooltip would not fix that half and
              // would put a client boundary at the bottom of every document in
              // the export, this file being what PortalShell imports.
              title={messages.githubTitle}
              className={cn(FOOTER_LINK, FOOTER_ACTION)}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="size-3.5 shrink-0 fill-current"
              >
                <path d={GITHUB_MARK} />
              </svg>
              {/* One string where this used to be two catalogue keys printed
                  back to back, the second of them beginning with a comma. */}
              {messages.openSourceInvite}
              {/* The one link down here that leaves the site, and
                  target="_blank" says so to nobody, so the accessible name
                  does. Word for word what the shelter cards say, from the
                  catalogue now rather than three copies of the sentence. */}
              <span className="sr-only"> {messages.newWindow}</span>
            </a>
          </div>
          {/* Room under the row, below lg only, because that is the only width
              at which the credit draws an overlay. model-credit.tsx wears
              max-lg:tap-target, which reaches 12.25px above its own 19.5px
              line, and space-y-2 gives 8px. 16px here puts 24px between them,
              clear of the overhang.

              Room and not a taller credit. Growing that box is the other half
              of the rule in globals.css, but the credit is now the isolated
              control the overlay is for, and this footer can fix its own
              spacing without reaching into a component it only hosts. */}
          {children && <div className="max-lg:pt-4">{children}</div>}
        </div>
      </div>
    </footer>
  );
}
