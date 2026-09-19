# Bundled Inter

These variable WOFF2 files are the unchanged Inter subsets emitted by the
successful Next.js 16.3.1 build on 17 September 2026, originally obtained from
[Google Fonts](https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap).
They are covered by the included SIL Open Font License in `OFL.txt`.

`font-stack.ts` loads Latin Inter and the eight-letter Slovenian subset with
`next/font/local`; `inter.css` preserves the other six character ranges and
the metric-adjusted Arial fallback. All faces retain normal weights 100–900
and `font-display: swap` so late-loading Latin letters do not stay in Arial
alongside Inter accents. Only the Slovenian subset is preloaded and takes
priority in the stack, so ordinary Slovenian text still avoids the larger
latin-ext download. Other scripts and uncommon letters retain their coverage.

Do not download fonts during a build. For an intentional font update, use the
provider SDK network helpers in `scripts/remote-source.mjs` to obtain the font
CSS and files, review the ranges and license, regenerate the Slovenian subset
with `pnpm --filter web generate:font-subset`, and commit the reviewed files.
