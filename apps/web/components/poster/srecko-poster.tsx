import { Fragment } from "react";
import { Logo } from "@/components/logo";
import { QrCode } from "@/components/poster/qr-code";
import type { Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import { SRECKO, SRECKO_PATHS, SRECKO_TEXT, sreckoMilestones, sreckoPortrait } from "@/lib/srecko";
import "./poster.css";

/** A memorial sheet using the site's A4 sizing and QR treatment. */
export function SreckoPoster({ locale }: { locale: Locale }) {
  const text = SRECKO_TEXT[locale], portrait = sreckoPortrait();
  const isRender = SRECKO.photos.length === 0, moments = sreckoMilestones(locale);
  const url = `${SITE_URL}${SRECKO_PATHS[locale]}`;
  const printedUrl = url.replace(/^https?:\/\//, "");
  return (
    <div className="poster-sheet poster-sheet--memorial">
      <header className="poster-memorial-head">
        <p className="poster-memorial-label">{text.memorial}</p>
        <h1 className="poster-headline poster-headline--l">{SRECKO.name}</h1>
      </header>
      <div className={`poster-photo${isRender ? " poster-photo--render" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portrait.src} alt={portrait.alt[locale]} className="poster-photo-image" />
      </div>
      <p className="poster-memorial-story">{text.posterStory}{SRECKO.memory && <> {SRECKO.memory[locale]}</>}</p>
      {moments.length > 0 && <p className="poster-timeline">{moments.map(event => `${event.label}: ${event.date}`).join(" · ")}</p>}
      <div className="poster-band">
        <div className="poster-memorial">
          <span className="poster-brand"><Logo className="poster-brand-mark" /><span className="poster-wordmark">posvoji.si</span></span>
          <p className="poster-dedication">{text.dedication}</p>
          <p className="poster-scan-invitation">{text.scan}</p>
        </div>
        <div className="poster-qr">
          <span className="poster-qr-plate"><QrCode value={url} label={text.memorial} /></span>
          <p className="poster-url">{printedUrl.split("/").map((part, index) =>
            <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>)}</p>
        </div>
      </div>
      <p className="poster-credit">{isRender ? text.credit : text.photoCredit}</p>
    </div>
  );
}
