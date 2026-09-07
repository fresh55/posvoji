import type { Locale } from "@/lib/i18n";

export type SreckoEventKey = "listed" | "adopted" | "died";
export type SreckoEvent = { key: SreckoEventKey; date?: string };
export type SreckoPhoto = {
  /** Local public/ path: permission-cleared, EXIF-free, longest edge <= 1600px. */
  src: string; width: number; height: number; alt: Record<Locale, string>;
};
/** Owner-confirmed facts only. Add prepared photographs and dates here. */
export const SRECKO = {
  name: "Srečko", species: "cat", sex: "male", felv: "positive", eyes: "one",
  timeline: [{ key: "listed" }, { key: "adopted" }, { key: "died" }] as SreckoEvent[],
  photos: [] as SreckoPhoto[],
  /** A genuine memory supplied by his owner, in both languages. */
  memory: undefined as Record<Locale, string> | undefined,
} as const;
export const SRECKO_PATHS = { sl: "/o-nas/srecko", en: "/en/about/srecko" } as const;
export const SRECKO_POSTER_PATHS = { sl: "/o-nas/srecko/plakat", en: "/en/about/srecko/poster" } as const;
export const SRECKO_RENDER = {
  src: "/models/our-cat/poster.webp", width: 896, height: 992,
  alt: {
    sl: "Upodobitev Srečka, belega mačka s sivimi lisami in zaprtim desnim očesom.",
    en: "An illustration of Srečko, a white cat with grey patches and a closed right eye.",
  },
} as const;
export const SRECKO_TEXT = {
  sl: {
    memorial: "V spomin na Srečka",
    intro: "Srečko je prišel iz zavetišča in našel dom. Posvoji.si je posvečen njegovemu spominu.",
    purpose: "V njegov spomin pomagamo drugim živalim iz zavetišč, da jih ljudje, ki iščejo družabnika, lažje najdejo.",
    dedication: "Ta stran je v spomin na Srečka.",
    dedicationBefore: "Ta stran je v spomin na ", dedicationName: "Srečka",
    cats: "Mačke, ki še čakajo", poster: "Spominski plakat", facts: "Nekaj o Srečku",
    eye: { title: "Eno oko", body: "Desnega očesa ni imel. Rana se je zacelila." },
    felv: { title: "FeLV pozitiven", body: "Test na virus mačje levkemije je bil pozitiven." },
    dates: "Pomembni trenutki", home: "Doma",
    events: { listed: "V zavetišču", adopted: "Posvojen", died: "Umrl" },
    posterStory: "Iz zavetišča je prišel v svoj dom.",
    scan: "Spoznaj njegovo zgodbo in mačke, ki še čakajo na dom.",
    credit: "Upodobitev: Cat [Murdered: Soul Suspect], mark2580, CC BY 4.0, prilagojeno.",
    shareCredit: "Upodobitev: mark2580 · CC BY 4.0 · prilagojeno",
    aboutShare: "Živali, ki iščejo dom",
    aboutShareBody: "Odprt in brezplačen seznam živali iz slovenskih zavetišč.",
  },
  en: {
    memorial: "In memory of Srečko",
    intro: "Srečko came from a shelter and found a home. Posvoji.si is dedicated to his memory.",
    purpose: "In his memory, we help people looking for a companion discover other animals in shelters.",
    dedication: "This site is in memory of Srečko.",
    dedicationBefore: "This site is in memory of ", dedicationName: "Srečko",
    cats: "Cats still waiting", poster: "Memorial poster", facts: "A little about Srečko",
    eye: { title: "One eye", body: "He had no right eye. The wound had healed over." },
    felv: { title: "FeLV positive", body: "He tested positive for feline leukemia virus." },
    dates: "Milestones", home: "At home",
    events: { listed: "In the shelter", adopted: "Adopted", died: "Died" },
    posterStory: "He came from a shelter and found a home.",
    scan: "Discover his story and the cats still waiting for a home.",
    credit: "Render: Cat [Murdered: Soul Suspect] by mark2580, CC BY 4.0, adapted.",
    shareCredit: "Render: mark2580 · CC BY 4.0 · adapted",
    aboutShare: "Animals waiting for a home",
    aboutShareBody: "An open, free index of animals in Slovenian shelters.",
  },
} as const;

/** Shared choice for the memorial, sheet and generated share art. */
export function sreckoPortrait() { return SRECKO.photos[0] ?? SRECKO_RENDER; }
export function sreckoShareImage(locale: Locale, surface: "about" | "memorial" = "memorial") {
  const file = surface === "about" ? "about-share" : "share";
  return {
    url: `/models/our-cat/${file}${locale === "en" ? "-en" : ""}.jpg`,
    width: 1200, height: 630,
    alt: `${surface === "about" ? SRECKO_TEXT[locale].aboutShare : SRECKO_TEXT[locale].memorial} · posvoji.si`,
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
    year: "numeric", month: date.length === 7 ? "long" : locale === "sl" ? "numeric" : "long",
    ...(date.length === 10 ? { day: "numeric" as const } : {}), timeZone: "UTC",
  }).format(parsed);
}
/** Missing dates never become empty timeline rows. */
export function sreckoMilestones(locale: Locale, timeline = SRECKO.timeline) {
  return timeline.flatMap(event => {
    const date = event.date && sreckoDateLabel(event.date, locale);
    return date ? [{ key: event.key, label: SRECKO_TEXT[locale].events[event.key], date, iso: event.date! }] : [];
  });
}
/** Show the recorded range, never an exact duration inferred from partial dates. */
export function sreckoHomeDateRange(locale: Locale, timeline = SRECKO.timeline): string | undefined {
  const from = timeline.find(event => event.key === "adopted")?.date;
  const to = timeline.find(event => event.key === "died")?.date;
  if (!from || !to) return;
  const start = dateStart(from), end = dateStart(to);
  if (!start || !end || start > end) return;
  const a = sreckoDateLabel(from, locale), b = sreckoDateLabel(to, locale);
  return a === b ? a : `${a} – ${b}`;
}
