import { Logo } from "@/components/logo";
import { QrCode } from "@/components/poster/qr-code";
import type { Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_TEXT,
  sreckoMilestones,
  sreckoPortrait,
} from "@/lib/srecko";
import "./poster.css";
import "./srecko-poster.css";

export function SreckoPoster({ locale }: { locale: Locale }) {
  const text = SRECKO_TEXT[locale];
  const portrait = sreckoPortrait();
  const isRender = SRECKO.photos.length === 0;
  const milestones = sreckoMilestones(locale);
  const url = `${SITE_URL}${SRECKO_PATHS[locale]}`;
  const printedUrl = url.replace(/^https?:\/\//, "");

  return (
    <article className="poster-sheet poster-sheet--memorial" aria-label={text.memorial}>
      <header className="poster-memorial-head">
        <p className="poster-memorial-label">{text.memorial}</p>
        <h1 className="poster-headline">{SRECKO.name}</h1>
      </header>
      <div className="poster-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portrait.src}
          alt={portrait.alt[locale]}
          width={portrait.width}
          height={portrait.height}
          className="poster-photo-image"
        />
      </div>
      <div className="poster-memorial-story">
        {SRECKO.memory && <p className="memorial-memory">{SRECKO.memory[locale]}</p>}
        <p className="memorial-origin">{text.posterStory}</p>
        {milestones.length > 0 && (
          <p className="poster-timeline">
            {milestones.map(event => `${event.label}: ${event.date}`).join(" · ")}
          </p>
        )}
      </div>
      <footer className="memorial-footer">
        <div className="memorial-footer-copy">
          <span className="poster-brand">
            <Logo className="poster-brand-mark" />
            <span className="poster-wordmark">posvoji.si</span>
          </span>
          <p className="poster-scan-invitation">{text.scan}</p>
          <a className="poster-url" href={url}>
            {printedUrl}
          </a>
        </div>
        <a className="memorial-qr" href={url} aria-label={text.story}>
          <QrCode value={url} label={text.memorial} />
        </a>
      </footer>
      <p className="poster-credit">{isRender ? text.credit : text.photoCredit}</p>
    </article>
  );
}
