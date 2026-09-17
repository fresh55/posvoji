# Bundled Inter

These variable WOFF2 files are the unchanged Inter subsets emitted by the
successful Next.js 16.3.1 build on 17 September 2026, originally obtained from
[Google Fonts](https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap).
They are covered by the included SIL Open Font License in `OFL.txt`.

`inter.css` preserves all seven character ranges, normal weights 100–900,
`font-display: swap`, and the previous metric-adjusted Arial fallback. No font
is preloaded. The existing eight-letter Slovenian subset takes priority in
`font-stack.ts`, so ordinary Slovenian text still avoids the larger latin-ext
download. Other scripts and uncommon letters retain their original coverage.

Do not download fonts during a build. For an intentional font update, use the
provider SDK network helpers in `scripts/remote-source.mjs` to obtain the font
CSS and files, review the ranges and license, regenerate the Slovenian subset
with `pnpm --filter web generate:font-subset`, and commit the reviewed files.
