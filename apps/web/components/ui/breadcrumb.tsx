import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// Where the page sits, rather than how to retreat from it.
//
// This replaced a back link that read document.referrer to rename itself. That
// link answered "where did you come from", which is a question the browser's
// own back button answers better and which a page reached from a search engine
// cannot answer at all. A trail answers "where am I", which is the same on
// every arrival, needs no client boundary, and is what the markup below says
// out loud: a nav, an ordered list, and aria-current on the page you are on.
//
// No "use client" anywhere in this file. Every label the site needs is known
// on the server, so the whole trail prerenders into the static export and
// nothing swaps after hydration.

function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  // The English literal is the registry's and is only a fallback: props are
  // spread after it, so a caller's aria-label wins. PageBreadcrumb passes the
  // catalogue's name, because a landmark left in English is read out with
  // Slovenian phonemes on every page above the root.
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      // flex-wrap, because the longest Slovenian trail runs past a 375px
      // screen and a trail that scrolls sideways is worse than one that takes
      // a second line.
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

function BreadcrumbLink({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="breadcrumb-link"
      // max-lg:tap-target for the same reason every other quiet link on the
      // site carries it: a 20px line of text is not a press target on a
      // phone. See lib/link-styles.ts, whose rule this matches.
      className={cn(
        "max-lg:tap-target rounded-ui underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The page the reader is on: named, and not a link to itself.
 *
 * Deviates from the registry, which puts role="link" and aria-disabled="true"
 * on this span. That said the opposite of the sentence above: the current
 * page's own name was announced in a links rotor on every inner page as a
 * dimmed link that could not be focused or followed. aria-current on a plain
 * span is the whole mechanism, and it is the one the portal's hand-rolled
 * trail uses too. A later `shadcn add breadcrumb` will offer the two
 * attributes back.
 */
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-medium text-foreground", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      // Decoration: the ordered list already carries the order, and a screen
      // reader announcing a chevron between every crumb is noise.
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
