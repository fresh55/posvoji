import type { Locale } from "@/lib/i18n";

export type SreckoEventKey = "listed" | "adopted" | "died";
export type SreckoEvent = { key: SreckoEventKey; date?: string };
export type SreckoPhoto = {
  /** Local public/ path: permission-cleared, EXIF-free, longest edge <= 1600px. */
  src: string;
  width: number;
  height: number;
  alt: Record<Locale, string>;
};
// The owner confirmed the shelter and memory on 2026-09-08. Supplied screenshots
// of shelter posts dated 2023-03-16 and 2023-03-18 establish the homecoming date.
// The owner permitted these four photographs on Posvoji.si on 2026-09-08;
// no public reuse licence is granted. Prepared files contain no EXIF/XMP/IPTC.
export const SRECKO = {
  name: "Srečko",
  shelter: { name: "Mačja hiša", from: { sl: "iz Mačje hiše", en: "from Mačja hiša" } },
  timeline: [{ key: "adopted", date: "2023-03-17" }] as SreckoEvent[],
  photos: [
    {
      src: "/images/srecko/srecko-portret.webp",
      width: 612,
      height: 570,
      alt: {
        sl: "Srečko, bel maček s sivimi lisami, leži na brisači.",
        en: "Srečko, a white cat with grey patches, lying on a towel.",
      },
    },
    {
      src: "/images/srecko/srecko-televizija.webp",
      width: 305,
      height: 305,
      alt: {
        sl: "Srečko sedi pred televizijo in gleda tigra na zaslonu.",
        en: "Srečko sitting in front of the television, watching a tiger on the screen.",
      },
    },
    {
      src: "/images/srecko/srecko-pociva.webp",
      width: 305,
      height: 305,
      alt: {
        sl: "Srečko počiva v mehkem ležišču na postelji.",
        en: "Srečko resting in a soft cat bed on the bed.",
      },
    },
    {
      src: "/images/srecko/srecko-igra.webp",
      width: 306,
      height: 305,
      alt: {
        sl: "Srečko na postelji gleda visečo igračo v obliki ribe.",
        en: "Srečko on the bed, looking up at a dangling fish toy.",
      },
    },
  ] as SreckoPhoto[],
  memory: {
    sl: "Bil je zelo igriv fant.",
    en: "He was a very playful boy.",
  } as Record<Locale, string> | undefined,
} as const;

export const SRECKO_PATHS = { sl: "/o-nas/srecko", en: "/en/about/srecko" } as const;
export const SRECKO_POSTER_PATHS = { sl: "/o-nas/srecko/plakat", en: "/en/about/srecko/poster" } as const;
export const SRECKO_RENDER = {
  src: "/models/our-cat/poster.webp",
  width: 896,
  height: 992,
  alt: {
    sl: "Upodobitev Srečka, belega mačka s sivimi lisami in zaprtim desnim očesom.",
    en: "An illustration of Srečko, a white cat with grey patches and a closed right eye.",
  },
} as const;

export const SRECKO_TEXT = {
  sl: {
    memorial: "V spomin na Srečka",
    story: "Spoznajte Srečka",
    intro: `Srečko je prišel ${SRECKO.shelter.from.sl} in našel dom. Posvoji.si je posvečen njegovemu spominu.`,
    purpose: "V njegov spomin pomagamo živalim iz zavetišč najti dom.",
    cats: "Oglejte si mačke, ki iščejo dom",
    poster: "Spominski plakat",
    events: { listed: "V zavetišču", adopted: "Prišel domov", died: "Umrl" },
    posterStory: `Srečko je ${SRECKO.shelter.from.sl} prišel v svoj dom.`,
    scan: "Spoznajte Srečka in mačke, ki iščejo dom.",
    credit: "Upodobitev: Cat [Murdered: Soul Suspect], mark2580, CC BY 4.0, prilagojeno.",
    shareCredit: "Upodobitev: mark2580 · CC BY 4.0 · prilagojeno",
    photoCredit: "Fotografije: osebni arhiv, z dovoljenjem.",
    aboutShare: "Živali, ki iščejo dom",
    aboutShareBody: "Odprt in brezplačen seznam živali iz slovenskih zavetišč.",
  },
  en: {
    memorial: "In memory of Srečko",
    story: "Meet Srečko",
    intro: `Srečko came ${SRECKO.shelter.from.en} and found a home. Posvoji.si is dedicated to his memory.`,
    purpose: "In his memory, we help shelter animals find a home.",
    cats: "See cats looking for a home",
    poster: "Memorial poster",
    events: { listed: "In the shelter", adopted: "Came home", died: "Died" },
    posterStory: `Srečko came ${SRECKO.shelter.from.en} and found a home.`,
    scan: "Meet Srečko and the cats looking for a home.",
    credit: "Render: Cat [Murdered: Soul Suspect] by mark2580, CC BY 4.0, adapted.",
    shareCredit: "Render: mark2580 · CC BY 4.0 · adapted",
    photoCredit: "Photos: personal archive, used with permission.",
    aboutShare: "Animals waiting for a home",
    aboutShareBody: "An open, free index of animals in Slovenian shelters.",
  },
} as const;

export function sreckoPortrait() {
  return SRECKO.photos[0] ?? SRECKO_RENDER;
}

export function sreckoShareImage(locale: Locale, surface: "about" | "memorial" = "memorial") {
  const file = surface === "about" ? "about-share" : "share";
  const text = SRECKO_TEXT[locale];
  const title = surface === "about" ? text.aboutShare : text.memorial;
  return {
    url: `/models/our-cat/${file}${locale === "en" ? "-en" : ""}.jpg`,
    width: 1200,
    height: 630,
    alt: `${title} · posvoji.si`,
  };
}

function dateStart(date: string): Date | undefined {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u.test(date)) return;
  const iso = date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(iso)) return;
  return parsed;
}

export function sreckoDateLabel(date: string, locale: Locale): string | undefined {
  const parsed = dateStart(date);
  if (!parsed) return;
  if (date.length === 4) return date;
  return new Intl.DateTimeFormat(locale === "sl" ? "sl-SI" : "en-GB", {
    year: "numeric",
    month: date.length === 7 ? "long" : locale === "sl" ? "numeric" : "long",
    ...(date.length === 10 ? { day: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(parsed);
}

/** Missing dates never become empty timeline rows. */
export function sreckoMilestones(locale: Locale, timeline = SRECKO.timeline) {
  return timeline.flatMap(event => {
    if (!event.date) return [];
    const date = sreckoDateLabel(event.date, locale);
    if (!date) return [];
    return [{
      key: event.key,
      label: SRECKO_TEXT[locale].events[event.key],
      date,
      iso: event.date,
    }];
  });
}
