"use client";

import { Printer } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

const label = {
  sl: "Natisni",
  en: "Print",
} as const;

/**
 * The one interactive thing on the poster route.
 *
 * A button and not an explanation of Ctrl+P: the person this page exists for
 * came here to put paper on a wall, and the sheet below is already the
 * preview. It carries the print dialog and nothing else, so it is the only
 * part of the route that crosses into the browser.
 */
export function PrintButton() {
  const { locale } = useI18n();
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label[locale]}
    </Button>
  );
}
