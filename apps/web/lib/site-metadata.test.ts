import { describe, expect, it } from "vitest";
import { localeAlternates, staticPageMetadata } from "@/lib/site-metadata";

// Next's Twitter metadata is a union keyed on `card`, so the field is not
// readable off the union itself. The card is what these assertions are about,
// so they read it through the one shape that has it.
function twitterCard(meta: ReturnType<typeof staticPageMetadata>): string | undefined {
  return (meta.twitter as { card?: string } | null | undefined)?.card;
}

const paths = { sl: "/viri", en: "/en/resources" };

describe("localeAlternates", () => {
  it("makes the rendered language canonical and names both", () => {
    expect(localeAlternates(paths, "sl")).toEqual({
      canonical: "/viri",
      languages: paths,
    });
    expect(localeAlternates(paths, "en")).toEqual({
      canonical: "/en/resources",
      languages: paths,
    });
  });
});

describe("staticPageMetadata", () => {
  const meta = staticPageMetadata({
    locale: "sl",
    paths,
    title: "Viri",
    description: "Preverjeni viri.",
  });

  it("appends the site to the head's title and leaves the previews bare", () => {
    expect(meta.title).toBe("Viri | Posvoji.si");
    expect(meta.openGraph?.title).toBe("Viri");
    expect((meta.twitter as { title?: string }).title).toBe("Viri");
  });

  it("points at itself and at the other language", () => {
    expect(meta.alternates?.canonical).toBe("/viri");
    expect(meta.alternates?.languages).toEqual(paths);
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

  it("takes the plain summary card, having no image to show", () => {
    expect(meta.openGraph?.images).toBeUndefined();
    expect(twitterCard(meta)).toBe("summary");
  });
});
