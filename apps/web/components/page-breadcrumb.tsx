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
    // The landmark's name, which the primitive hardcodes in English. Every
    // other landmark on the site is named from the catalogue, and this one is
    // announced on every page above the root: on a Slovenian document a
    // rotor read "Več informacij", "Povezave v nogi", then an English word.
    <Breadcrumb aria-label={messages.breadcrumbNav} className={className}>
      {/* The same trail, for machines. Emitted here rather than by each page
          so it is built from the array the crumbs are rendered from and the
          two can never drift. Next.js recommends structured data as a plain
          script tag in the page or layout, which is what JsonLd renders; the
          site's serializer escapes <, > and & so no name can close the tag. */}
      <JsonLd data={breadcrumbJsonLd([...crumbs, { label: current }])} />
      <BreadcrumbList>
        {/* The separator is a sibling of the item, not a child of it: both
            render as <li>, and an <li> inside an <li> is not a list. */}
        {/* Only the ancestors give way below sm. The animal page's trail is
            "Vse živali > Obalno zavetišče (Marjetica Koper) > Mila", which
            takes two lines at 390, and of the three crumbs the shelter is
            the one a reader recognises from its first words: the root says
            where the trail starts and the last crumb names the page they are
            standing on, so those two are never cut.

            The rule sits on a span inside the link rather than on the link
            itself, because truncate is overflow-hidden and the link carries
            max-lg:tap-target, whose ::after overhangs a 20px line box to
            reach 44px. Clipped to the link's own box, the press target on a
            phone shrinks back to the height of the text, which is exactly
            the screen this truncation is for.

            Nothing more is needed for the accessible name: a truncated link
            still has its whole label as its text content, and the ellipsis
            is the browser's drawing rather than part of the string. The
            JSON-LD above is built from the same array and none of this
            reaches it. */}
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            <BreadcrumbItem
              className={index === 0 ? undefined : "max-sm:min-w-0"}
            >
              <BreadcrumbLink href={crumb.href}>
                {index === 0 ? (
                  crumb.label
                ) : (
                  <span className="max-sm:block max-sm:max-w-40 max-sm:truncate">
                    {crumb.label}
                  </span>
                )}
              </BreadcrumbLink>
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
