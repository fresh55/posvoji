// The home-screen icons the manifest points at, drawn from app/icon.svg.
//
// Run by hand when the mark changes: `node scripts/build-app-icons.mjs` from
// apps/web. A one-off rather than a build step, because the mark is a file in
// the repo that changes about as often as the logo does, and a build that
// rasterises it every time would rewrite three binaries on every deploy.
//
// Three files, all on white. White because the manifest's background_color is
// white and a splash that fades into an icon of another colour is a seam; the
// mark itself carries no plate (app/icon.svg says why: the header masks that
// same file), so on a transparent PNG a dark launcher would lose it.
//
// The maskable one is the reason for the other two being separate. Android
// crops a maskable icon to whatever shape the launcher uses, from a circle to
// a squircle, and only guarantees the inner circle of 80% diameter. Anything
// in the corners is the launcher's to cut. So the mark is drawn at half the
// canvas there, centred, which leaves its corners at 181px from the centre of
// a 512px icon against the 205px the safe circle allows, and the padding that
// looks generous next to the plain icons is what keeps the paw whole on a
// round launcher.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mark = readFileSync(join(webRoot, "app/icon.svg"));

// Density rather than a width: librsvg rasterises at the SVG's own size times
// this, and a 512px icon grown from a 128px unit box would be soft.
const source = () => sharp(mark, { density: 1200 });

/** One square PNG: the mark centred on white, inset by a share of the side. */
async function icon(size, inset) {
  const box = Math.round(size * (1 - 2 * inset));
  const drawn = await source()
    .resize({ width: box, height: box, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: drawn.data,
        left: Math.round((size - drawn.info.width) / 2),
        top: Math.round((size - drawn.info.height) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// 12% on the plain pair: enough that the mark is not flush against a rounded
// corner, little enough that the icon reads at 48px in a launcher's tray.
// 25% on the maskable one, which is the safe circle above.
const sheet = [
  ["public/icon-192.png", 192, 0.12],
  ["public/icon-512.png", 512, 0.12],
  ["public/icon-maskable-512.png", 512, 0.25],
];

for (const [file, size, inset] of sheet) {
  const png = await icon(size, inset);
  writeFileSync(join(webRoot, file), png);
  console.log(`${file}: ${size}x${size}, ${Math.round(inset * 100)}% inset, ${png.length} bytes`);
}
