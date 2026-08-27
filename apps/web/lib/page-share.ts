import type { Metadata } from "next";
import { getMessages, type Locale } from "@/lib/i18n";
import { type IndexRoute, ROUTES } from "@/lib/routes";
import { shareMetadata } from "@/lib/share-metadata";

/**
 * Metadata for the four pages that are not built from a record: the two
 * homepages, the two shelter indexes, the two resource lists and the two
 * found-animal pages. Everything else on the site describes one animal, one
 * shelter or one municipality, and lib/animal-share.ts, lib/shelter-share.ts
 * and lib/municipality-share.ts template those from the data.
 *
 * These four have no record to template from, so the copy is written out
 * below and handed to the same builder those three use,
 * lib/share-metadata.ts. No images: an animal has its share card and a
 * shelter has its map plate, and there is no picture of "the shelter index"
 * that would be worth more to a reader than the description.
 *
 * The addresses are not restated here. They are in lib/routes.ts with every
 * other paired route, which is where the header, the footer, the language
 * switcher and the sitemap read them from.
 */
export type IndexPage = IndexRoute;

type Copy = { title: string; description: string };

const copy: Record<Locale, Record<IndexPage, Copy>> = {
  sl: {
    home: {
      title: "Živali iz slovenskih zavetišč",
      description: getMessages("sl").metadataDescription,
    },
    shelters: {
      title: "Zavetišča",
      description:
        "Seznam slovenskih zavetišč za živali: katera z nami delijo strukturiran seznam živali z dovoljenjem in kje najdete kontaktne podatke za ostala.",
    },
    resources: {
      title: "Strokovno preverjeni viri",
      description:
        "Preverjeni veterinarski viri o prehrani, zdravju, vedenju in dobrobiti psov, mačk, kuncev in drugih hišnih živali.",
    },
    // Kept word for word from the page it was written on. The description
    // answers the searches this page exists for ("našel sem psa", "kdo pobere
    // zapuščeno žival") with the three facts that matter before the visitor
    // even lands: there is a responsible shelter, it is found by občina, and
    // the finder pays nothing.
    foundAnimal: {
      title: "Si našel žival?",
      description:
        "Vpiši občino ali poštno številko kraja, kjer si našel žival, in dobiš pristojno zavetišče s telefonsko številko. Odlov in oskrbo krije občina – najditelja ne stane nič.",
    },
  },
  en: {
    home: {
      title: "Animals from Slovenian shelters",
      description: getMessages("en").metadataDescription,
    },
    shelters: {
      title: "Shelters",
      description:
        "A list of Slovenian animal shelters: which ones share a structured animal list with us by permission, and where to find contact details for the rest.",
    },
    resources: {
      title: "Trusted animal-care resources",
      description:
        "Trusted veterinary resources about nutrition, health, behaviour and welfare for dogs, cats, rabbits and other companion animals.",
    },
    foundAnimal: {
      title: "Found an animal?",
      description:
        "Enter the municipality or postcode where you found the animal to get the responsible shelter and its phone number. The municipality covers capture and care – it costs the finder nothing.",
    },
  },
};

export function indexMetadata(page: IndexPage, locale: Locale): Metadata {
  const { title, description } = copy[locale][page];
  const paths = ROUTES[page];

  return shareMetadata({
    title,
    description,
    path: paths[locale],
    locale,
    languages: { sl: paths.sl, en: paths.en },
  });
}
