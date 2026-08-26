import type { Metadata } from "next";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages, type Locale } from "@/lib/i18n";

/**
 * Metadata for the four pages that are not built from a record: the two
 * homepages, the two shelter indexes, the two resource lists and the two
 * found-animal pages. Everything else on the site describes one animal, one
 * shelter or one municipality, and lib/animal-share.ts, lib/shelter-share.ts
 * and lib/municipality-share.ts template those from the data.
 *
 * These four have no record to template from, so the copy is written out
 * below. It is the same shape those three modules produce: a title, a
 * description, a canonical path, the other language's copy of the same page,
 * and an Open Graph block. No images: an animal has its share card and a
 * shelter has its map plate, and there is no picture of "the shelter index"
 * that would be worth more to a reader than the description.
 */
export type IndexPage = "home" | "shelters" | "resources" | "foundAnimal";

const PATHS: Record<IndexPage, Record<Locale, string>> = {
  home: { sl: "/", en: "/en" },
  shelters: { sl: "/zavetisca", en: "/en/shelters" },
  resources: { sl: "/viri", en: "/en/resources" },
  foundAnimal: FOUND_ANIMAL_PATHS,
};

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

export function indexPagePath(page: IndexPage, locale: Locale): string {
  return PATHS[page][locale];
}

export function indexMetadata(page: IndexPage, locale: Locale): Metadata {
  const { title, description } = copy[locale][page];
  const path = PATHS[page][locale];

  return {
    title: `${title} | Posvoji.si`,
    description,
    alternates: {
      canonical: path,
      languages: { sl: PATHS[page].sl, en: PATHS[page].en },
    },
    openGraph: {
      type: "website",
      siteName: "Posvoji.si",
      locale: locale === "sl" ? "sl_SI" : "en_GB",
      title,
      description,
      url: path,
    },
    twitter: { card: "summary", title, description },
  };
}
