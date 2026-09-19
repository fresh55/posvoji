// Regenerate committed brand exports after editing public/logo.svg or app/icon.svg:
// run `node scripts/build-app-icons.mjs` from apps/web.
// Full animal mark: home-screen icons, Apple icon and documentation.
// Compact roof-and-heart mark: SVG browser icon and multi-size ICO fallback.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mark = readFileSync(join(webRoot, "public/logo.svg"));
const compactMark = readFileSync(join(webRoot, "app/icon.svg"));

/** Centre the mark on white so it stays visible on any launcher background. */
async function icon(source, size, inset) {
  const box = Math.round(size * (1 - 2 * inset));
  const drawn = await sharp(source, { density: 1200 })
    .resize({ width: box, height: box, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({
    create: { width: size, height: size, channels: 4, background: "#ffffff" },
  })
    .composite([{
      input: drawn.data,
      left: Math.round((size - drawn.info.width) / 2),
      top: Math.round((size - drawn.info.height) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// 25% padding keeps the maskable mark within Android's 80%-diameter safe circle.
const sheet = [
  ["public/icon-192.png", 192, 0.12],
  ["public/icon-512.png", 512, 0.12],
  ["public/icon-maskable-512.png", 512, 0.25],
  ["app/apple-icon.png", 180, 0.12],
];
for (const [file, size, inset] of sheet) {
  const png = await icon(mark, size, inset);
  writeFileSync(join(webRoot, file), png);
  console.log(`${file}: ${size}x${size}, ${png.length} bytes`);
}

// ICO directory entries point to PNG payloads, supported by modern browsers.
// The compact SVG already includes clear space; do not shrink it again here.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => icon(compactMark, size, 0)));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
writeFileSync(join(webRoot, "app/favicon.ico"), Buffer.concat([directory, ...images]));
console.log("app/favicon.ico: 16, 32, 48px");

// Documentation uses the same source geometry, with a fixed color for each theme.
const docsRoot = resolve(webRoot, "../../docs/assets");
const docMark = mark.toString().replace(
  'viewBox="0 0 128 120.8"',
  'viewBox="0 0 128 120.8" width="128" height="120.8"',
);
writeFileSync(join(docsRoot, "logo.svg"), docMark);
writeFileSync(join(docsRoot, "logo-dark.svg"), docMark.replace('color="#313941"', 'color="#E6EDF3"'));
console.log("docs/assets/logo.svg, logo-dark.svg");
