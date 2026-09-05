import assert from "node:assert/strict";
import { collectMediaReferences } from "./media-references.mjs";

const snapshot = collectMediaReferences(
  {
    generatedAt: "2026-09-01T00:00:00.000Z",
    animals: [
      {
        id: "shelter:rex",
        images: [
          {
            rights: "cache-permitted",
            cachedUrl: "/media/animals/hash.webp",
            widths: [320, 1280],
            avif: true,
          },
          {
            rights: "display-permitted",
            cachedUrl: "/media/animals/must-not-publish.webp",
          },
          {
            rights: "cache-permitted",
            cachedUrl: "https://shelter.example/rex.webp",
          },
        ],
      },
    ],
  },
  { entries: { "shelter:rex": { files: ["rex-sl.png", "rex-en.png"] } } },
  { entries: { shelter: { file: "shelter.svg" } } },
);

assert.deepEqual([...snapshot.referenced.keys()].sort(), [
  "animals/hash-320.webp",
  "animals/hash.avif",
  "animals/hash.thumb.webp",
  "animals/hash.webp",
  "share/rex-en.png",
  "share/rex-sl.png",
  "shelter-logos/shelter.svg",
]);
assert.equal(snapshot.photos, 2);
assert.equal(snapshot.shareCards, 1);
assert.equal(snapshot.shelterLogos, 1);

const emptySnapshot = collectMediaReferences(
  { generatedAt: "2026-09-01T00:00:00.000Z", animals: [] },
  { entries: {} },
  { entries: {} },
);
assert.equal(emptySnapshot.referenced.size, 0);

assert.throws(
  () =>
    collectMediaReferences({
      generatedAt: "2026-09-01T00:00:00.000Z",
      animals: [
        {
          id: "unsafe",
          images: [
            {
              rights: "cache-permitted",
              cachedUrl: "/media/animals/../../private.jpg",
            },
          ],
        },
      ],
    }),
  /unsafe or unsupported/,
);

assert.throws(
  () =>
    collectMediaReferences(
      { generatedAt: "2026-09-01T00:00:00.000Z", animals: [] },
      {},
      { entries: {} },
    ),
  /share-cards\.json has an invalid manifest shape/,
);
assert.throws(
  () => collectMediaReferences({ generatedAt: "invalid", animals: [] }),
  /invalid dataset shape/,
);

process.stdout.write("media-references: OK\n");
