// Regenerates app/fonts/inter-slovenian-subset.woff2: Inter, cut down to the
// eight letters Slovenian needs that Google's `latin` subset does not carry.
//
// Run when Inter is bumped, or when a letter is added to SLOVENIAN. Needs
// python with fonttools and brotli on PATH:
//
//   pip install fonttools brotli
//   pnpm --filter web generate:font-subset
//
// Why the file is committed rather than built: it is 3.5KB, it changes about
// as often as the alphabet does, and fetching a font mid-build would put the
// network on the critical path of every CI run. See app/fonts.ts for what it
// is for, and app/fonts/OFL.txt for the licence it ships under.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// c-caron, s-caron, z-caron in both cases, plus the d-stroke pair that comes
// with Slovenian keyboards and appears in borrowed names.
const SLOVENIAN = ["010C", "010D", "0110", "0111", "0160", "0161", "017D", "017E"];

const CSS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap";
// Google serves a different CSS per user agent; this one gets woff2.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "app", "fonts", "inter-slovenian-subset.woff2");

const css = await fetch(CSS_URL, { headers: { "User-Agent": UA } }).then((r) => {
  if (!r.ok) throw new Error(`Google Fonts CSS: ${r.status}`);
  return r.text();
});

// The latin-ext block is the one whose range opens at U+0100; all eight letters
// live in it. Matching on the range rather than on block order, so a reordering
// upstream cannot quietly hand us the wrong file.
const block = css
  .split("@font-face")
  .find((chunk) => chunk.includes("U+0100-02BA"));
if (!block) throw new Error("no latin-ext @font-face in the Google CSS");
const source = block.match(/src:\s*url\((https:[^)]+\.woff2)\)/)?.[1];
if (!source) throw new Error("no woff2 url in the latin-ext block");

const woff2 = Buffer.from(await fetch(source).then((r) => r.arrayBuffer()));
const tmp = join(here, "..", "app", "fonts", ".inter-latin-ext.woff2");
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, woff2);

try {
  execFileSync(
    "python",
    [
      "-m", "fontTools.subset", tmp,
      `--output-file=${outFile}`,
      "--flavor=woff2",
      `--unicodes=${SLOVENIAN.map((code) => `U+${code}`).join(",")}`,
      "--layout-features=*",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: "inherit" },
  );
} finally {
  execFileSync("node", ["-e", `require("node:fs").rmSync(${JSON.stringify(tmp)}, { force: true })`]);
}

console.log(`wrote ${outFile} from ${source}`);
