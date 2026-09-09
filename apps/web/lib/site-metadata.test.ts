import { describe, expect, it } from "vitest";
import { getMessages } from "@/lib/i18n";
import {
  localeAlternates,
  rootMetadata,
  rootViewport,
  staticPageMetadata,
} from "@/lib/site-metadata";

// Next's Twitter metadata is a union keyed on `card`, so the field is not
// readable off the union itself. The card is what these assertions are about,
// so they read it through the one shape that has it.
function twitterCard(meta: ReturnType<typeof staticPageMetadata>): string | undefined {
  return (meta.twitter as { card?: string } | null | undefined)?.card;
}

const paths = { sl: "/viri", en: "/en/resources" };

const languages = { ...paths, "x-default": "/viri" };

describe("rootMetadata", () => {
  // Every page in the tree hands back a bare title and relies on this to
  // finish it, so the template is the contract between the two.
  it("finishes every page's title with the site's name", () => {
    expect(rootMetadata("sl").title).toEqual({
      template: "%s | Posvoji.si",
      default: "Posvoji.si",
    });
  });

  it("describes the site in the language the root renders", () => {
    expect(rootMetadata("sl").description).toBe(
      getMessages("sl").metadataDescription,
    );
    expect(rootMetadata("en").description).toBe(
      getMessages("en").metadataDescription,
    );
  });

  it("resolves relative preview urls against the site", () => {
    expect(String(rootMetadata("sl").metadataBase)).toBe("https://posvoji.si/");
  });
});

describe("rootViewport", () => {
  // A single colour would leave one of the two themes with a toolbar that does
  // not match the page. The site follows the OS preference and has no toggle,
  // so the pair is the answer rather than a value the page could switch.
  it("names a theme colour for each scheme", () => {
    expect(rootViewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    ]);
  });
});

describe("localeAlternates", () => {
  it("makes the rendered language canonical and names both", () => {
    expect(localeAlternates(paths, "sl")).toEqual({
      canonical: "/viri",
      languages,
    });
    expect(localeAlternates(paths, "en")).toEqual({
      canonical: "/en/resources",
      languages,
    });
  });

  // The half a reader of neither language is sent to. Slovenian owns the
  // unprefixed routes, so it is the version that targets nobody in
  // particular; app/sitemap.ts publishes the same answer.
  it("sends a reader of neither language to the Slovenian half", () => {
    expect(localeAlternates(paths, "en").languages?.["x-default"]).toBe("/viri");
  });
});

describe("staticPageMetadata", () => {
  const meta = staticPageMetadata({
    locale: "sl",
    paths,
    title: "Viri",
    description: "Preverjeni viri.",
  });

  // Bare everywhere. The root layout's template appends "| Posvoji.si" to the
  // head's title, and the previews keep the page's own name because
  // og:site_name already carries the site's.
  it("names the page and spells the site nowhere", () => {
    expect(meta.title).toBe("Viri");
    expect(meta.openGraph?.title).toBe("Viri");
    expect((meta.twitter as { title?: string }).title).toBe("Viri");
  });

  it("points at itself and at the other language", () => {
    expect(meta.alternates?.canonical).toBe("/viri");
    expect(meta.alternates?.languages).toEqual(languages);
    expect(meta.openGraph?.url).toBe("/viri");
  });

  it("describes the page the same way everywhere", () => {
    expect(meta.description).toBe("Preverjeni viri.");
    expect(meta.openGraph?.description).toBe("Preverjeni viri.");
    expect((meta.twitter as { description?: string }).description).toBe(
      "Preverjeni viri.",
    );
  });

  it("says which language the preview is in", () => {
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: "Posvoji.si",
      locale: "sl_SI",
    });
    expect(
      staticPageMetadata({
        locale: "en",
        paths,
        title: "Resources",
        description: "Trusted resources.",
      }).openGraph,
    ).toMatchObject({ locale: "en_GB", url: "/en/resources" });
  });

  // Before the site card was drawn these pages emitted no og:image at all,
  // and a link to any of them pasted into a chat rendered as a bare row of
  // text. The alt is the reader's language even though the card itself is
  // Slovenian in both.
  it("falls back to the site card", () => {
    expect(meta.openGraph?.images).toEqual([
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: expect.stringContaining("zavetišč"),
      },
    ]);
    expect(twitterCard(meta)).toBe("summary_large_image");

    const en = staticPageMetadata({
      locale: "en",
      paths,
      title: "Resources",
      description: "Trusted resources.",
    });
    expect(en.openGraph?.images).toEqual([
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: expect.stringContaining("Slovenian shelters"),
      },
    ]);
  });

  describe("given a page with a picture of its own", () => {
    const image = {
      url: "/models/our-cat/share.jpg",
      width: 1200,
      height: 630,
      alt: "Srečko, bel maček s sivimi lisami in enim očesom.",
    };
    const withImage = staticPageMetadata({
      locale: "sl",
      paths,
      title: "O nas",
      description: "Kdo smo.",
      image,
    });

    // The dimensions and the alt are as load-bearing as the url: a scraper
    // that has to fetch the file to learn its size falls back to the small
    // card, and a preview with no alt says nothing to a screen reader.
    it("states the picture in full", () => {
      expect(withImage.openGraph?.images).toEqual([image]);
    });

    it("asks for the large card and shows the same picture on it", () => {
      expect(twitterCard(withImage)).toBe("summary_large_image");
      expect((withImage.twitter as { images?: unknown }).images).toEqual([image]);
    });
  });
});
