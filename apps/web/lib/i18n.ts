export type Locale = "sl" | "en";

const sl = {
  metadataDescription:
    "Odprt indeks živali iz slovenskih zavetišč, ki iščejo dom. Vsaka žival z jasnim virom in povezavo na zavetišče.",
  githubTitle: "Cepljena, sterilizirana, brez znanih napak.",
  openSource: "odprta koda",
  canHelp: ", lahko pomagaš",
  heroTitle: "Živali iz slovenskih zavetišč, ki iščejo dom.",
  updated: "osveženo",
  footer:
    "Podatke zagotavljajo zavetišča. Pri vsaki živali je naveden vir in povezava na izvorno objavo. Posvojitev vedno poteka pri zavetišču.",
  chooseLanguage: "Izberi jezik",
  photoAtShelter: "Fotografija na strani zavetišča",
  previousPhoto: "Prejšnja fotografija",
  nextPhoto: "Naslednja fotografija",
  photoCount: "Fotografija {current} od {total}",
  openAnimal: "Odpri objavo za {name} na strani zavetišča",
  unnamed: "Brez imena",
  reserved: "rezerviran",
  animalsComingSoon:
    "Tu bodo živali, ko se dogovorimo s prvimi zavetišči.",
  noResults: "Ni zadetkov.",
  tryFewerFilters: "Poskusi z manj filtri.",
  clearFilters: "Počisti filtre",
  clear: "Počisti",
  resetAges: "Ponastavi",
  resetAgeFilters: "Ponastavi filter starosti",
  ageFilterHint: "Izberi eno ali več starosti.",
  ageRangeYoung: "manj kot 1 leto",
  ageRangeAdult: "1–8 let",
  ageRangeSenior: "8 let ali več",
  filters: "Filtri",
  show: "Prikaži",
  removeFilter: "Odstrani filter {label}",
  health: "Zdravje",
  close: "Zapri",
  locationOutsideMap:
    "Vaša lokacija je zunaj zemljevida. Seznam je vseeno razvrščen po bližini.",
  sortedByDistance: "Seznam je razvrščen po bližini.",
  selectedShelters: "{selected} od {total} zavetišč",
  shelterPickerLabel: "Zavetišče: {label}. Odpri zemljevid.",
  whereSearching: "Kje iščeš?",
  mapInstructionsDesktop:
    "Klikni zavetišče ali celo regijo na zemljevidu, ali izbiraj s seznama.",
  mapInstructionsMobile:
    "Izberi regijo na zemljevidu ali zavetišče s seznama.",
  locating: "Iščem lokacijo…",
  nearestFirst: "Najbližje prvo",
  fewerAnimals: "Manj živali",
  moreAnimals: "Več živali",
  shelter: "Zavetišče",
  regionBoundaries: "Meje statističnih regij",
  shelterMapLabel: "Zemljevid zavetišč po statističnih regijah",
  geolocationDenied: "Dostop do lokacije je zavrnjen.",
  geolocationUnavailable: "Lokacije ni bilo mogoče določiti.",
  geolocationTimeout: "Iskanje lokacije je trajalo predolgo.",
  geolocationUnsupported: "Brskalnik ne pozna lokacije.",
} as const;

type Messages = { [Key in keyof typeof sl]: string };

const en: Messages = {
  metadataDescription:
    "An open index of animals in Slovenian shelters looking for homes, with a clear source and shelter link for every listing.",
  githubTitle: "Vaccinated, neutered, no known bugs.",
  openSource: "open source",
  canHelp: ", you can help",
  heroTitle: "Animals from Slovenian shelters looking for a home.",
  updated: "updated",
  footer:
    "Data comes from shelters. Every animal includes its source and original listing. Adoptions always go through the shelter.",
  chooseLanguage: "Choose language",
  photoAtShelter: "See photo on the shelter’s website",
  previousPhoto: "Previous photo",
  nextPhoto: "Next photo",
  photoCount: "Photo {current} of {total}",
  openAnimal: "Open {name}’s listing on the shelter website",
  unnamed: "Unnamed",
  reserved: "reserved",
  animalsComingSoon: "Animals will appear here when the first shelters join.",
  noResults: "No results.",
  tryFewerFilters: "Try using fewer filters.",
  clearFilters: "Clear filters",
  clear: "Clear",
  resetAges: "Reset",
  resetAgeFilters: "Reset age filters",
  ageFilterHint: "Choose one or more ages.",
  ageRangeYoung: "under 1 year",
  ageRangeAdult: "1–8 years",
  ageRangeSenior: "8 years or older",
  filters: "Filters",
  show: "Show",
  removeFilter: "Remove filter {label}",
  health: "Health",
  close: "Close",
  locationOutsideMap:
    "Your location is outside the map. The list is still sorted by distance.",
  sortedByDistance: "The list is sorted by distance.",
  selectedShelters: "{selected} of {total} shelters",
  shelterPickerLabel: "Shelter: {label}. Open map.",
  whereSearching: "Where are you looking?",
  mapInstructionsDesktop:
    "Select a shelter or region on the map, or choose from the list.",
  mapInstructionsMobile:
    "Select a region on the map or a shelter from the list.",
  locating: "Finding your location…",
  nearestFirst: "Nearest first",
  fewerAnimals: "Fewer animals",
  moreAnimals: "More animals",
  shelter: "Shelter",
  regionBoundaries: "Statistical region boundaries",
  shelterMapLabel: "Map of shelters by statistical region",
  geolocationDenied: "Location access was denied.",
  geolocationUnavailable: "Your location could not be determined.",
  geolocationTimeout: "Finding your location took too long.",
  geolocationUnsupported: "Location is not available in this browser.",
};

const messages: Record<Locale, Messages> = { sl, en };

export type TranslationKey = keyof Messages;

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values: Record<string, string | number> = {},
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    messages[locale][key],
  );
}
