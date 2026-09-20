"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-context";
import { quotedLang } from "@/lib/i18n-format";
import { sourceFreshness, verificationDate } from "@/lib/source-freshness";

export function SourceFreshness({
  attribution,
  checkedAt,
  reference,
}: {
  /** Provider credit, printed verbatim beside the last source check. */
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
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const { age, isOld } = sourceFreshness(checkedAt, locale, now);
  return (
    <div className="space-y-2 text-xs text-muted-foreground" data-slot="source-freshness">
      <p>
        {/* Provider credits stay in Slovenian in both locales. */}
        {attribution && <span lang={quotedLang("sl", locale)}>{attribution}</span>}
        {attribution && " · "}
        {checkedAt && age !== null ? (
          <>
            {messages.sourceVerified}{" "}
            {/* The machine value stays the instant. Only what is read changes. */}
            <time dateTime={checkedAt}>{verificationDate(checkedAt, locale)}</time>
          </>
        ) : (
          messages.sourceVerificationUnknown
        )}
      </p>
      {/* The instruction and nothing else. This used to end in "Zadnje
          preverjanje: pred 15 dnevi.", which is the date in the line directly
          above told a second time in a second format and under a second label,
          and it pushed the one thing to do off the end of a bold sentence.
          The paragraph is drawn only when the check is old, so its presence is
          already what the age clause was saying. */}
      {isOld && <p className="font-medium">{messages.sourceVerificationOld}</p>}
    </div>
  );
}
