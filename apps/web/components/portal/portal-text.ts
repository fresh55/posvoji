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
  emailInvalid: "E-naslov ni v pravi obliki. Preverite vnos.",
  verifying: "Preverjam povezavo …",
  expiredTitle: "Povezava ne velja več",
  expiredLead:
    "Povezava za prijavo velja eno uro in samo za en račun. Zahtevajte novo, pa gremo naprej.",
  requestNewLink: "Zahtevaj novo povezavo",
  networkError: "Strežnik se ni odzval. Preverite povezavo in poskusite znova.",
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
    "Popravki se shranijo takoj, na javni strani pa so vidni najpozneje v 12 urah.",
  // List tools. The counts double as filters; "Vse" turns them off.
  searchLabel: "Išči po imenu",
  searchPlaceholder: "Išči po imenu …",
  // The chips are named apart from the status row on every card, which would
  // otherwise leave a screen reader with a list of identical "Stanje" groups.
  filterLegend: "Filtriraj po stanju",
  statusAll: "Vse",
  noMatchesTitle: "Ni zadetkov",
  noMatchesLead: "Nobena žival ne ustreza iskanju ali izbranemu stanju.",
  showAll: "Pokaži vse",
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
  // Status arrives from the crawl for almost every animal, so the row under
  // the four buttons has to say so in a full sentence and ask for the one
  // action that settles it. Without this the shelter opens the workspace to a
  // grid that already looks answered and has nothing left to confirm. It is a
  // sentence and not a hover title on purpose: a touch user never opens one.
  statusFromSiteLine:
    "Stanje smo prebrali z vaše spletne strani. Če drži, ga potrdite.",
  // Confirms the inherited value as the shelter's own answer. Pinning is what
  // a tap on the highlighted card already did; this makes it discoverable.
  statusConfirm: "Potrdi",
  // The visible word is the start of the label, so voice control can say it
  // (WCAG 2.5.3) and a screen reader still hears which value is meant.
  statusConfirmLabel: "Potrdi stanje, ki smo ga prebrali z vaše strani",
  // The other half of the pair: once the shelter has picked or confirmed, the
  // same row says the value is theirs and that our next crawl will not move it.
  statusOwnLine:
    "Stanje ste določili sami. Velja, tudi če se vaša stran spremeni.",
  // Named for what the shelter gets out of filling them in, not for what we
  // are missing: these five are the filters an adopter narrows the grid with.
  missingTitle: "Manjka za iskalnik:",
  // The whole "manjka" line is a button that opens the editor at the first
  // unanswered field. This says so on hover and as its description; the name
  // stays the visible text, so it can also be spoken to voice control.
  missingOpen: "Dopolni manjkajoče podatke za {name}",
  // Marks the same fields inside the editor, so the card's list and the form
  // rows name each other.
  missingBadge: "Manjka za iskalnik",
  edit: "Uredi podatke",
  editTitle: "Uredi {name}",
  editLead: "Prazno polje pomeni, da velja podatek z vaše spletne strani.",
  publicListing: "Javna objava",
  fieldName: "Ime",
  nameHint: "Samo ime, brez pasme in starosti.",
  fieldBreed: "Pasma",
  fieldSex: "Spol",
  fieldBirthDate: "Datum rojstva",
  fieldAgeMonths: "Približna starost",
  fieldAgeMonthsUnit: "mesecev",
  fieldAgeYearsUnit: "let",
  ageHint: "Dovolj je približek.",
  fieldSize: "Velikost",
  fieldEnergy: "Energija",
  energyHint:
    "Koliko gibanja in dela žival potrebuje čez dan. Z vaše strani ga skoraj nikoli ne znamo prebrati, zato ga večina živali dobi šele tukaj.",
  fieldGoodWithKids: "Se razume z otroki",
  fieldGoodWithDogs: "Se razume s psi",
  fieldGoodWithCats: "Se razume z mačkami",
  compatibilityHint:
    "Živali z izpolnjenimi polji so po izkušnjah posvojene hitreje. Da izberite le, če za to lahko stojite; Ni znano je pošten odgovor.",
  fieldApartmentOk: "Primeren za stanovanje",
  fieldSpecialNeeds: "Posebne potrebe",
  specialNeedsHint: "Žival potrebuje potrpežljivega človeka.",
  fieldDescription: "Kratek opis",
  descriptionHint: "Nekaj stavkov o značaju in tem, kakšen dom išče.",
  save: "Shrani",
  saving: "Shranjujem …",
  saved: "Shranjeno",
  cancel: "Prekliči",
  // Every way out of the editor passes through this once something is typed.
  discardTitle: "Popravki niso shranjeni",
  discardLead: "Če zdaj zaprete okno, se vpisano izgubi.",
  keepEditing: "Nadaljuj urejanje",
  discardChanges: "Zavrzi popravke",
  saveError: "Shranjevanje ni uspelo. Poskusite znova.",
  invalidError: "Podatek ni v pravi obliki. Preverite vnos.",
  edited: "Urejeno",
  editedCount: "Urejena polja: {count}",
  willRevert: "Bo povrnjeno",
  revert: "Povrni",
  revertField: "Povrni {field} na podatek z vaše strani",
  revertHint: "Povrne podatek, kot je zapisan na vaši spletni strani.",
} as const;
