"use client";

import { LogIn, Menu } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/lib/i18n";
import { CONTROL_FRAME } from "@/lib/link-styles";
import { siteLinks } from "@/lib/site-links";
import { cn } from "@/lib/utils";

// The footer's links, reachable from the top of the page. On the homepage the
// grid runs long under the reader, so the footer is a real distance away; the
// header is one press of back-to-top. Both surfaces draw from the same list
// in lib/site-links.ts and each decides what it prints, so a link added or
// renamed there reaches both and neither can drift.
//
// Two shapes, one per amount of room. Where the header can say the links it
// says them, and a word in plain sight beats a word behind an icon: a menu
// that has to be opened to be discovered halves its own use, and hiding nav a
// desktop could show is what it saves nothing to do. Where it cannot, every
// link folds into the dropdown, the login among them.

/* The two conditions, and the row has to pass both of them to say its links
   out loud.

   lg is the floor and it stays a media query. Below it the dropdown is the
   nav at every text size, which is most of this site's traffic, and a phone
   has no room for three links beside the switcher however small the type is.

   The second condition is the header row's own width measured in the reader's
   text rather than the window's (site-header.tsx carries the container,
   --container-nav-room in globals.css holds the figure and says how it was
   measured). At 200% text in a 1024px window lg is still true and the room is
   not there, which is the case this pair exists to tell apart.

   A matched pair, written here rather than at the two call sites, because the
   menu button has to arrive at exactly the width the row leaves: a width where
   both draw is two navs on one row, and one where neither does is a header
   with no way out of the page. */
const NAV_ROOM_SHOWS = "lg:@nav-room/header:flex";
const NAV_ROOM_HIDES = "lg:@nav-room/header:hidden";

/** Whether a link points at the page the header is already on.
 *
 *  Read off the language-switcher's own map rather than a prop of its own:
 *  the switcher needs this page's address in both locales, which is strictly
 *  more than "which page am I", so asking each page for the second thing as
 *  well only creates two values that can disagree after a route rename. */
function isCurrent(
  paths: Record<Locale, string> | undefined,
  locale: Locale,
  href: string,
): boolean {
  return paths?.[locale] === href;
}

// Inline links for lg and up: the roster entries flagged `inline`, which is
// fewer than the roster a visitor can see. "Viri" is hidden altogether in
// lib/site-links.ts, and the login to the far right is a door to a different
// site rather than a destination on this one. What is left are pages of
// their own that the header is the shortest way to from anywhere in the grid:
// the hero line only offers the found-animal page, and only on the homepage,
// and the footer is the length of the grid away. Muted until hovered, so the
// brand to their left stays the only thing in full ink up there.
export function SiteNav({ paths }: { paths?: Record<Locale, string> }) {
  const { locale, messages } = useI18n();
  const links = siteLinks(locale, messages).filter((link) => link.inline);

  return (
    <nav
      aria-label={messages.moreInformation}
      // No margin of its own any more: this sits beside the brand now, and
      // the gap that separates the two is the left group's, set where both
      // halves of it can be seen at once.
      //
      // 24px between the links, not the 16px this had while it held one link
      // and the number never had to separate anything. "Najdena žival" is two
      // words, and its own word space measures 3.95px at this size: at 16px
      // the boundary between the two links was only four times the boundary
      // inside one of them, and the row scanned as a single phrase. 24px puts
      // that at six to one, which is where the eye stops reading across.
      className={cn("hidden items-center gap-6", NAV_ROOM_SHOWS)}
    >
      {links.map((link) => {
        // The page the reader is already on. The footer has always dropped its
        // own link rather than offering it (site-footer.tsx's
        // showSheltersLink), and the header offering one anyway is the two
        // halves of the same site disagreeing about where the visitor is. It
        // stays in the row rather than disappearing, because a nav whose items
        // move between pages is harder to learn than one that marks the
        // current place; aria-current is what a screen reader reads off it,
        // and the weight and the ink are what everyone else sees.
        //
        // The weight is what carries it. Full ink alone is what this row
        // already gives a hovered link, so on a desktop with the pointer
        // anywhere in the row the current page and the link under the cursor
        // were drawn identically. A marker a hover can imitate marks nothing.
        const current = isCurrent(paths, locale, link.href);
        return (
          <a
            key={link.key}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "text-sm transition-colors hover:text-foreground",
              // 20px of line is what a link this size draws, and this row only
              // exists from lg, so on a touch tablet it was never sized for a
              // finger at any width: measured 65x20 at 1180 with touch. The
              // overlay grows the box and not the drawing, and nothing sits
              // inside its overhang here (24px between the links, 40px to the
              // brand, and the header row is taller than 44).
              "pointer-coarse:tap-target",
              current ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}

// The login, in the corner a login is looked for. Not in the row of
// destinations to its left: those are places on this site, this is the door
// to a different one, and the difference is worth a shape rather than a
// position. Outline and not a filled button, because the people it is for are
// a handful of staff and the rest of the header belongs to the visitors - it
// has to be findable by someone scanning for it, without being the loudest
// thing up there for everyone else.
//
// lg and up only. Below that the dropdown carries it, as it always has.
export function ShelterLogin() {
  const { locale, messages } = useI18n();
  const portal = siteLinks(locale, messages).find(
    (link) => link.key === "portal",
  );
  if (!portal) return null;

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      // 32px drawn at size sm, which is a mouse's button. On a coarse pointer
      // it is the only door to the portal on the page, so it takes the 44.
      className={cn(
        CONTROL_FRAME,
        "hidden font-normal text-muted-foreground pointer-coarse:h-11 hover:text-foreground lg:inline-flex",
      )}
    >
      {/* The whole phrase at every width it renders at, never "Prijava" on
          its own. On a site with no visitor accounts, a bare login in the
          corner is a question asked of the wrong person; the two words after
          it are what answer it before anyone clicks. There is room for them
          at every width the button renders at. */}
      <a href={portal.href} hrefLang={portal.hrefLang}>
        <LogIn className="size-4" aria-hidden />
        {portal.label}
      </a>
    </Button>
  );
}

// The same links as a dropdown, wherever the header has no room to say them
// beside the language switcher.
export function SiteMenu({ paths }: { paths?: Record<Locale, string> }) {
  const { locale, messages } = useI18n();
  const links = siteLinks(locale, messages);
  const quiet = links.filter((link) => link.quiet);
  const loud = links.filter((link) => !link.quiet);
  // What the header already says out loud beside this button, so the menu does
  // not say it again. Below lg this is the one door to the portal, which is
  // why it has always carried the login; from lg the outline button in the
  // corner draws it (ShelterLogin above), and this menu can now open at that
  // width too, where the row folded for room. The same word twice, a hand's
  // width apart, is the header asking the question twice.
  //
  // Keyed on the link and not on `quiet`, which means de-emphasised and could
  // one day be true of something the corner does not draw. A plain media query
  // and not the row's container query, because this content is portalled out
  // of the header and cannot see the header's container, and lg is exactly the
  // condition the button it would repeat turns on.
  const alsoInTheHeader = quiet
    .filter((link) => link.key === "portal")
    .map((link) => link.key);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={messages.menu}
          // 36px drawn and 44 to press: tap-target grows the box and not the
          // icon, and that has to hold at every width this now draws at.
          className={cn("tap-target", NAV_ROOM_HIDES)}
        >
          <Menu className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {/* Marked here too. Below lg this dropdown is the whole nav, which is
            most of this site's traffic, and a menu that offers the page you
            are reading is the same disagreement the inline row above fixed. */}
        {loud.map((link) => (
          <DropdownMenuItem key={link.key} asChild className="min-h-11">
            <a
              href={link.href}
              aria-current={
                isCurrent(paths, locale, link.href) ? "page" : undefined
              }
              className={
                isCurrent(paths, locale, link.href) ? "font-medium" : undefined
              }
            >
              {link.label}
            </a>
          </DropdownMenuItem>
        ))}
        {/* The rule stays for as long as it has something under it to
            separate. */}
        {quiet.length > 0 && (
          <DropdownMenuSeparator
            className={cn(
              alsoInTheHeader.length === quiet.length && "lg:hidden",
            )}
          />
        )}
        {quiet.map((link) => (
          <DropdownMenuItem
            key={link.key}
            asChild
            className={cn(
              "min-h-11 text-muted-foreground",
              alsoInTheHeader.includes(link.key) && "lg:hidden",
            )}
          >
            <a href={link.href} hrefLang={link.hrefLang}>{link.label}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
