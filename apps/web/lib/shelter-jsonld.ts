import { telNumber } from "@/lib/contact-links";
import type { Locale } from "@/lib/i18n";
import { shelterPath, sheltersIndexPath } from "@/lib/shelter-path";
import type { ShelterRegistryEntry } from "@/lib/shelters";
import { SITE_URL } from "@/lib/site";

/** What a builder here may put in a node. Narrower than unknown so a value that
 *  cannot survive JSON.stringify never reaches the serialiser. */
export type JsonLdValue =
  | string
  | number
  | boolean
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue };

export type JsonLdNode = { readonly [key: string]: JsonLdValue };

const SCHEMA_CONTEXT = "https://schema.org";

function absolute(path: string): string {
  return `${SITE_URL}${path}`;
}

const listName = {
  sl: "Zavetišča po Sloveniji",
  en: "Shelters across Slovenia",
} satisfies Record<Locale, string>;

/**
 * The trail a page draws, as the structured data that says the same thing.
 *
 * Built from the very list the breadcrumb renders, so the two cannot disagree
 * about where a page sits: a crumb the reader sees and an item Google reads
 * come out of one array. The last item is the page itself and carries no url,
 * which is what tells a consumer it is the current position rather than
 * another link.
 */
export function breadcrumbJsonLd(
  crumbs: readonly { label: string; href?: string }[],
): JsonLdNode {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: absolute(crumb.href) } : {}),
    })),
  };
}

/**
 * The registry fields a JSON-LD node is allowed to read. `notes` is internal
 * working prose about permissions and is not in this type, so no builder here
 * can emit it even by spreading an entry.
 */
type ShelterFacts = Pick<
  ShelterRegistryEntry,
  "id" | "name" | "city" | "website" | "email" | "phone"
>;

/**
 * The shelters index as an ItemList of links to the detail pages.
 *
 * Items carry position and url and nothing else. Each shelter's own page
 * already publishes the full AnimalShelter node, so embedding a second copy
 * here would put the same facts at two addresses with no way to keep them
 * agreeing; this is also the shape Google documents for a summary page whose
 * entries have detail pages of their own.
 *
 * The order is the caller's. The list says what the page shows in the order the
 * page shows it, so nothing is sorted here.
 *
 * inLanguage is not a property of ItemList, so the language sits on the page
 * the list is the main entity of, which is where schema.org defines it.
 */
export function shelterListJsonLd(
  shelters: readonly Pick<ShelterFacts, "id">[],
  locale: Locale,
): JsonLdNode {
  const pageUrl = absolute(sheltersIndexPath(locale));
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "ItemList",
    "@id": `${pageUrl}#shelters`,
    name: listName[locale],
    numberOfItems: shelters.length,
    mainEntityOfPage: {
      "@type": "CollectionPage",
      "@id": pageUrl,
      url: pageUrl,
      inLanguage: locale,
    },
    itemListElement: shelters.map((shelter, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(shelterPath(shelter.id, locale)),
    })),
  };
}

/**
 * One shelter as an AnimalShelter node, the schema.org subtype of LocalBusiness
 * for exactly this (Thing > Organization > LocalBusiness > AnimalShelter).
 *
 * Institutional contacts only, and every absent field is left out rather than
 * emitted empty: a blank telephone is a claim that the shelter has no phone.
 */
export function shelterJsonLd(
  shelter: ShelterFacts,
  locale: Locale,
): JsonLdNode {
  const url = absolute(shelterPath(shelter.id, locale));
  const node: Record<string, JsonLdValue> = {
    "@context": SCHEMA_CONTEXT,
    "@type": "AnimalShelter",
    "@id": `${url}#shelter`,
    name: shelter.name,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
      url,
      inLanguage: locale,
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: shelter.city,
      addressCountry: "SI",
    },
  };
  if (shelter.website) node.sameAs = [shelter.website];
  // E.164, not the grouped national form the register writes and the page
  // prints. This value is read by machines rather than by the visitor, and a
  // consumer that dials it has no way to know which country's numbering plan
  // "03 749 06 00" belongs to. Schema.org says as much, and it is the same
  // reason the card's tel: href carries a country code (lib/contact-links.ts).
  if (shelter.phone) node.telephone = telNumber(shelter.phone);
  if (shelter.email) node.email = shelter.email;
  return node;
}

/**
 * A node as the text of a <script type="application/ld+json">.
 *
 * JSON.stringify alone is not enough inside an HTML element: a "</script>" in
 * any string value would close the tag and everything after it would parse as
 * markup. Escaping the three characters that can start a tag or an entity
 * leaves valid JSON, because < and friends are ordinary JSON escapes that
 * any parser reads back as the original characters.
 */
export function serializeJsonLd(node: JsonLdNode): string {
  return JSON.stringify(node)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
