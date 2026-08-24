import { Inter } from "next/font/google";
import localFont from "next/font/local";

// Slovenian needs eight letters that live outside Google's `latin` subset:
// č š ž Č Š Ž and the đ pair. Asking next/font/google for `latin-ext` to get
// them cost 85KB, preloaded at highest priority on every page, because that
// subset carries the whole of Latin Extended-A and B for every language that
// uses any of it.
//
// Dropping "latin-ext" from the subsets array does not help: next/font/google
// emits an @font-face for every subset the family has regardless of what is
// asked for (the build ships cyrillic, greek and vietnamese faces this site
// never declared), and `subsets` decides only which get preloaded. So the
// browser would still fetch the same 85KB, just late, on first sight of a č.
//
// Instead those eight letters are their own face, subset from the same Google
// source, and they come first in the stack. A č matches here and stops; every
// other character falls through to Inter proper. The latin-ext face is still
// declared, so a rarer letter in a shelter or animal name (a Croatian ć, say)
// still renders, by fetching it then rather than on every page load.
//
// Regenerate with `pnpm --filter web generate:font-subset`. The file is
// Inter under the SIL Open Font License; see app/fonts/OFL.txt.
const inter = Inter({ subsets: ["latin"] });

const interSlovenian = localFont({
  src: "./fonts/inter-slovenian-subset.woff2",
  // The subset keeps Inter's 100-900 axis, so it tracks the weights the rest
  // of the page uses instead of pinning these letters to one of them.
  weight: "100 900",
  style: "normal",
  // Inter proper carries the fallback metrics for the page. A second synthetic
  // face for eight letters would only add an @font-face nothing needs.
  adjustFontFallback: false,
  // Written out rather than lifted to a constant: next/font rejects any
  // option value that is not an inline literal.
  declarations: [
    {
      prop: "unicode-range",
      value: "U+010C-010D,U+0110-0111,U+0160-0161,U+017D-017E",
    },
  ],
});

/** Fed to --font-sans, which is what globals.css hands Tailwind. */
export const fontStack = `${interSlovenian.style.fontFamily}, ${inter.style.fontFamily}`;
