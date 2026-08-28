"use client";

import { Menu } from "lucide-react";
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
// header is one press of back-to-top. Both surfaces draw the same list from
// lib/site-links.ts, so neither ever knows a link the other does not.
//
// Two shapes, one per width. From lg the header has room to just say the
// links, and three words in plain sight beat three words behind an icon: a
// menu that has to be opened to be discovered halves its own use, and hiding
// nav a desktop could show is what it saves nothing to do. Below lg the same
// links fold into the dropdown. The portal login is dropdown- and
// footer-only at every width: shelter staff know where it is, and the header
// line is for the visitors.

// Inline links for lg and up, worded short: the full "Strokovno preverjeni
// viri" is a trust claim the footer keeps; up here it would be a sentence in
// a row of words. Same quiet grammar as the GitHub link beside it.
export function SiteNav() {
  const { locale, messages } = useI18n();
  const links = siteLinks(locale, messages).filter((link) => !link.quiet);

  return (
    <nav
      aria-label={messages.moreInformation}
      // me-2 on top of the cluster's gap-3: links stand 16px apart, so the
      // seam between this group and the language switcher has to be wider
      // than that, or the last link reads as belonging to the pills beside
      // it rather than to its own row.
      className="me-2 hidden items-center gap-4 lg:flex"
    >
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {link.key === "resources" ? messages.resourcesShort : link.label}
        </a>
      ))}
    </nav>
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
          aria-label={messages.moreInformation}
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
