// The portal is Slovenian only: its users are shelter staff. The strings stay
// here rather than in lib/i18n.ts, which carries the bilingual public site.
// The placeholder syntax is shared with it.

export { interpolate as fill } from "@/lib/i18n";

export const portalText = {
  brand: "Portal za zavetišča",

  // Login
  loginTitle: "Prijava za zavetišča",
  loginLead:
    "Vpišite e-naslov zavetišča. Poslali vam bomo povezavo za prijavo, gesla ni.",
  emailLabel: "E-naslov zavetišča",
  emailPlaceholder: "info@zavetisce.si",
  sendLink: "Pošlji povezavo",
  sending: "Pošiljam …",
  sentTitle: "Povezava je na poti",
  sentLead:
    "Če je naslov {email} vpisan pri nas, je povezava za prijavo že v predalu. Velja eno uro.",
  sentHint: "Če je ni, poglejte še med vsiljeno pošto.",
  sendAgain: "Pošlji na drug naslov",
  emailRequired: "Vpišite e-naslov.",
  verifying: "Preverjam povezavo …",
  expiredTitle: "Povezava ne velja več",
  expiredLead:
    "Povezava za prijavo velja eno uro in samo za en račun. Zahtevajte novo, pa gremo naprej.",
  requestNewLink: "Zahtevaj novo povezavo",
  networkError:
    "Strežnik se ni odzval. Preverite povezavo in poskusite znova.",
  unknownError: "Nekaj je šlo narobe. Poskusite znova.",

  // Workspace
  loading: "Nalagam …",
  redirecting: "Preusmerjam na prijavo …",
  logout: "Odjava",
  publicPage: "Javna stran zavetišča",
  chooseShelter: "Izberite zavetišče",
  noSheltersTitle: "Račun še ni povezan z zavetiščem",
  noSheltersLead:
    "Prijava je uspela, dostopa do zavetišča pa ta naslov še nima. Pišite nam in uredimo.",
  animalsTitle: "Vaše živali",
  animalsLead:
    "Popravki se shranijo takoj in prekrijejo podatek z vaše spletne strani. Kar ne popravite, ostane tako, kot ga zajamemo.",
  emptyTitle: "Tu še ni živali",
  emptyLead:
    "Ko z vaše strani zajamemo prvo žival, se bo pojavila tukaj. Če menite, da bi morala biti že zdaj, nam pišite.",
  listError: "Seznama živali ni bilo mogoče naložiti.",
  forbidden: "Za to zavetišče nimate dovoljenja.",
  retry: "Poskusi znova",
  unnamed: "Brez imena",

  // Card and editor
  statusLegend: "Stanje",
  statusUnknown: "Ni podatka",
  edit: "Uredi podatke",
  editTitle: "Uredi {name}",
  editLead: "Prazno polje pomeni, da velja podatek z vaše spletne strani.",
  fieldName: "Ime",
  fieldBreed: "Pasma",
  fieldSex: "Spol",
  fieldBirthDate: "Datum rojstva",
  fieldAgeMonths: "Približna starost",
  fieldAgeMonthsUnit: "mesecev",
  fieldSize: "Velikost",
  fieldEnergy: "Energija",
  energyHint:
    "Koliko gibanja in dela žival potrebuje čez dan. Z vaše strani ga skoraj nikoli ne znamo prebrati, zato ga večina živali dobi šele tukaj.",
  fieldGoodWithKids: "Se razume z otroki",
  fieldGoodWithDogs: "Se razume s psi",
  fieldGoodWithCats: "Se razume z mačkami",
  compatibilityHint:
    "Živali z izpolnjenimi polji so po izkušnjah posvojene hitreje. Da izberite le, če za to lahko stojite; Ni znano je pošten odgovor.",
  fieldDescription: "Kratek opis",
  descriptionHint: "Nekaj stavkov o značaju in tem, kakšen dom išče.",
  save: "Shrani",
  saving: "Shranjujem …",
  saved: "Shranjeno",
  cancel: "Prekliči",
  saveError: "Shranjevanje ni uspelo. Poskusite znova.",
  invalidError: "Podatek ni v pravi obliki. Preverite vnos.",
  edited: "Urejeno",
  editedCount: "Urejena polja: {count}",
  willRevert: "Bo povrnjeno",
  revert: "Povrni",
  revertField: "Povrni {field} na podatek z vaše strani",
  revertHint: "Povrne podatek, kot je zapisan na vaši spletni strani.",
} as const;
