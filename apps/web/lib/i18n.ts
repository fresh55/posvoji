export type Locale = "sl" | "en";

const sl = {
  metadataDescription:
    "Odprt indeks živali iz slovenskih zavetišč, ki iščejo dom. Vsaka žival z jasnim virom in povezavo na zavetišče.",
  githubTitle: "Cepljena, sterilizirana, brez znanih napak.",
  // The footer's link to the repository, as one string. It used to be two
  // keys printed one after the other, the second of them beginning with a
  // comma, which is the assembly the goodWith section below refuses in the
  // same file: the phrases are whole and translated, never put together in
  // the component.
  openSourceInvite: "Odprta koda, pomagaš lahko tudi ti.",
  // What a link that leaves the site says. Word for word the shelters page's
  // own note, so the site says this one way rather than three.
  newWindow: "(odpre se v novem oknu)",
  // The three ways to reach a shelter, named. Two surfaces print these: the
  // register card and the shelter page, both of them into the accessible name
  // of a link whose visible label is the number or the address. A screen
  // reader meets the same word on both or the two pages describe one shelter
  // in two vocabularies, which is the drift messages.shelters already exists
  // to end for the breadcrumb.
  contactPhone: "Telefon",
  contactEmail: "E-pošta",
  contactWebsite: "Spletna stran",
  heroTitle: "Živali iz slovenskih zavetišč, ki iščejo dom.",
  updated: "osveženo",
  footer:
    "Podatke zagotavljajo zavetišča. Pri vsaki živali je naveden vir in povezava na izvorno objavo. Posvojitev vedno poteka pri zavetišču.",
  // The same fact the homepage states beside the shelter count with `updated`,
  // said as a sentence because the footer has no count to hang it on. It is
  // the one place an animal page reached from a search engine says how old the
  // listing is, which is this site's whole claim over a shelter's Facebook
  // page. {date} comes from registerDateLabel, numeric in Slovenian, so there
  // is no month name here to decline.
  footerUpdated: "Seznam objavljen {date}. Čas preverjanja je naveden pri posamezni živali.",
  sourceVerified: "Objava pri viru preverjena:",
  listPublished: "Seznam objavljen",
  sourceVerificationUnknown: "čas ni znan",
  sourceVerificationOld: "Preverjanje je starejše ali ni potrjeno. Pred obiskom preverite razpoložljivost pri zavetišču.",
  // The line the contact address follows, on every page rather than only on
  // /o-nas. A wrong listing is the likeliest reason anyone writes, and the
  // page it is wrong on is not the about page. The address itself stays the
  // one CONTACT_EMAIL in lib/site.ts and is printed as itself rather than
  // behind a word, the rule about-page.tsx records: a reader writing from
  // their own mail client has to be able to read it off the page.
  footerContact: "Popravek ali vprašanje?",
  moreInformation: "Več informacij",
  // The footer's own <nav>. It used to carry moreInformation as well, and on
  // the shelters page the header nav and this one both render from lg up, so
  // a screen reader's landmarks rotor listed two navigations under one name
  // and neither said which was which. The header keeps the general name; the
  // one at the bottom of the page says where it is.
  footerLinks: "Povezave v nogi",
  // The hamburger button that opens the mobile menu. Distinct from
  // moreInformation, which stays on the <nav> landmarks around the same
  // links: a button that opens a menu has to say so, not describe what is
  // inside it.
  menu: "Meni",
  // The first focusable thing on the page, in the header above everything
  // else. Every navigation on this site is a document load, so the chrome's
  // tab stops are paid again on every page a keyboard visitor opens, not once
  // per visit. Same verb as the two bypass links inside the page below.
  skipToContent: "Preskoči na vsebino",
  // The breadcrumb's landmark name. The primitive hardcodes an English
  // aria-label, which a Slovenian screen reader voices with Slovenian
  // phonemes on every page above the root. Not "Drobtinice": a calque of the
  // English metaphor names nothing a reader would say. The other landmarks
  // here are descriptive phrases, and the portal names its own trail the same
  // way. English keeps "Breadcrumb", which is the ARIA convention.
  breadcrumbNav: "Pot do strani",
  backToTop: "Na vrh strani",
  /** The root crumb. The site root is the animal grid, so the trail names it
   *  as the place it is rather than as an abstract "home". */
  allAnimals: "Vse živali",
  notFoundTitle: "Stran ne obstaja",
  notFoundBody: "Povezava je morda napačna ali stran ni več na voljo.",
  errorTitle: "Nekaj je šlo narobe",
  tryAgain: "Poskusi znova",
  resources: "Strokovno preverjeni viri",
  shelters: "Zavetišča",
  about: "O nas",
  // Not "Za zavetišča", which names an audience and leaves the shelter to
  // guess whether there is a way in behind it. The word they scan a header
  // for is "Prijava"; "za zavetišča" is what keeps a visitor from reading it
  // as an account this site asks them for. Both halves earn their place, so
  // neither is dropped at a narrow width.
  shelterLogin: "Prijava za zavetišča",
  chooseLanguage: "Izberi jezik",
  photoAtShelter: "Fotografija na strani zavetišča",
  previousPhoto: "Prejšnja fotografija",
  nextPhoto: "Naslednja fotografija",
  photoCount: "Fotografija {current} od {total}",
  // The photograph's own text alternative, for a surface where the picture is
  // not already named by the control around it. The animal's name alone is not
  // one: it names the subject and reads the same for every photo in the set, so
  // the position is part of it. A lone photo has no position to state.
  photoAlt: "Fotografija: {name}, {current} od {total}",
  photoAltSingle: "Fotografija: {name}",
  showPhoto: "Pokaži fotografijo {n}",
  viewPhotoLarge: "Odpri fotografijo {n} čez cel zaslon",
  allPhotos: "Vse fotografije",
  photoUnavailable: "Fotografije ni mogoče prikazati.",
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
  // A label, not a plea. The dialog's longStay above is the plea, and it has a
  // sentence, the animal's name and the listing button beside it: that is
  // where it can do something. On a card the same words repeat twenty times a
  // screen and decay into wallpaper.
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
  // The same bypass on a shelter's page, where the list is not a result set
  // but everything one shelter has, uncapped: 186 cards at the longest. The
  // label says whose animals they are, because the visitor got here by
  // choosing that shelter.
  skipShelterAnimals: "Preskoči živali tega zavetišča",
  noResults: "Ni zadetkov.",
  // The grid's own load-more control, once the automatic steps are spent.
  // Numerals only, no noun: "še 120" needs no agreement, where "120 živali"
  // would have to re-decide its form for every count the slot can carry.
  showMoreAnimals: "Prikaži še {n}",
  // Under the button. "od {total} živali" stands after "od" in the genitive,
  // and every genitive of žival is "živali", so the noun can be spelled out
  // here without asking plural() to agree with the number.
  shownOfTotal: "{shown} od {total} živali",
  tryFewerFilters: "Poskusi z manj filtri.",
  clearFilters: "Počisti filtre",
  // The zero state gets specific when a shelter selection is the whole
  // reason for it: dropping only the shelter filter would show results.
  // {species} takes one of the speciesAbsence* forms below.
  //
  // Three forms, because the noun and the verb agree with how many shelters
  // are selected and Slovenian's dual is not optional: one zavetišče nima, two
  // zavetišči nimata, three or more zavetišča nimajo. English inflects nothing
  // past one, so its dual and its plural read alike.
  noResultsShelterSingular: "Izbrano zavetišče trenutno nima {species}.",
  noResultsShelterDual: "Izbrani zavetišči trenutno nimata {species}.",
  noResultsShelterPlural: "Izbrana zavetišča trenutno nimajo {species}.",
  showFromAllShelters: "Pokaži iz vseh zavetišč",
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
  // The caption over the sheet's sort row. Short because the control right
  // under it names the order in full, and because it sits in the header block
  // with the sheet's own title.
  sortCaption: "Razvrsti",
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
  // The one box in the shelter picker, and it takes two kinds of answer: a
  // place to measure from and a shelter's name to narrow the list to. The
  // place comes first because it is what the box is for, and the shelter is
  // named because a field that filters by name must not pretend it only takes
  // towns. Three words, so it still fits the 44px box on a 390px phone.
  //
  // The old two fields wrote this twice, "Bližina: kraj ali pošta" over "Išči
  // zavetišče po imenu…", and asked the visitor to decide which one their
  // sentence belonged in before typing it. What the text is, the text now
  // decides: see the field's own comment in location-picker/view.tsx.
  placeOrShelter: "Kraj, pošta ali zavetišče",
  // Only for a postcode, which is the one input that can be nothing but a
  // failed place: four digits match no shelter's name either. A word that
  // resolves to no place is not a mistake any more, it is a name being
  // searched for, so there is no message about it at all.
  postcodeNotFound: "Te poštne številke ne najdem. Preveri vnos.",
  // The X inside the box. Named for the box rather than for a place, because
  // what it takes away may have been a shelter's name. Deliberately not
  // "Počisti iskanje", which the empty list's own way out already carries:
  // two controls one word apart, both on screen at once when a search finds
  // nothing, would be two names for what a screen reader hears as one thing.
  clearField: "Počisti vnos",
  shelterPickerLabel: "Zavetišče: {label}. Odpri zemljevid.",
  whereSearching: "Kje iščeš?",
  // The chip over the map says the one thing the map alone has to say, and
  // stops. Naming the list as a third way in was a third line of copy about
  // something already on screen: the panel is docked beside the map at lg and
  // open as a sheet below it.
  mapInstructionsDesktop: "Klikni regijo ali zavetišče",
  mapInstructionsMobile: "Izberi regijo na zemljevidu",
  locating: "Iščem lokacijo…",
  nearestFirst: "Najbližje prvo",
  // The picker's way out, naming what is behind it rather than the press
  // itself. {count} arrives already formatted by animalCount, so the noun and
  // its agreement are decided in lib/labels.ts and this string only supplies
  // the verb. Accusative after "Pokaži", which for žival is the same in every
  // form as the nominative animalCount returns.
  showAnimals: "Pokaži {count}",
  noSheltersFound: "Ni zadetkov za",
  clearSearch: "Počisti iskanje",
  // The label on the hero's found-animal button, and the whole of it. A line
  // of page text beside the control said the same thing twice, and a note
  // under it explaining who pays read as a subtitle written to sell. What the
  // dialog does with the answer, the dialog says on arrival.
  //
  // Since the flow became a page it is that page's h1 as well, and it does not
  // match the nav label on purpose: muniTab is the noun, because a row of
  // destinations is nouns and a question mark would be the only one in it,
  // while the page itself opens with the question the visitor typed into a
  // search box to get here. The participle stays masculine for the same
  // reason: "našel sem psa" is the search, and the page exists to be found by
  // it. The advice below is where the reader is addressed rather than quoted,
  // and that one is neutral.
  muniPromptTitle: "Si našel žival?",
  muniTab: "Najdena žival",
  // The field's name, said in full, and the hint drawn inside it. They are
  // two keys because the box is 196px wide inside its padding on a 360px
  // phone and the full wording is clipped there, which leaves the reader
  // guessing at the half of it that decides what to type. The hint keeps both
  // things the field takes and drops the words that only make them formal;
  // English says "town" for the same reason the shelter picker's own field
  // does, which is that a postal town is what most people can name.
  muniSearch: "Občina ali poštna številka …",
  muniSearchPlaceholder: "Občina ali pošta",
  muniHere: "Uporabi mojo lokacijo",
  // Two things at once: the field's placeholder while the device's position
  // is the answer, so the pressed arrow beside it has a word to go with it,
  // and the location button's own visible label on a phone. The button is an
  // arrow with a tooltip, and a tooltip is a pointer with a mouse on it: on a
  // phone the one control that fills this field without typing was unnamed.
  muniHereActive: "Moja lokacija",
  retryLocation: "Poskusi znova",
  muniPostcodeInstead:
    "Namesto tega vpiši poštno številko kraja, kjer je bila žival najdena.",
  muniFromPostcode: "Pošta {code} {name}",
  muniWhichOne: "Ta pošta pokriva več občin. Katera je prava?",
  // The finder's own version of postcodeNotFound. The shared one tells the
  // reader to check what they typed, which on this page is a dead end for
  // somebody standing over an animal with the right number and a table that
  // does not hold it. This one names the two other ways into the same answer,
  // both of them controls already on screen. The shelter picker keeps the
  // shared wording: its field takes a town, a postcode or a shelter, so
  // "vpiši občino" would be advice about a field it does not have.
  muniPostcodeNotFound:
    "Te poštne številke ne najdem. Vpiši občino ali uporabi svojo lokacijo.",
  muniNoMatch: "Ni občine z imenom",
  muniSuggestions: "Predlagane občine",
  muniMatches: "Najdene občine: {count}. Izberi pravo.",
  muniKeyboard: "S puščicama gor in dol izberi občino, z Enter potrdi, z Escape zapri seznam.",
  muniMoreMatches: "Dopolni vnos, da zožiš izbor.",
  muniResponsible: "pristojno zavetišče",
  muniResponsiblePlural: "pristojni zavetišči",
  muniCall: "Pokliči {phone}",
  // When the number above is answered. Free text from the shelter's own site,
  // copied in Slovenian for both locales: times read the same in either, and
  // a translation of "pon-pet" would be the one thing on the card the shelter
  // did not say.
  muniHours: "Uradne ure",
  // The number that is answered outside those hours, as the second button
  // under the first. It used to be a line of contact detail among the address
  // and the website, which made the one thing to press at eleven at night the
  // smallest target on the card. Same shape as muniCall, so the two calls
  // read as one choice with two times of day.
  muniCallOnCall: "Dežurna {phone}",
  // Over the three sentences under the answer. They are what to do while the
  // call is being made and until somebody comes, and unheaded they read as
  // three more muted lines after the card rather than as a set with a moment
  // of their own.
  muniGuidanceTitle: "Do prihoda pomoči",
  muniCallAdvice:
    "Po telefonu povej točno lokacijo, opis živali in morebitne poškodbe.",
  muniCost: "Odlov in oskrbo plača občina, ne ti.",
  muniCostSource: "Zakon o zaščiti živali, 31. člen",
  muniInjured:
    "Poškodovane živali ne premikaj na silo. Če se ji ni varno približati, ostani na razdalji.",
  // The card's heading is the action, and the shelter under it is the one
  // to take it with: the nearest that has a number. It does not say "the
  // nearest", because that shelter is not always the nearest one. Two of the
  // register's seventeen shelters publish no number, and in Bovec the nearest
  // is one of them: the heading sat over a shelter 49 km away while the one
  // at 21 km was on the list below it. muniNearestTitle is the heading only
  // when nothing on the shortlist has a number at all, and then there is no
  // call to put first.
  muniNearestCall: "Najprej pokliči",
  muniNearestTitle: "Najbližja zavetišča",
  // How far the shelter is. Measured between the občina's centroid and the
  // shelter's town, in a straight line, so a road is longer and this is never
  // a driving time. muniDistanceNote says so once, under the list: a
  // qualifier on every row put every distance on two lines at 375px. The
  // space before the unit is non-breaking.
  muniDistance: "{km}\u00a0km",
  muniDistanceNote: "Razdalje so zračne, od središča občine.",
  // In place of the button, on a shortlist row for a shelter the register has
  // no number for. Says which of the two it is: a number nobody published,
  // not a page that failed to draw it.
  muniNoNumber: "brez objavljene številke",
  // Only the script for the call. The line over the card has already said
  // that nothing is verified, and the note used to say it again in other
  // words three lines later: the one sentence on the card that said nothing
  // new.
  muniNearestNote: "Vprašaj, kdo prevzame žival.",
  // Over the rest of the shortlist, under the number to try first.
  muniNearestOthers: "Če se ne oglasijo",
  // The map's callout beside the ringed shelter, in the register of
  // muniResponsible: what the ring means, and not a claim.
  muniNearest: "najbližje zavetišče",
  // Says what is unverified, in the verified state's own noun: "pristojno
  // zavetišče" over one card, "pristojnost ni preverjena" over the other.
  // "ni preverjenega podatka" was the data file's phrase, and left the reader
  // to guess what the missing datum was.
  muniUnverified: "pristojnost ni preverjena",
  // "kjer je bila žival najdena" and not "kjer si našel žival": the reader is
  // being told what to do, not quoted, so nothing here has to guess their
  // gender. Same construction as muniPostcodeInstead above.
  //
  // The imperative is for an občina the map cannot place, which has no
  // nearest shelters to call first. Under that list the občina is the second
  // call, and muniUnverifiedAlso says so without a second "pokliči".
  muniUnverifiedAdvice:
    "Pokliči občino, kjer je bila žival najdena, in vprašaj, katero zavetišče jo lahko prevzame.",
  muniUnverifiedAlso:
    "Katero zavetišče je pristojno, lahko pove tudi občina, kjer je bila žival najdena.",
  muniSource: "Vir:",
  muniDatedSource:
    "Podatek je iz starejšega vira; pred obiskom preveri pri zavetišču ali občini.",
  // The same caveat where there is room for two words and not for a sentence:
  // after "pristojno zavetišče" in the line under the search box, and in the
  // map's callout beside the ring. Both places named the shelter as
  // responsible with nothing to say the claim rests on an unconfirmed 2023
  // source, which only the 12px source line at the foot of the card admitted.
  // Two words at the point of use, not a badge or a legend.
  muniDatedShort: "starejši vir",
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
  openSourceInvite: "Open source, and you can help.",
  newWindow: "(opens in a new window)",
  contactPhone: "Phone",
  contactEmail: "Email",
  contactWebsite: "Website",
  heroTitle: "Animals from Slovenian shelters looking for a home.",
  updated: "updated",
  footer:
    "Data comes from shelters. Every animal includes its source and original listing. Adoptions always go through the shelter.",
  footerUpdated: "List published {date}. Each animal shows when its source was checked.",
  sourceVerified: "Source listing checked:",
  listPublished: "List published",
  sourceVerificationUnknown: "time unknown",
  sourceVerificationOld: "Verification is older or unconfirmed. Check availability with the shelter before visiting.",
  footerContact: "A correction or a question?",
  moreInformation: "More information",
  footerLinks: "Footer links",
  menu: "Menu",
  skipToContent: "Skip to content",
  breadcrumbNav: "Breadcrumb",
  backToTop: "Back to top",
  allAnimals: "All animals",
  notFoundTitle: "Page not found",
  notFoundBody: "The link may be wrong, or the page is no longer here.",
  errorTitle: "Something went wrong",
  tryAgain: "Try again",
  resources: "Trusted animal-care resources",
  shelters: "Shelters",
  about: "About",
  shelterLogin: "Login for shelters",
  chooseLanguage: "Choose language",
  // A statement, matching the Slovenian. It used to read "See photo on the
  // shelter's website", which is an instruction the click does not carry out:
  // on a card this box is a link to the animal's own page, not to the shelter.
  photoAtShelter: "Photo is on the shelter’s website",
  previousPhoto: "Previous photo",
  nextPhoto: "Next photo",
  photoCount: "Photo {current} of {total}",
  photoAlt: "Photo of {name}, {current} of {total}",
  photoAltSingle: "Photo of {name}",
  showPhoto: "Show photo {n}",
  viewPhotoLarge: "Open photo {n} full screen",
  allPhotos: "All photos",
  photoUnavailable: "This photo can’t be shown.",
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
  skipShelterAnimals: "Skip this shelter’s animals",
  noResults: "No results.",
  showMoreAnimals: "Show {n} more",
  shownOfTotal: "{shown} of {total} animals",
  tryFewerFilters: "Try using fewer filters.",
  clearFilters: "Clear filters",
  noResultsShelterSingular: "The selected shelter currently has no {species}.",
  noResultsShelterDual: "The selected shelters currently have no {species}.",
  noResultsShelterPlural: "The selected shelters currently have no {species}.",
  showFromAllShelters: "Show from all shelters",
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
  sortCaption: "Sort",
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
  placeOrShelter: "Town, postcode or shelter",
  postcodeNotFound: "No such postcode. Check the number.",
  clearField: "Clear input",
  shelterPickerLabel: "Shelter: {label}. Open map.",
  whereSearching: "Where are you looking?",
  mapInstructionsDesktop: "Click a region or a shelter",
  mapInstructionsMobile: "Pick a region on the map",
  locating: "Finding your location…",
  nearestFirst: "Nearest first",
  showAnimals: "Show {count}",
  noSheltersFound: "No matches for",
  clearSearch: "Clear search",
  muniPromptTitle: "Found an animal?",
  muniTab: "Found an animal",
  muniSearch: "Municipality or postcode …",
  muniSearchPlaceholder: "Town or postcode",
  muniHere: "Use my location",
  muniHereActive: "My location",
  retryLocation: "Try again",
  muniPostcodeInstead:
    "Or type the postcode of the place where the animal was found.",
  muniFromPostcode: "Postcode {code} {name}",
  muniWhichOne: "This postcode covers several municipalities. Which one?",
  muniPostcodeNotFound:
    "No such postcode. Type the municipality or use your location.",
  muniNoMatch: "No municipality named",
  muniSuggestions: "Suggested municipalities",
  muniMatches: "Municipalities found: {count}. Choose the correct one.",
  muniKeyboard: "Use the up and down arrows to choose a municipality, Enter to confirm, and Escape to close the list.",
  muniMoreMatches: "Keep typing to narrow the choices.",
  muniResponsible: "responsible shelter",
  muniResponsiblePlural: "responsible shelters",
  muniCall: "Call {phone}",
  muniHours: "Office hours",
  muniCallOnCall: "On-call {phone}",
  muniGuidanceTitle: "Until help arrives",
  muniCallAdvice:
    "On the phone, give the exact location, a description of the animal and any injuries.",
  muniCost: "The municipality pays for capture and care, not you.",
  muniCostSource: "Animal Protection Act, Article 31",
  muniInjured:
    "Do not force an injured animal to move. Keep your distance if it is unsafe to approach.",
  muniNearestCall: "Call first",
  muniNearestTitle: "Nearest shelters",
  muniDistance: "{km}\u00a0km",
  muniDistanceNote: "Distances are straight-line, from the municipality's centre.",
  muniNoNumber: "no published number",
  muniNearestNote: "Ask who will collect the animal.",
  muniNearestOthers: "If there is no answer",
  muniNearest: "nearest shelter",
  muniUnverified: "responsible shelter not verified",
  muniUnverifiedAdvice:
    "Call the municipality where you found the animal and ask which shelter can collect it.",
  muniUnverifiedAlso:
    "The municipality where you found the animal can also say which shelter is responsible.",
  muniSource: "Source:",
  muniDatedSource:
    "This comes from an older source; confirm with the shelter or municipality before visiting.",
  muniDatedShort: "older source",
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

/**
 * The `lang` a quoted string needs, or nothing when the page already says it.
 *
 * The site prints text it did not write in either language: a shelter's own
 * description and attribution, which are always Slovenian and appear on the
 * English pages too, and the resource titles, which are mostly English and sit
 * on a Slovenian page. Unmarked, a screen reader voices all of it with the
 * page's phonemes, which for a paragraph of Slovenian read as English is not
 * an accent but an unintelligible one.
 *
 * Marked only where it says something. `lang` on every one of them would
 * repeat what `<html lang>` already states, and an attribute that is always
 * there is one nobody notices is wrong.
 */
export function quotedLang(
  textLocale: Locale,
  pageLocale: Locale,
): Locale | undefined {
  return textLocale === pageLocale ? undefined : textLocale;
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
