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
  moreInformation: "Več informacij",
  backToTop: "Na vrh strani",
  backToAnimals: "Nazaj na živali",
  resources: "Strokovno preverjeni viri",
  shelters: "Zavetišča",
  forShelters: "Za zavetišča",
  chooseLanguage: "Izberi jezik",
  photoAtShelter: "Fotografija na strani zavetišča",
  previousPhoto: "Prejšnja fotografija",
  nextPhoto: "Naslednja fotografija",
  photoCount: "Fotografija {current} od {total}",
  showPhoto: "Pokaži fotografijo {n}",
  viewPhotoLarge: "Odpri fotografijo {n} čez cel zaslon",
  openDetails: "Odpri podrobnosti o {name}",
  previousAnimal: "Prejšnja žival",
  nextAnimal: "Naslednja žival",
  share: "Deli",
  linkCopied: "Povezava kopirana",
  foundHome: "Ta žival je že našla nov dom.",
  viewOriginalListing: "Odpri objavo pri zavetišču",
  animalDetails: "Podrobnosti o živali",
  factAge: "Starost",
  factBreed: "Pasma",
  factSize: "Velikost",
  factTimeInShelter: "V zavetišču",
  factOrigin: "Kraj najdbe",
  // The name in front turns a statistic into one animal's wait. "Čaka" is
  // third person singular and carries no gender, so it fits any name without
  // the sentence having to know the animal's sex.
  longStay: "{name} v zavetišču čaka že {duration}.",
  // "Brez imena v zavetišču čaka" reads as a phrase, not as a subject, so an
  // animal the shelter left unnamed keeps the sentence it had.
  longStayUnnamed: "V zavetišču čaka že {duration}.",
  longStayLink: "Poglej vse, ki čakajo najdlje",
  // A label, not a plea. The dialog's longStay above is the plea, and it has a
  // sentence, the animal's name and a link to act on: that is where it can do
  // something. On
  // a card the same words repeat twenty times a screen and decay into
  // wallpaper.
  //
  // The verb is the part that cannot come off. Those same 54 of 101 cards are
  // an animal that grew up in the shelter, where the age and the wait are one
  // number, and a mark printing the number alone leaves a 12px hourglass to
  // say which of the two it is. "Čaka" says it in four characters and lets
  // the icon go. The trailing "v zavetišču" that used to carry the sense is
  // what pays for it: it is the one thing on a card about a shelter's animal
  // that every card already says.
  longStayMark: "Čaka {duration}",
  healthAllClear: "Vse zdravstveno urejeno ({count}/{count})",
  showHealthDetails: "Pokaži podrobnosti",
  readMore: "Preberi več",
  showLess: "Pokaži manj",
  hintSterilizacija: "Žival je sterilizirana ali kastrirana.",
  hintCepljenje: "Žival je cepljena.",
  hintCip: "Žival je označena z mikročipom.",
  hintBrezFiv:
    "Testirana negativno na mačji virus imunske pomanjkljivosti (FIV).",
  hintBrezFelv: "Testirana negativno na virus mačje levkemije (FeLV).",
  statusAvailable: "na voljo",
  // Neuter impersonal, not masculine adjectives. filters.ts states the rule for
  // the toggles ("Slovenian would force a gender on 'cepljen' that 'živali'
  // doesn't share") and these three were the place it was not applied, on a
  // grid that is three quarters cats. "Rezervirano" and "posvojeno" describe
  // the state of a thing and carry no gender.
  //
  // statusHold loses "trenutno": at 11px the old string was wider than a phone
  // card's whole content box, and the shorter one says the same thing.
  statusReserved: "rezervirano",
  statusAdopted: "posvojeno",
  statusHold: "ni za posvojitev",
  lessThanMonth: "manj kot mesec",
  unnamed: "Brez imena",
  animalsComingSoon: "Tu bodo živali, ko se dogovorimo s prvimi zavetišči.",
  resultsHeading: "Živali",
  skipResults: "Preskoči seznam živali",
  noResults: "Ni zadetkov.",
  tryFewerFilters: "Poskusi z manj filtri.",
  clearFilters: "Počisti filtre",
  // The zero state gets specific when a shelter selection is the whole
  // reason for it: dropping only the shelter filter would show results.
  // Singular/plural picks the verb form for one vs. several zavetišča.
  // {species} takes one of the speciesAbsence* forms below.
  noResultsShelterSingular: "Izbrano zavetišče trenutno nima {species}.",
  noResultsShelterPlural: "Izbrana zavetišča trenutno nimajo {species}.",
  showFromAllShelters: "Pokaži iz vseh zavetišč",
  clear: "Počisti",
  resetFilters: "Ponastavi",
  resetAgeFilters: "Ponastavi filter starosti",
  resetSexFilters: "Ponastavi filter spola",
  resetSizeFilters: "Ponastavi filter velikosti",
  resetEnergyFilters: "Ponastavi filter energije",
  resetHealthFilters: "Ponastavi zdravstvene filtre",
  resetShelterFilters: "Ponastavi izbor zavetišč",
  ageFilterHint: "Izberi eno ali več starosti.",
  energyFilterHint:
    "Po presoji zavetišča. Živali brez podatka ta filter skrije.",
  healthFilterHint: "Ujema se vsaj ena izbrana lastnost.",
  ageRangeYoung: "manj kot 1 leto",
  ageRangeAdult: "1–8 let",
  ageRangeSenior: "8 let ali več",
  filters: "Filtri",
  // Selected values, not sections. The chips row counts the same things, and
  // two numbers on one screen that both read as "how many filters" have to
  // agree; the one a visitor can check by counting the chips in front of
  // them is the one that wins.
  filtersWithCount: "Filtri, aktivnih: {count}",
  activeFilters: "Aktivni filtri",
  activeFiltersCount: "Aktivni filtri: {count}",
  clearAll: "Počisti vse",
  clearAllFilters: "Počisti vse filtre",
  // Tooltip on a chip: what pressing it gives back. {count} arrives already
  // formatted by animalCount, so the noun agrees with the number.
  removeShowsMore: "Odstrani, +{count}",
  expandFilterGroup: "Pokaži vse izbrane: {label}",
  showMoreFilters: "Pokaži še {count}",
  filtersCleared: "Filtri počiščeni",
  undoClear: "Razveljavi",
  undoClearFilters: "Razveljavi čiščenje filtrov",
  sortBy: "Razvrsti živali",
  sortLongestInShelter: "Najdlje v zavetišču",
  sortNewestArrivals: "Najnovejši sprejemi",
  sortYoungest: "Najmlajši najprej",
  sortOldest: "Najstarejši najprej",
  sortName: "Ime A–Ž",
  sortNearest: "Najbližje",
  // The Kje row's hint once an origin exists. The colon shape rather than
  // "Iz {place}": the slot takes a place name straight out of the postal
  // gazetteer, which carries nominatives only, and "Iz Ljubljana" is not a
  // sentence. Same sidestep sortedByDistanceFrom makes below.
  originFrom: "Izhodišče: {place}",
  show: "Prikaži",
  removeFilter: "Odstrani filter {label}",
  health: "Zdravje",
  // The scope row's heading, in the panels and in the sheet. One word, because
  // the row under it already names the answer ("Vsa Slovenija", "3 od 17
  // zavetišč") and the map behind it is what the answer is chosen on.
  where: "Kje",
  // Under the scope sentence while nothing is picked, where "Vsa zavetišča" on
  // its own says what is in scope but not that the row answers to a press.
  // Gone the moment a shelter is picked: by then the row has been used once and
  // the sentence above carries the state.
  whereMapInvite: "Izberi zavetišča na zemljevidu",
  // The word beside the pin at the end of the scope row, naming what the press
  // opens.
  mapCaption: "Zemljevid",
  close: "Zapri",
  locationOutsideMap:
    "Tvoja lokacija je zunaj zemljevida. Seznam je vseeno razvrščen po bližini.",
  sortedByDistance: "Seznam je razvrščen po bližini.",
  sortedByDistanceFrom: "Izhodišče: {label}. Razvrščeno po bližini.",
  postcodeOrTown: "Bližina: kraj ali pošta",
  locationNotFound: "Tega kraja ne najdem. Poskusi s poštno številko.",
  postcodeNotFound: "Te poštne številke ne najdem. Preveri vnos.",
  clearLocation: "Počisti kraj",
  shelterPickerLabel: "Zavetišče: {label}. Odpri zemljevid.",
  whereSearching: "Kje iščeš?",
  // The chip over the map says the one thing the map alone has to say, and
  // stops. Naming the list as a third way in was a third line of copy about
  // something already on screen: the panel is docked beside the map at lg and
  // open as a sheet below it.
  mapInstructionsDesktop: "Klikni regijo ali zavetišče",
  mapInstructionsMobile: "Izberi regijo na zemljevidu",
  mapInstructionsMuni: "Zemljevid pokaže pristojno zavetišče",
  locating: "Iščem lokacijo…",
  nearestFirst: "Najbližje prvo",
  // The picker's way out, naming what is behind it rather than the press
  // itself. {count} arrives already formatted by animalCount, so the noun and
  // its agreement are decided in lib/labels.ts and this string only supplies
  // the verb. Accusative after "Pokaži", which for žival is the same in every
  // form as the nominative animalCount returns.
  showAnimals: "Pokaži {count}",
  searchShelters: "Išči zavetišče po imenu…",
  noSheltersFound: "Ni zadetkov za",
  clearSearch: "Počisti iskanje",
  // The label on the hero's found-animal button, and the whole of it. A line
  // of page text beside the control said the same thing twice, and a note
  // under it explaining who pays read as a subtitle written to sell. What the
  // dialog does with the answer, the dialog says on arrival.
  muniPromptTitle: "Si našel žival?",
  muniTab: "Najdena žival",
  muniSearch: "Občina ali poštna številka …",
  muniHint:
    "Vpiši občino ali poštno številko kraja, kjer je bila žival najdena, in dobiš pristojno zavetišče s kontakti.",
  muniHere: "Uporabi mojo lokacijo",
  retryLocation: "Poskusi znova",
  muniPostcodeInstead:
    "Namesto tega vpiši poštno številko kraja, kjer je bila žival najdena.",
  muniExampleLead: "Npr.:",
  muniFromPostcode: "Pošta {code} {name}",
  muniWhichOne: "Ta pošta pokriva več občin. Katera je prava?",
  muniNoMatch: "Ni občine z imenom",
  muniResponsible: "pristojno zavetišče",
  muniResponsiblePlural: "pristojni zavetišči",
  muniOnSite: "Živali tega zavetišča so na posvoji.si ({count})",
  muniCall: "Pokliči {phone}",
  muniCost:
    "Stroške odlova, prevoza, veterinarskega pregleda in oskrbe prvih 30 dni krije občina, kjer je bila žival najdena. Tebe kot najditelja ne stane nič.",
  muniCostSource: "Zakon o zaščiti živali, 31. člen",
  muniStepsTitle: "Kaj zdaj",
  muniStep1:
    "Pokliči zavetišče in povej, kje je žival. Odlov in prevoz sta del javne službe.",
  muniStep2:
    "Če je žival označena s čipom, zavetišče preveri register in v 24 urah obvesti lastnika.",
  muniStep3: "Poškodovane živali ne premikaj na silo. To povej po telefonu.",
  muniLost: "Si žival izgubil? Poglej živali v tem zavetišču",
  muniNearestTitle: "Najbližja zavetišča",
  muniNearestNote:
    "Ni potrjeno, da so pristojna za to občino. Pokliči in vprašaj.",
  muniUnverified: "ni preverjenega podatka",
  muniUnverifiedAdvice:
    "Za to občino nimamo preverjenega podatka o pristojnem zavetišču. Preveri pri svoji občini ali v javnem registru zavetišč.",
  muniRegister: "Register zavetišč — UVHVVR (gov.si)",
  muniSource: "Vir:",
  muniDatedSource:
    "Podatek je iz starejšega vira; pred obiskom preveri pri zavetišču ali občini.",
  muniSelectShelter: "Izberi to zavetišče",
  muniShelterSelected: "Izbrano",
  speciesDogs: "Psi",
  speciesCats: "Mačke",
  // Genitive plural of each species tab, for sentences built around "nima"
  // ("nima psov", not "nima psi"). "All" and "other" both read as "živali":
  // the plural of žival takes the same form in nominative and genitive.
  speciesAbsenceAll: "živali",
  speciesAbsenceDogs: "psov",
  speciesAbsenceCats: "mačk",
  speciesAbsenceOther: "drugih živali",
  longestWaiting: "Najdlje čaka: {name}, {duration}",
  showShelterDetails: "Pokaži podrobnosti za {label}",
  hideShelterDetailsFor: "Skrij podrobnosti za {label}",
  showShelterDetailsShort: "Pokaži podrobnosti",
  hideShelterDetails: "Skrij podrobnosti",
  lessThanOneKm: "manj kot 1 km",
  fewerAnimals: "Manj živali",
  moreAnimals: "Več živali",
  shelter: "Zavetišče",
  noAnimalsListed: "Trenutno brez objavljenih živali",
  // The heading now carries how many, because the group folds shut and a
  // closed group has to say what is inside it before anyone opens it. It is
  // also where "Zavetišč z živalmi: 11 od 17" went: that fraction only ever
  // explained this group, so it is said on the group instead of in a status
  // line above a list the group sits at the foot of.
  noAnimalsListedHeadingCount: "Trenutno brez objavljenih živali ({count})",
  // The metadata line an empty region's callout carries. Lowercase-calm like
  // the counts it stands in for, because it answers the same question.
  noSheltersInRegion: "Ni zavetišč v tej regiji",
  // The second line under it, when the coverage table knows who answers for
  // the občine inside that region. Same vocabulary as the found-animal mode's
  // "pristojno zavetišče", said as a sentence because it stands on its own
  // line here rather than after a middot.
  //
  // Three forms, because the verb agrees with how many shelters are named and
  // Slovenian's dual is not optional: one skrbi, two skrbita, three or more
  // skrbijo. English inflects nothing here, so its three read alike.
  regionCoveredBy: "Zanje skrbi {shelters}",
  regionCoveredByTwo: "Zanje skrbita {shelters}",
  regionCoveredByMany: "Zanje skrbijo {shelters}",
  selectedRegionLegend: "Izbrana regija",
  mixedRegionLegend: "Delno izbrana regija",
  emptyShelterLegend: "Zavetišče brez živali",
  originLegend: "Izhodišče",
  regionBoundaries: "Meje statističnih regij in poštni okoliši",
  // The hillshade under the region fills is computed from a public elevation
  // model, and the model asks to be named. Same quiet register as the GURS
  // credit it stands next to.
  reliefSource: "Senčenje reliefa",
  shelterMapLabel: "Zemljevid zavetišč po statističnih regijah",
  // The picker's floating panel, which folds away to a rail so the map can
  // have the whole plate back.
  collapsePanel: "Skrij seznam",
  expandPanel: "Pokaži seznam",
  geolocationDenied: "Dostop do lokacije je zavrnjen.",
  geolocationUnavailable: "Lokacije ni bilo mogoče določiti.",
  geolocationTimeout: "Iskanje lokacije je trajalo predolgo.",
  geolocationUnsupported: "Brskalnik ne pozna lokacije.",
  // The filter section asks about the visitor's home; the dialog row states
  // what the shelter answered about the animal. Two questions, two labels.
  goodWith: "Doma imam",
  goodWithFacts: "Družba",
  resetGoodWithFilters: "Ponastavi, kdo živi pri tebi",
  goodWithFilterHint:
    "Označi, kdo že živi pri tebi. Živali brez odgovora zavetišča so skrite.",
  // The section reads as one sentence, so the phrases are whole and translated,
  // never assembled from parts in the component.
  goodWithOutcome:
    "Prikazane so živali, ki se razumejo {list}. {count} od {total}.",
  // Lead carries the preposition, which in Slovenian depends on the word that
  // follows it. Tail is the same noun without it, for the rest of the list.
  goodWithLeadKids: "z otroki",
  goodWithLeadDogs: "s psi",
  goodWithLeadCats: "z mačkami",
  goodWithTailKids: "otroki",
  goodWithTailDogs: "psi",
  goodWithTailCats: "mačkami",
  goodWithJoiner: "in",
  goodWithChipKids: "Doma: otroci",
  goodWithChipDogs: "Doma: pes",
  goodWithChipCats: "Doma: mačka",
  goodWithYesKids: "Se razume z otroki",
  goodWithYesDogs: "Se razume s psi",
  goodWithYesCats: "Se razume z mačkami",
  goodWithNoKids: "Raje brez otrok",
  goodWithNoDogs: "Raje brez psov",
  goodWithNoCats: "Raje brez mačk",
  goodWithUnknownKids: "Otroci: ni znano",
  goodWithUnknownDogs: "Psi: ni znano",
  goodWithUnknownCats: "Mačke: ni znano",
  hintGoodWithKids: "Zavetišče presoja, da se {name} razume z otroki.",
  hintGoodWithDogs: "Zavetišče presoja, da se {name} razume s psi.",
  hintGoodWithCats: "Zavetišče presoja, da se {name} razume z mačkami.",
  home: "Dom",
  resetHomeFilters: "Ponastavi filter doma",
  homeFilterHint:
    "Živali, za katere zavetišče presoja, da lahko srečno živijo v stanovanju.",
  homeOutcome:
    "Prikazane so živali, primerne za stanovanje. {count} od {total}.",
  apartmentYes: "Primeren za stanovanje",
  apartmentNo: "Potrebuje več prostora kot stanovanje",
  hintApartmentOk: "Zavetišče presoja, da lahko {name} živi v stanovanju.",
  // The section is an invitation, not a warning: it exists for the visitor who
  // came to help, so the words never describe the animal as a problem.
  care: "Posebna skrb",
  resetCareFilters: "Ponastavi filter posebne skrbi",
  careFilterHint:
    "Za tiste, ki želijo pomagati živali, ki potrebuje več časa in razumevanja.",
  careOutcome:
    "Prikazane so živali, ki iščejo potrpežljivega človeka. {count} od {total}.",
  specialNeedsNote:
    "Ta žival potrebuje potrpežljivega človeka in nekaj več časa.",
} as const;

export type Messages = { [Key in keyof typeof sl]: string };

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
  moreInformation: "More information",
  backToTop: "Back to top",
  backToAnimals: "Back to the animals",
  resources: "Trusted animal-care resources",
  shelters: "Shelters",
  forShelters: "For shelters",
  chooseLanguage: "Choose language",
  // A statement, matching the Slovenian. It used to read "See photo on the
  // shelter's website", which is an instruction the click does not carry out:
  // on a card this box is a link to the animal's own page, not to the shelter.
  photoAtShelter: "Photo is on the shelter’s website",
  previousPhoto: "Previous photo",
  nextPhoto: "Next photo",
  photoCount: "Photo {current} of {total}",
  showPhoto: "Show photo {n}",
  viewPhotoLarge: "Open photo {n} full screen",
  openDetails: "Open details for {name}",
  previousAnimal: "Previous animal",
  nextAnimal: "Next animal",
  share: "Share",
  linkCopied: "Link copied",
  foundHome: "This animal has already found a home.",
  viewOriginalListing: "View the shelter’s listing",
  animalDetails: "Animal details",
  factAge: "Age",
  factBreed: "Breed",
  factSize: "Size",
  factTimeInShelter: "In the shelter",
  factOrigin: "Found in",
  longStay: "{name} has been waiting in the shelter for {duration}.",
  longStayUnnamed: "At the shelter for {duration} now.",
  longStayLink: "See who has waited longest",
  longStayMark: "Waiting {duration}",
  healthAllClear: "Full health record ({count}/{count})",
  showHealthDetails: "Show details",
  readMore: "Read more",
  showLess: "Show less",
  hintSterilizacija: "The animal is spayed or neutered.",
  hintCepljenje: "The animal is vaccinated.",
  hintCip: "The animal is microchipped.",
  hintBrezFiv: "Tested negative for feline immunodeficiency virus (FIV).",
  hintBrezFelv: "Tested negative for feline leukemia virus (FeLV).",
  statusAvailable: "available",
  statusReserved: "reserved",
  statusAdopted: "adopted",
  statusHold: "not available",
  lessThanMonth: "less than a month",
  unnamed: "Unnamed",
  animalsComingSoon: "Animals will appear here when the first shelters join.",
  resultsHeading: "Animals",
  skipResults: "Skip the list of animals",
  noResults: "No results.",
  tryFewerFilters: "Try using fewer filters.",
  clearFilters: "Clear filters",
  noResultsShelterSingular: "The selected shelter currently has no {species}.",
  noResultsShelterPlural: "The selected shelters currently have no {species}.",
  showFromAllShelters: "Show from all shelters",
  clear: "Clear",
  resetFilters: "Reset",
  resetAgeFilters: "Reset age filters",
  resetSexFilters: "Reset sex filters",
  resetSizeFilters: "Reset size filters",
  resetEnergyFilters: "Reset energy filters",
  resetHealthFilters: "Reset health filters",
  resetShelterFilters: "Reset the shelter selection",
  ageFilterHint: "Choose one or more ages.",
  energyFilterHint:
    "As judged by the shelter. Animals with no answer are hidden by this filter.",
  healthFilterHint: "Matches at least one selected trait.",
  ageRangeYoung: "under 1 year",
  ageRangeAdult: "1–8 years",
  ageRangeSenior: "8 years or older",
  filters: "Filters",
  filtersWithCount: "Filters, {count} active",
  activeFilters: "Active filters",
  activeFiltersCount: "Active filters: {count}",
  clearAll: "Clear all",
  clearAllFilters: "Clear all filters",
  removeShowsMore: "Remove, +{count}",
  expandFilterGroup: "Show all selected: {label}",
  showMoreFilters: "Show {count} more",
  filtersCleared: "Filters cleared",
  undoClear: "Undo",
  undoClearFilters: "Undo clearing the filters",
  sortBy: "Sort animals",
  sortLongestInShelter: "Longest in shelter",
  sortNewestArrivals: "Newest arrivals",
  sortYoungest: "Youngest first",
  sortOldest: "Oldest first",
  sortName: "Name A–Z",
  sortNearest: "Nearest",
  originFrom: "From {place}",
  show: "Show",
  removeFilter: "Remove filter {label}",
  health: "Health",
  where: "Where",
  whereMapInvite: "Pick shelters on the map",
  mapCaption: "Map",
  close: "Close",
  locationOutsideMap:
    "Your location is outside the map. The list is still sorted by distance.",
  sortedByDistance: "The list is sorted by distance.",
  sortedByDistanceFrom: "From {label}. Sorted by distance.",
  postcodeOrTown: "Near: town or postcode",
  locationNotFound: "No such place. Try a postcode.",
  postcodeNotFound: "No such postcode. Check the number.",
  clearLocation: "Clear location",
  shelterPickerLabel: "Shelter: {label}. Open map.",
  whereSearching: "Where are you looking?",
  mapInstructionsDesktop: "Click a region or a shelter",
  mapInstructionsMobile: "Pick a region on the map",
  mapInstructionsMuni: "The map shows the responsible shelter",
  locating: "Finding your location…",
  nearestFirst: "Nearest first",
  showAnimals: "Show {count}",
  searchShelters: "Search shelters by name…",
  noSheltersFound: "No matches for",
  clearSearch: "Clear search",
  muniPromptTitle: "Found an animal?",
  muniTab: "Found an animal",
  muniSearch: "Municipality or postcode …",
  muniHint:
    "Type the municipality or the postcode of the place where the animal was found to get the responsible shelter and its contacts.",
  muniHere: "Use my location",
  retryLocation: "Try again",
  muniPostcodeInstead:
    "Or type the postcode of the place where the animal was found.",
  muniExampleLead: "E.g.:",
  muniFromPostcode: "Postcode {code} {name}",
  muniWhichOne: "This postcode covers several municipalities. Which one?",
  muniNoMatch: "No municipality named",
  muniResponsible: "responsible shelter",
  muniResponsiblePlural: "responsible shelters",
  muniOnSite: "This shelter's animals are on posvoji.si ({count})",
  muniCall: "Call {phone}",
  muniCost:
    "Capture, transport, the veterinary examination and the first 30 days of care are paid by the municipality where the animal was found. As the finder you pay nothing.",
  muniCostSource: "Animal Protection Act, Article 31",
  muniStepsTitle: "What now",
  muniStep1:
    "Call the shelter and say where the animal is. Capture and transport are part of the public service.",
  muniStep2:
    "If the animal is chipped, the shelter checks the register and notifies the owner within 24 hours.",
  muniStep3: "Do not force-move an injured animal. Say so on the phone.",
  muniLost: "Lost your animal? Look at this shelter's animals",
  muniNearestTitle: "Nearest shelters",
  muniNearestNote:
    "Not confirmed as responsible for this municipality. Call and ask.",
  muniUnverified: "no verified data",
  muniUnverifiedAdvice:
    "We have no verified data on the responsible shelter for this municipality. Check with your municipality or the public shelter register.",
  muniRegister: "Shelter register — UVHVVR (gov.si)",
  muniSource: "Source:",
  muniDatedSource:
    "This comes from an older source; confirm with the shelter or municipality before visiting.",
  muniSelectShelter: "Select this shelter",
  muniShelterSelected: "Selected",
  speciesDogs: "Dogs",
  speciesCats: "Cats",
  speciesAbsenceAll: "animals",
  speciesAbsenceDogs: "dogs",
  speciesAbsenceCats: "cats",
  speciesAbsenceOther: "other animals",
  longestWaiting: "Waiting longest: {name}, {duration}",
  showShelterDetails: "Show details for {label}",
  hideShelterDetailsFor: "Hide details for {label}",
  showShelterDetailsShort: "Show details",
  hideShelterDetails: "Hide details",
  lessThanOneKm: "less than 1 km",
  fewerAnimals: "Fewer animals",
  moreAnimals: "More animals",
  shelter: "Shelter",
  noAnimalsListed: "No animals listed right now",
  noAnimalsListedHeadingCount: "No animals listed right now ({count})",
  noSheltersInRegion: "No shelters in this region",
  regionCoveredBy: "Covered by {shelters}",
  regionCoveredByTwo: "Covered by {shelters}",
  regionCoveredByMany: "Covered by {shelters}",
  selectedRegionLegend: "Selected region",
  mixedRegionLegend: "Partly selected region",
  emptyShelterLegend: "Shelter with no animals",
  originLegend: "Starting point",
  regionBoundaries: "Statistical region boundaries and postal districts",
  reliefSource: "Relief shading",
  shelterMapLabel: "Map of shelters by statistical region",
  collapsePanel: "Hide the list",
  expandPanel: "Show the list",
  geolocationDenied: "Location access was denied.",
  geolocationUnavailable: "Your location could not be determined.",
  geolocationTimeout: "Finding your location took too long.",
  geolocationUnsupported: "Location is not available in this browser.",
  goodWith: "At home I have",
  goodWithFacts: "Good with",
  resetGoodWithFilters: "Reset who lives with you",
  goodWithFilterHint:
    "Tell us who already lives with you. Animals the shelter has not answered for stay hidden.",
  goodWithOutcome:
    "Showing animals that get on with {list}. {count} of {total}.",
  goodWithLeadKids: "kids",
  goodWithLeadDogs: "dogs",
  goodWithLeadCats: "cats",
  goodWithTailKids: "kids",
  goodWithTailDogs: "dogs",
  goodWithTailCats: "cats",
  goodWithJoiner: "and",
  goodWithChipKids: "Home: kids",
  goodWithChipDogs: "Home: dog",
  goodWithChipCats: "Home: cat",
  goodWithYesKids: "Good with kids",
  goodWithYesDogs: "Good with dogs",
  goodWithYesCats: "Good with cats",
  goodWithNoKids: "Better without kids",
  goodWithNoDogs: "Better without dogs",
  goodWithNoCats: "Better without cats",
  goodWithUnknownKids: "Kids: not known",
  goodWithUnknownDogs: "Dogs: not known",
  goodWithUnknownCats: "Cats: not known",
  hintGoodWithKids: "The shelter judges that {name} gets on with children.",
  hintGoodWithDogs: "The shelter judges that {name} gets on with dogs.",
  hintGoodWithCats: "The shelter judges that {name} gets on with cats.",
  home: "Home",
  resetHomeFilters: "Reset the home filter",
  homeFilterHint:
    "Animals the shelter judges can live happily in an apartment.",
  homeOutcome: "Showing apartment-friendly animals. {count} of {total}.",
  apartmentYes: "Apartment-friendly",
  apartmentNo: "Needs more room than an apartment",
  hintApartmentOk: "The shelter judges that {name} can live in an apartment.",
  care: "Special care",
  resetCareFilters: "Reset the special care filter",
  careFilterHint:
    "For those who want to help an animal that needs more time and understanding.",
  careOutcome:
    "Showing animals looking for a patient person. {count} of {total}.",
  specialNeedsNote:
    "This animal needs a patient person and a little more time.",
};

const messages: Record<Locale, Messages> = { sl, en };

export type TranslationKey = keyof Messages;

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}

// Fills {name} placeholders. Exported because the portal keeps its own
// Slovenian-only strings outside Messages but writes placeholders the same way.
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values: Record<string, string | number> = {},
): string {
  return interpolate(messages[locale][key], values);
}
