import { interpolate } from "./i18n-format";
import type { Locale } from "./i18n";

// Small shared vocabulary for pure formatters and standalone error boundaries.
export const labelMessages = {
  sl: {
    lessThanMonth: "manj kot mesec",
    cardAge: "starost {age}",
    factStayValue: "V zavetišču: {duration}",
    longStayWholeLife: "{name} v zavetišču čaka že {duration}, skoraj vse svoje življenje.",
    longStay: "{name} v zavetišču čaka že {duration}.",
    longStayWholeLifeUnnamed: "V zavetišču čaka že {duration}, skoraj vse svoje življenje.",
    longStayUnnamed: "V zavetišču čaka že {duration}.",
    statusAvailable: "na voljo",
    statusReserved: "rezervirano",
    statusAdopted: "posvojeno",
    statusHold: "ni za posvojitev",
    goodWithChipKids: "Doma: otroci",
    goodWithChipDogs: "Doma: pes",
    goodWithChipCats: "Doma: mačka",
    unnamed: "Brez imena",
    errorTitle: "Nekaj je šlo narobe",
    tryAgain: "Poskusi znova",
    allAnimals: "Vse živali",
  },
  en: {
    lessThanMonth: "less than a month",
    cardAge: "{age} old",
    factStayValue: "In the shelter: {duration}",
    longStayWholeLife: "{name} has been waiting in the shelter for {duration}, almost its whole life.",
    longStay: "{name} has been waiting in the shelter for {duration}.",
    longStayWholeLifeUnnamed: "At the shelter for {duration} now, almost its whole life.",
    longStayUnnamed: "At the shelter for {duration} now.",
    statusAvailable: "available",
    statusReserved: "reserved",
    statusAdopted: "adopted",
    statusHold: "not available",
    goodWithChipKids: "Home: kids",
    goodWithChipDogs: "Home: dog",
    goodWithChipCats: "Home: cat",
    unnamed: "Unnamed",
    errorTitle: "Something went wrong",
    tryAgain: "Try again",
    allAnimals: "All animals",
  },
};

export type LabelKey = keyof typeof labelMessages.sl;

export function translateLabel(
  locale: Locale,
  key: LabelKey,
  values: Record<string, string | number> = {},
): string {
  return interpolate(labelMessages[locale][key], values);
}
