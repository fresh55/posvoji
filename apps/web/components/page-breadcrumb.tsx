import { Fragment } from "react";
import { JsonLd } from "@/components/json-ld";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getMessages, type Locale } from "@/lib/i18n";
import { breadcrumbJsonLd } from "@/lib/shelter-jsonld";
import { homePath } from "@/lib/shelter-path";

/** One ancestor: what it is called and where it is. The page's own crumb is
 *  not one of these, because it is not a link. */
export type Crumb = { label: string; href: string };

/**
 * The trail every page above the root wears, in the slot the back link used
 * to sit in.
 *
 * One component rather than an anchor per page. Five pages used to link to the
 * root and called it three different things ("Živali za posvojitev", "Nazaj na
 * živali", "Vse živali") across two implementations, and the one written by
 * hand on the animal page dropped max-lg:tap-target, so the back link most
 * likely to be pressed on a phone was the only one under a finger wide. The
 * root is named once here and the rule is in one place.
 *
 * The root crumb is the animal grid, because that is what the root is. It goes
 * to a plain "/" and carries no filters: the referrer trick this replaced
 * existed to hand a visitor back their filtered grid, and the browser's own
 * back button does that better, on every page, without reading a header the
 * deploy may strip.
 */
export function PageBreadcrumb({
  locale,
  trail = [],
  current,
  className,
}: {
  locale: Locale;
  /** Ancestors between the root and this page, nearest the root first. */
  trail?: Crumb[];
  /** This page's own name. */
  current: string;
  className?: string;
}) {
  const messages = getMessages(locale);
  const crumbs: Crumb[] = [
    { label: messages.allAnimals, href: homePath(locale) },
    ...trail,
  ];

  return (
    <Breadcrumb className={className}>
      {/* The same trail, for machines. Emitted here rather than by each page
          so it is built from the array the crumbs are rendered from and the
          two can never drift. Next.js recommends structured data as a plain
          script tag in the page or layout, which is what JsonLd renders; the
          site's serializer escapes <, > and & so no name can close the tag. */}
      <JsonLd data={breadcrumbJsonLd([...crumbs, { label: current }])} />
      <BreadcrumbList>
        {/* The separator is a sibling of the item, not a child of it: both
            render as <li>, and an <li> inside an <li> is not a list. */}
        {crumbs.map((crumb) => (
          <Fragment key={crumb.href}>
            <BreadcrumbItem>
              <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
