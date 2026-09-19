import type { ReactNode } from "react";
import { getMessages, type Locale } from "@/lib/i18n";
import { ClientI18nProvider } from "./i18n-context";

// Resolve the page's catalogue on the server; only that locale crosses the boundary.
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <ClientI18nProvider locale={locale} messages={getMessages(locale)}>
      {children}
    </ClientI18nProvider>
  );
}
