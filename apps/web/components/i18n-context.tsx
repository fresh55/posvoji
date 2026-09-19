"use client";

import { createContext, useContext, type ReactNode } from "react";
import { interpolate } from "@/lib/i18n-format";
import {
  type Messages,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n";

type I18n = {
  locale: Locale;
  messages: Messages;
  t: (
    key: TranslationKey,
    values?: Record<string, string | number>,
  ) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function ClientI18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value: I18n = {
    locale,
    messages,
    t: (key, values) => interpolate(messages[key], values ?? {}),
  };
  return (
    <I18nContext value={value}>
      {children}
    </I18nContext>
  );
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
