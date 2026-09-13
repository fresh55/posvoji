"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { quotedLang } from "@/lib/i18n";
import { sourceIsOld, verificationDate } from "@/lib/source-freshness";

export function SourceFreshness({
  attribution,
  checkedAt,
  reference,
}: {
  /**
   * The provider's credit, printed verbatim in front of the check. It used to
   * be its own paragraph above this one, which put three lines of footnote
   * under a box whose own content is four. Merged because the two say the same
   * thing about the same listing: who it came from, and when it was last seen.
   */
  attribution?: string;
  checkedAt?: string;
  reference: Date;
}) {
  const { locale, messages } = useI18n();
  const [now, setNow] = useState(reference.getTime());
  useEffect(() => {
    // Start with the server's reference to hydrate consistently, then age even
    // a static page that stays open while publication is interrupted.
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  return (
    <div className="space-y-2 text-xs text-muted-foreground" data-slot="source-freshness">
      <p>
        {/* lang, for the same reason the description carries one: the credit
            is the provider's own Slovenian ("Foto in opis: Zavetišče Test"),
            printed verbatim because that is the condition it is given under.
            See quotedLang in lib/i18n.ts. */}
        {attribution && <span lang={quotedLang("sl", locale)}>{attribution}</span>}
        {attribution && " · "}
        {checkedAt ? (
          <>
            {messages.sourceVerified}{" "}
            {/* The machine value stays the instant. Only what is read changes. */}
            <time dateTime={checkedAt}>{verificationDate(checkedAt, locale)}</time>
          </>
        ) : (
          messages.sourceVerificationUnknown
        )}
      </p>
      {/* Weight, not colour. This was the only saturated ink on the card and
          measured 3.19:1 on white, under the 4.5:1 that 12px text needs; the
          amber on this card also already means the wait, which the hourglass
          says. It inherits the wrapper's muted foreground. */}
      {sourceIsOld(checkedAt, now) && <p className="font-medium">{messages.sourceVerificationOld}</p>}
    </div>
  );
}
