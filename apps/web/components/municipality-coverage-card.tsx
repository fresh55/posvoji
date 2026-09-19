"use client";

import type { ReactNode } from "react";
import {
  Cat,
  Dog,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import type { LookupCoverage } from "@/lib/municipality-coverage";
import { Card } from "@/components/ui/card";
import { ShelterHours } from "@/components/shelter-hours";
import {
  contactName,
  mailtoHref,
  telHref,
  websiteHost,
  websiteName,
} from "@/lib/contact-links";
import { SOURCE_LINK } from "@/lib/link-styles";
import { cn } from "@/lib/utils";

// Size the links themselves; invisible tap targets would overlap adjacent rows.
const CONTACT_LINK =
  "flex min-h-6 items-center underline underline-offset-4 hover:text-foreground pointer-coarse:min-h-11";

function SpeciesTag({ species }: { species: LookupCoverage["species"] }) {
  const { messages } = useI18n();
  if (!species) return null;
  const Icon = species === "dogs" ? Dog : Cat;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {species === "dogs" ? messages.speciesDogs : messages.speciesCats}
    </span>
  );
}

/** Align icons and text vertically within the larger touch targets. */
function ContactRow({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 pointer-coarse:min-h-11 pointer-coarse:items-center">
      <Icon className="mt-0.5 size-3.5 shrink-0 pointer-coarse:mt-0" aria-hidden />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {children}
      </span>
    </li>
  );
}

export function CoverageCard({ coverage }: { coverage: LookupCoverage }) {
  const { messages, t } = useI18n();
  const host = coverage.website ? websiteHost(coverage.website) : undefined;
  return (
    <Card className="min-w-0 space-y-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <a
          href={coverage.detailHref}
          className={`${SOURCE_LINK} min-w-0 [overflow-wrap:anywhere]`}
        >
          {coverage.shelterName}
        </a>
        <SpeciesTag species={coverage.species} />
      </div>

      {coverage.phone || coverage.onCallPhone ? (
        <div className="space-y-2">
          {coverage.phone && (
            <Button asChild size="wrap" className="w-full">
              <a href={telHref(coverage.phone)} className="select-text">
                <Phone className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {t("muniCall", { phone: coverage.phone })}
                </span>
              </a>
            </Button>
          )}
          {coverage.onCallPhone && (
            <Button
              asChild
              variant={coverage.phone ? "outline" : "default"}
              size="wrap"
              className="w-full"
            >
              <a href={telHref(coverage.onCallPhone)} className="select-text">
                <Phone className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {t("muniCallOnCall", { phone: coverage.onCallPhone })}
                </span>
              </a>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {messages.muniPhoneUnavailable}
          </p>
          <Button
            asChild
            variant="outline"
            size="wrap"
            className="w-full"
          >
            <a href={coverage.detailHref}>{messages.muniContactDetails}</a>
          </Button>
        </div>
      )}

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <ContactRow icon={MapPin}>{coverage.city}</ContactRow>
        {coverage.hours && (
          <ShelterHours hours={coverage.hours} label={messages.muniHours} />
        )}
        {coverage.email && (
          <ContactRow icon={Mail}>
            <a
              href={mailtoHref(coverage.email)}
              data-contact="email"
              aria-label={contactName(messages.contactEmail, coverage.email)}
              title={coverage.email}
              className={CONTACT_LINK}
            >
              {coverage.email}
            </a>
          </ContactRow>
        )}
        {coverage.website && (
          <ContactRow icon={Globe}>
            <a
              href={coverage.website}
              target="_blank"
              rel="noreferrer"
              data-contact="website"
              aria-label={websiteName(
                messages.contactWebsite,
                coverage.website,
                messages.newWindow,
              )}
              title={host}
              className={cn(CONTACT_LINK, "gap-1")}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{host}</span>
              <ExternalLink
                className="size-3 shrink-0"
                aria-hidden
                data-external
              />
            </a>
          </ContactRow>
        )}
      </ul>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
        <span>{messages.muniSource}</span>
        {coverage.sourceUrl ? (
          <a
            href={coverage.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-6 min-w-0 items-center underline underline-offset-2 hover:text-foreground pointer-coarse:min-h-11"
          >
            <span className="min-w-0">{coverage.sourceLabel}</span>
            <span className="sr-only"> {messages.newWindow}</span>
          </a>
        ) : (
          <span>{coverage.sourceLabel}</span>
        )}
        <span className="col-start-2 whitespace-nowrap">({coverage.sourceDate}).</span>
        {!coverage.confirmed && (
          <p className="col-span-2 mt-1">{messages.muniDatedSource}</p>
        )}
      </div>
    </Card>
  );
}
