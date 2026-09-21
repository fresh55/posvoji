"use client";

import { LogIn, Menu } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/lib/i18n";
import { siteLinks } from "@/lib/site-links";
import { cn } from "@/lib/utils";

// Show inline links at lg when the container also has room for enlarged text.
// Hide the menu under the same conditions to avoid gaps or duplicate navigation.
const NAV_ROOM_SHOWS = "lg:@nav-room/header:flex";
const NAV_ROOM_HIDES = "lg:@nav-room/header:hidden";

/** Match complete path segments; the homepage is not a parent section. */
function navigationState(
  path: string | undefined,
  href: string,
): "page" | "section" | undefined {
  if (path === href) return "page";
  if (href !== "/" && href !== "/en" && path?.startsWith(`${href}/`)) {
    return "section";
  }
}

// A dotted underline identifies a parent section without imitating either
// the current page's weight or the hover colour.
const SECTION_LINK = "underline decoration-dotted underline-offset-4";

export function SiteNav({ paths }: { paths?: Record<Locale, string> }) {
  const { locale, messages } = useI18n();
  const links = siteLinks(locale, messages).filter((link) => link.inline);

  return (
    <nav
      aria-label={messages.moreInformation}
      className={cn("hidden items-center gap-6", NAV_ROOM_SHOWS)}
    >
      {links.map((link) => {
        const state = navigationState(paths?.[locale], link.href);
        return (
          <a
            key={link.key}
            href={link.href}
            aria-current={state === "page" ? "page" : undefined}
            className={cn(
              "text-sm transition-colors hover:text-foreground",
              // Enlarge touch targets without changing the visible spacing.
              "pointer-coarse:tap-target",
              state === "page" ? "font-medium text-foreground" : "text-muted-foreground",
              state === "section" && SECTION_LINK,
            )}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}

// Below lg, SiteMenu carries the shelter login.
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
      className="hidden font-normal text-muted-foreground pointer-coarse:h-11 hover:text-foreground lg:inline-flex"
    >
      <a href={portal.href} hrefLang={portal.hrefLang}>
        <LogIn className="size-4" aria-hidden />
        {portal.label}
      </a>
    </Button>
  );
}

// Shares its link definitions with the inline nav and footer.
export function SiteMenu({ paths }: { paths?: Record<Locale, string> }) {
  const { locale, messages } = useI18n();
  const links = siteLinks(locale, messages);
  const secondaryLinks = links.filter((link) => link.quiet);
  const primaryLinks = links.filter((link) => !link.quiet);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={messages.menu}
          className={cn("tap-target", NAV_ROOM_HIDES)}
        >
          <Menu className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {primaryLinks.map((link) => {
          const state = navigationState(paths?.[locale], link.href);
          return (
            <DropdownMenuItem key={link.key} asChild className="min-h-11">
              <a
                href={link.href}
                aria-current={state === "page" ? "page" : undefined}
                className={cn(
                  state === "page" && "font-medium",
                  state === "section" && SECTION_LINK,
                )}
              >
                {link.label}
              </a>
            </DropdownMenuItem>
          );
        })}
        {/* ShelterLogin replaces the portal item at lg. Hide the separator
            there too if no other quiet links remain. */}
        {secondaryLinks.length > 0 && (
          <DropdownMenuSeparator
            className={cn(
              secondaryLinks.every((link) => link.key === "portal") && "lg:hidden",
            )}
          />
        )}
        {/* No text-muted-foreground here, although these are the quiet links.
            Grey text under a separator is the shape a disabled menu item has,
            and "Prijava za zavetišča" is the one item in this menu a shelter
            is looking for. The separator above already demotes the group, and
            it does it without borrowing the disabled state's only signal. The
            lg button keeps its muted colour: a frame around a control says
            "press me" on its own, where a bare menu row has nothing else. */}
        {secondaryLinks.map((link) => (
          <DropdownMenuItem
            key={link.key}
            asChild
            className={cn("min-h-11", link.key === "portal" && "lg:hidden")}
          >
            <a href={link.href} hrefLang={link.hrefLang}>
              {link.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
