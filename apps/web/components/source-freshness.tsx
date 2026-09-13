"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { sourceIsOld, verificationTime } from "@/lib/source-freshness";

export function SourceFreshness({ checkedAt, reference }: { checkedAt?: string; reference: Date }) {
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
    <div className="space-y-1 text-xs text-muted-foreground" data-slot="source-freshness">
      <p>
        {messages.sourceVerified}{" "}
        {checkedAt ? <time dateTime={checkedAt}>{verificationTime(checkedAt, locale)}</time> : messages.sourceVerificationUnknown}
      </p>
      {sourceIsOld(checkedAt, now) && <p className="text-warn-mark">{messages.sourceVerificationOld}</p>}
    </div>
  );
}
