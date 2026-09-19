"use client";

import { useI18n } from "@/components/i18n-context";

export function DeferredStatus({
  error,
  retry,
}: {
  error?: boolean;
  retry: () => void;
}) {
  const { locale } = useI18n();
  return (
    <span
      role="status"
      className="block rounded-ui bg-background p-2 text-sm text-foreground"
    >
      {error ? (
        <button type="button" className="underline" onClick={retry}>
          {locale === "sl"
            ? "Nalaganje ni uspelo. Poskusi znova."
            : "Loading failed. Try again."}
        </button>
      ) : locale === "sl" ? (
        "Nalaganje …"
      ) : (
        "Loading …"
      )}
    </span>
  );
}
