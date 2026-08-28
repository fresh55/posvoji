import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  cardText,
  photoSourceFor,
  renderPhotoCard,
  renderTypographicCard,
  shareCardFile,
  shareCardUrlFor,
  writeShareCards,
} from "./share-cards";

const REFERENCE = new Date("2026-08-19T06:00:00Z");

function animal(overrides: Partial<Animal> & { id: string }): Animal {
  return {
    source: {
      providerId: "macja-hisa",
      sourceUrl: `https://example.si/${overrides.id}`,
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: "macja-hisa", name: "Zavetišče Mačja hiša", city: "Celje" },
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...overrides,
  };
}

async function photoFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 140, b: 90 },
    },
  })
    .webp()
    .toBuffer();
}

describe("cardText", () => {
  it("names an unnamed animal in the card's own language", () => {
    const a = animal({ id: "x" });
    expect(cardText(a, "sl", REFERENCE).name).toBe("Brez imena");
    expect(cardText(a, "en", REFERENCE).name).toBe("Unnamed");
  });

  it("counts age from the dataset's build time, in both languages", () => {
    const a = animal({ id: "x", birthDate: "2024-08-10", name: "Rex" });
    expect(cardText(a, "sl", REFERENCE).age).toBe("2 leti");
    expect(cardText(a, "en", REFERENCE).age).toBe("2 years");
  });

  it("follows the Slovenian dual the way the site does", () => {
    const at = (months: number) =>
      cardText(
        animal({ id: "x", approximateAgeMonths: months }),
        "sl",
        REFERENCE,
      ).age;
    expect(at(1)).toBe("1 mesec");
    expect(at(2)).toBe("2 meseca");
    expect(at(3)).toBe("3 meseci");
    expect(at(4)).toBe("4 meseci");
    expect(at(7)).toBe("7 mesecev");
    expect(at(12)).toBe("1 leto");
    expect(at(24)).toBe("2 leti");
    expect(at(36)).toBe("3 leta");
    expect(at(60)).toBe("5 let");
  });

  it("leaves age out when the dataset does not know it", () => {
    expect(cardText(animal({ id: "x" }), "sl", REFERENCE).age).toBeUndefined();
  });
});

describe("shareCardFile", () => {
  it("keeps a provider-prefixed id usable as a file name", () => {
    expect(shareCardFile("muri:16836")).toBe("muri_16836.jpg");
    expect(shareCardFile("muri:16836", "en")).toBe("muri_16836.en.jpg");
  });

  it("serves the files from the site's media directory", () => {
    expect(shareCardUrlFor("muri_16836.jpg")).toBe("/media/share/muri_16836.jpg");
  });
});

describe("share card rendering", () => {
  it("draws a photo card at the size the platforms crop from", async () => {
    const card = await renderPhotoCard(await photoFixture(600, 900), {
      name: "Čoko-Lina",
      species: "Pes",
      age: "4 leta",
      shelter: "Zavod Muri",
      city: "Vransko",
    });
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it("draws a typographic card at the same size", async () => {
    const card = await renderTypographicCard(
      {
        name: "Lia",
        species: "Pes",
        age: "3 leta",
        shelter: "Zavetišče Zonzani",
        city: "Koper",
      },
      "dog",
    );
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });
});

describe("photoSourceFor", () => {
  let mediaDir: string;

  beforeEach(async () => {
    mediaDir = mkdtempSync(join(tmpdir(), "posvoji-media-"));
    writeFileSync(join(mediaDir, "abc.webp"), await photoFixture(400, 300));
  });

  afterEach(() => rmSync(mediaDir, { recursive: true, force: true }));

  it("uses our own cached copy", () => {
    const a = animal({
      id: "x",
      images: [
        {
          sourceUrl: "https://example.si/a.jpg",
          cachedUrl: "/media/animals/abc.webp",
          rights: "cache-permitted",
        },
      ],
    });
    expect(photoSourceFor(a, mediaDir)).toBe(join(mediaDir, "abc.webp"));
  });

  it("refuses a photo we are only allowed to display", () => {
    const a = animal({
      id: "x",
      images: [
        {
          sourceUrl: "https://example.si/a.jpg",
          cachedUrl: "/media/animals/abc.webp",
          rights: "display-permitted",
        },
      ],
    });
    expect(photoSourceFor(a, mediaDir)).toBeUndefined();
  });

  it("takes no photo from behind a display-permitted lead", () => {
    // The page leads with the photo it may only hotlink, so a card drawn from
    // the cached photo below it would show something the site never shows.
    const a = animal({
      id: "x",
      images: [
        { sourceUrl: "https://example.si/lead.jpg", rights: "display-permitted" },
        {
          sourceUrl: "https://example.si/second.jpg",
          cachedUrl: "/media/animals/abc.webp",
          rights: "cache-permitted",
        },
      ],
    });
    expect(photoSourceFor(a, mediaDir)).toBeUndefined();
  });

  it("skips a lead the site would not draw at all", () => {
    const a = animal({
      id: "x",
      images: [
        { sourceUrl: "https://example.si/unknown.jpg", rights: "unknown" },
        {
          sourceUrl: "https://example.si/lead.jpg",
          cachedUrl: "/media/animals/abc.webp",
          rights: "cache-permitted",
        },
      ],
    });
    expect(photoSourceFor(a, mediaDir)).toBe(join(mediaDir, "abc.webp"));
  });

  it("ignores a cached copy that is no longer on disk", () => {
    const a = animal({
      id: "x",
      images: [
        {
          sourceUrl: "https://example.si/gone.jpg",
          cachedUrl: "/media/animals/gone.webp",
          rights: "cache-permitted",
        },
      ],
    });
    expect(photoSourceFor(a, mediaDir)).toBeUndefined();
  });
});

describe("writeShareCards", () => {
  let mediaDir: string;
  let cardsDir: string;
  let manifestPath: string;

  const withPhoto = animal({
    id: "macja-hisa:1",
    name: "Zvezdica",
    images: [
      {
        sourceUrl: "https://example.si/1.jpg",
        cachedUrl: "/media/animals/abc.webp",
        rights: "cache-permitted",
      },
    ],
  });
  const factsOnly = animal({
    id: "zonzani:2",
    name: "Lia",
    species: "dog",
    shelter: { id: "zonzani", name: "Zavetišče Zonzani", city: "Koper" },
    images: [
      {
        sourceUrl: "https://example.si/2.jpg",
        rights: "display-permitted",
      },
    ],
  });

  beforeEach(async () => {
    mediaDir = mkdtempSync(join(tmpdir(), "posvoji-media-"));
    cardsDir = mkdtempSync(join(tmpdir(), "posvoji-cards-"));
    manifestPath = join(
      mkdtempSync(join(tmpdir(), "posvoji-manifest-")),
      "share-cards.json",
    );
    writeFileSync(join(mediaDir, "abc.webp"), await photoFixture(600, 900));
  });

  afterEach(() => {
    rmSync(mediaDir, { recursive: true, force: true });
    rmSync(cardsDir, { recursive: true, force: true });
  });

  const run = (animals: Animal[]) =>
    writeShareCards(animals, {
      cardsDir,
      manifestPath,
      mediaDir,
      reference: REFERENCE,
    });

  it("gives a photo animal one card and a facts-only animal one per language", async () => {
    const result = await run([withPhoto, factsOnly]);

    expect(result.written).toBe(2);
    expect(readdirSync(cardsDir).sort()).toEqual([
      "macja-hisa_1.jpg",
      "zonzani_2.en.jpg",
      "zonzani_2.sl.jpg",
    ]);
  });

  it("redraws nothing on a second run", async () => {
    await run([withPhoto, factsOnly]);
    const again = await run([withPhoto, factsOnly]);

    expect(again).toEqual({ written: 0, reused: 2, deleted: 0 });
  });

  it("redraws when a fact on the card changed", async () => {
    await run([withPhoto, factsOnly]);
    const renamed = { ...factsOnly, name: "Lija" };
    const again = await run([withPhoto, renamed]);

    expect(again.written).toBe(1);
    expect(again.reused).toBe(1);
  });

  it("redraws when the shelter photo changed", async () => {
    await run([withPhoto]);
    writeFileSync(join(mediaDir, "abc.webp"), await photoFixture(500, 500));
    const moved = {
      ...withPhoto,
      images: [{ ...withPhoto.images[0]!, cachedUrl: "/media/animals/def.webp" }],
    };
    writeFileSync(join(mediaDir, "def.webp"), await photoFixture(500, 500));
    const again = await run([moved]);

    expect(again.written).toBe(1);
  });

  it("sweeps the cards of animals that left the dataset", async () => {
    await run([withPhoto, factsOnly]);
    const again = await run([withPhoto]);

    expect(again.deleted).toBe(2);
    expect(readdirSync(cardsDir)).toEqual(["macja-hisa_1.jpg"]);
  });

  it("records what it drew so the next run can skip it", async () => {
    await run([withPhoto, factsOnly]);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(Object.keys(manifest.entries).sort()).toEqual([
      "macja-hisa:1",
      "zonzani:2",
    ]);
    expect(manifest.entries["zonzani:2"].files).toEqual([
      "zonzani_2.sl.jpg",
      "zonzani_2.en.jpg",
    ]);
  });

  it("keeps every card when the manifest was lost", async () => {
    await run([withPhoto, factsOnly]);
    const before = readdirSync(cardsDir).sort();

    // Without the manifest every card looks like an orphan, and an animal
    // whose card fails to draw this run would lose the card it had.
    rmSync(manifestPath);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const again = await run([]);
    warn.mockRestore();

    expect(again.deleted).toBe(0);
    expect(readdirSync(cardsDir).sort()).toEqual(before);
  });

  it("keeps going when one animal's photo cannot be read", async () => {
    writeFileSync(join(mediaDir, "broken.webp"), "not an image");
    const broken = {
      ...withPhoto,
      id: "macja-hisa:broken",
      images: [
        { ...withPhoto.images[0]!, cachedUrl: "/media/animals/broken.webp" },
      ],
    };
    const result = await run([broken, factsOnly]);

    expect(result.written).toBe(1);
    expect(existsSync(join(cardsDir, "macja-hisa_broken.jpg"))).toBe(false);
    expect(existsSync(join(cardsDir, "zonzani_2.sl.jpg"))).toBe(true);
  });
});
