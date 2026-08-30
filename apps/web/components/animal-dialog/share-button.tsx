"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, Mail, MoreHorizontal, Share2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const CONFIRM_MS = 2000;

// The snapshot below is a capability, not a state: nothing ever notifies.
const subscribeToNothing = () => () => {};

const shareText = {
  sl: {
    heading: "Deli to žival",
    intro: "Povezava odpre stran te živali, s fotografijo in zavetiščem.",
    link: "Povezava",
    copy: "Kopiraj povezavo",
    copied: "Kopirano",
    email: "E-pošta",
    more: "Več",
    invite: (name: string) => `${name} išče dom`,
  },
  en: {
    heading: "Share this animal",
    intro: "The link opens this animal's page, with its photo and shelter.",
    link: "Link",
    copy: "Copy link",
    copied: "Copied",
    email: "Email",
    more: "More",
    invite: (name: string) => `${name} is looking for a home`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

// Simple Icons (CC0). Brand marks, because a share row that spells out
// "Facebook" in a generic glyph is a share row nobody's eye lands on.
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

// The round targets. Big enough for a thumb, labelled underneath so the row
// reads without knowing the marks, and hovering in the same green the filters
// use rather than each brand's own colour, which would turn the popover into
// a logo wall.
const TARGET_CLASS =
  "flex size-11 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs transition-colors hover:border-[var(--filter-accent-border)] hover:bg-[var(--filter-accent)] hover:text-[var(--filter-accent-foreground)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none";

function Target({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <span className={TARGET_CLASS}>{children}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );
  const wrapper = "flex w-16 flex-col items-center gap-1.5 text-center";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        className={wrapper}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={wrapper}>
      {content}
    </button>
  );
}

/**
 * What gets shared is the animal's own page, not the address bar. Both open
 * the same animal, but only the page carries a link preview: a query on the
 * index cannot have its own title, description and card in a static export.
 *
 * The sheet is plain links to each network's own share endpoint, so opening
 * the popover tells nobody anything; only a click the visitor makes leaves
 * the site. The native share sheet joins the row where the platform has one.
 */
export function ShareButton({ path, name }: { path: string; name: string }) {
  const { locale, messages } = useI18n();
  const text = shareText[locale];
  const [copied, setCopied] = useState(false);
  // Whether the platform has a share sheet never changes while the page is
  // open, but the prerendered HTML cannot know it. Read as a client snapshot
  // rather than in an effect, so the native target simply is not there on the
  // server and appears with hydration instead of blinking in after it.
  const canShare = useSyncExternalStore(
    subscribeToNothing,
    () => Boolean(navigator.share),
    () => false,
  );

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const url = `${SITE_URL}${path}`;
  const invite = text.invite(name);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard still shows the link to select.
    }
  }

  async function shareNatively() {
    try {
      await navigator.share?.({ title: invite, url });
    } catch {
      // A cancelled share sheet is not a failure worth reporting.
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* size-11 under sm: icon-sm is 32px, which is under the 44px floor
            every other control on the phone layout was already held to. The
            close button beside this one carries the same override. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={messages.share}
          className="size-11 sm:size-8"
        >
          <Share2 aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{text.heading}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {text.intro}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Target
            label="Facebook"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          >
            <FacebookMark />
          </Target>
          <Target
            label="WhatsApp"
            href={`https://wa.me/?text=${encodeURIComponent(`${invite} ${url}`)}`}
          >
            <WhatsAppMark />
          </Target>
          <Target
            label={text.email}
            href={`mailto:?subject=${encodeURIComponent(invite)}&body=${encodeURIComponent(`${invite}\n${url}`)}`}
          >
            <Mail className="size-4" aria-hidden />
          </Target>
          {canShare && (
            <Target label={text.more} onClick={shareNatively}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Target>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={url}
            aria-label={text.link}
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 flex-1 text-xs text-muted-foreground"
          />
          <Button
            type="button"
            variant={copied ? "secondary" : "outline"}
            size="icon-sm"
            onClick={copy}
            aria-label={copied ? text.copied : text.copy}
            className={cn(
              copied &&
                "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
            )}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-center text-xs text-[var(--filter-accent-strong)] transition-opacity",
            copied ? "opacity-100" : "opacity-0",
          )}
        >
          {messages.linkCopied}
        </p>
      </PopoverContent>
    </Popover>
  );
}
