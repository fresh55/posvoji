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
import { siteLinks } from "@/lib/site-links";

// The footer's links, reachable from the top of the page. On the homepage the
// grid runs long under the reader, so the footer is a real distance away; the
// header is one press of back-to-top. Both surfaces draw from the same list
// in lib/site-links.ts and each decides what it prints, so a link added or
// renamed there reaches both and neither can drift.
//
// Two shapes, one per width. From lg the header has room to just say the
// links, and a word in plain sight beats a word behind an icon: a menu that
// has to be opened to be discovered halves its own use, and hiding nav a
// desktop could show is what it saves nothing to do. Below lg every link
// folds into the dropdown, the login among them.

// Inline links for lg and up. Two of them, which is the whole roster a
// visitor can see: "Viri" is hidden for now in lib/site-links.ts, and the
// login to the far right is a door to a different site rather than a
// destination on this one. "Zavetišča" and "Najdena žival" are both pages of
// their own, and the header is the shortest way to either from anywhere in
// the grid - the hero line only offers the second one on the homepage, and
// the footer is the length of the grid away. Muted until hovered, so the
// brand to their left stays the only thing in full ink up there.
export function SiteNav() {
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
      className="hidden items-center gap-6 lg:flex"
    >
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {link.label}
        </a>
      ))}
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
      className="hidden font-normal text-muted-foreground hover:text-foreground lg:inline-flex"
    >
      {/* The whole phrase at every width it renders at, never "Prijava" on
          its own. On a site with no visitor accounts, a bare login in the
          corner is a question asked of the wrong person; the two words after
          it are what answer it before anyone clicks. There is room for them
          at every width the button renders at. */}
      <a href={portal.href}>
        <LogIn className="size-4" aria-hidden />
        {portal.label}
      </a>
    </Button>
  );
}

// The same links as a dropdown, below lg only, where the header genuinely
// has no room for them beside the language switcher.
export function SiteMenu() {
  const { locale, messages } = useI18n();
  const links = siteLinks(locale, messages);
  const quiet = links.filter((link) => link.quiet);
  const loud = links.filter((link) => !link.quiet);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={messages.menu}
          className="tap-target lg:hidden"
        >
          <Menu className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {loud.map((link) => (
          <DropdownMenuItem key={link.key} asChild className="min-h-11">
            <a href={link.href}>{link.label}</a>
          </DropdownMenuItem>
        ))}
        {quiet.length > 0 && <DropdownMenuSeparator />}
        {quiet.map((link) => (
          <DropdownMenuItem
            key={link.key}
            asChild
            className="min-h-11 text-muted-foreground"
          >
            <a href={link.href}>{link.label}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
