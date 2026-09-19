// Generate localized About and memorial cards from local images and bundled fonts.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import {
  SRECKO,
  SRECKO_TEXT,
  SRECKO_RENDER,
  sreckoPortrait,
  sreckoShareImage,
} from "../lib/srecko.ts";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fonts = join(webRoot, "../ingest/assets/fonts");
const escapeMarkup = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function publicFile(src) {
  const result = resolve(webRoot, "public", src.replace(/^\//, ""));
  const rel = relative(join(webRoot, "public"), result);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Portrait must be under public/");
  }
  return result;
}

async function lettering(value, left, top, size, width, bold = false, color = "#171717") {
  const input = await sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(value)}</span>`,
      font: `${bold ? "Inter SemiBold" : "Inter"} ${size}`,
      fontfile: join(fonts, bold ? "Inter-SemiBold.ttf" : "Inter-Regular.ttf"),
      width,
      rgba: true,
      dpi: 72,
    },
  }).png().toBuffer();
  return { input, left, top };
}

for (const locale of ["sl", "en"]) {
  for (const surface of ["memorial", "about"]) {
    const text = SRECKO_TEXT[locale];
    const meta = sreckoShareImage(locale, surface);
    // About uses the illustration; the memorial uses the first approved photograph.
    const portrait = surface === "about" ? SRECKO_RENDER : sreckoPortrait();
    const isRender = portrait.src === SRECKO_RENDER.src;
    let picture = sharp(publicFile(portrait.src));
    if (isRender) picture = picture.trim({ threshold: 10 });
    const { data, info } = await picture
      .resize(450, 470, { fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });
    const title = surface === "about" ? text.aboutShare : SRECKO.name;
    const description = surface === "about" ? text.aboutShareBody : text.memorial;
    const titleSize = surface === "about" ? 56 : 88;
    const credit = isRender ? text.shareCredit : text.photoCredit;
    const layers = [
      {
        input: data,
        left: 690 + Math.round((450 - info.width) / 2),
        top: 76 + Math.round((470 - info.height) / 2),
      },
      await lettering("posvoji.si", 64, 60, 30, 530, true),
      await lettering(title, 64, 192, titleSize, 560, true),
      await lettering(description, 64, 368, 30, 550, false, "#525252"),
      await lettering(credit, 64, 578, 16, 1072, false, "#737373"),
    ];
    const output = publicFile(meta.url);
    await sharp({
      create: { width: meta.width, height: meta.height, channels: 3, background: "#ffffff" },
    })
      .composite(layers)
      .jpeg({ quality: 88 })
      .toFile(output);
    const size = await sharp(output).metadata();
    if (size.width !== meta.width || size.height !== meta.height) {
      throw new Error("Incorrect card dimensions");
    }
    console.log(`${output}: ${size.width}x${size.height}`);
  }
}
