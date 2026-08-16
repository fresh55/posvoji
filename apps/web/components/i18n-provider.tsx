"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  getMessages,
  translate,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n";

type I18n = {
  locale: Locale;
  messages: ReturnType<typeof getMessages>;
  t: (
    key: TranslationKey,
    values?: Record<string, string | number>,
  ) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value: I18n = {
    locale,
    messages: getMessages(locale),
    t: (key, values) => translate(locale, key, values),
  };
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
