import localFont from "next/font/local";
import "./fonts/inter.css";

// next/font emits matching hashed URLs in CSS and crossorigin preload hints.
// Preserve the existing Unicode ranges and metric-adjusted Arial fallback.
const latin = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{
    prop: "unicode-range",
    value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  }],
});
const slovenian = localFont({
  src: "./fonts/inter-slovenian-subset.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{
    prop: "unicode-range",
    value: "U+010C-010D,U+0110-0111,U+0160-0161,U+017D-017E"
  }],
});

export const fontStack =
  `${slovenian.style.fontFamily}, ${latin.style.fontFamily}, "Posvoji Inter", "Posvoji Inter Fallback"`;
