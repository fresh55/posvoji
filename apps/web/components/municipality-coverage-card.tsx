"use client";

import type { ReactNode } from "react";
import { Cat, Clock, Dog, Globe, Mail, MapPin, Phone } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { LookupCoverage } from "@/lib/municipality-coverage";
import { Card } from "@/components/ui/card";
import { mailtoHref, telHref } from "@/lib/contact-links";

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

/** One line of contact detail: a glyph, an optional label, and the fact.
 *
 *  The rows differ only in whether the label is drawn or only spoken, so the
 *  decision is this one prop rather than a different flex alignment and a
 *  different label treatment per row. items-start throughout: opening hours
 *  are free text from a shelter's own site and wrap to two lines on a phone,
 *  and a glyph centred against two lines sits in the gap between them. */
function ContactRow({
  icon: Icon,
  label,
  labelHidden = false,
  strong = false,
  children,
}: {
  icon: typeof MapPin;
  label?: string;
  labelHidden?: boolean;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`flex items-start gap-2 ${strong ? "text-foreground" : ""}`}>
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        {label &&
          (labelHidden ? (
            <span className="sr-only">{label}: </span>
          ) : (
            <>{label}: </>
          ))}
        {children}
      </span>
    </li>
  );
}

// One shelter's answer to "who takes the animal found in my municipality".
// The flow ends in a phone call, so the number is the primary control rather
// than one more line of contact details. The name links to the shelter's own
// page, which is where its animals and the rest of its details already are;
// the card used to add a "lost your animal?" link to the same page, which was
// a second question asked of somebody who came with the first.
//
// Its text comes from the i18n hook and not from a prop bag. The bag was
// copied from the server components that draw shelter cards, which cannot
// call the hook; this card is "use client" and so is its only caller, so the
// bag only meant every new line of text had to be threaded through three
// files.
export function CoverageCard({ coverage }: { coverage: LookupCoverage }) {
  const { messages, t } = useI18n();
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={coverage.detailHref}
          className="font-medium underline-offset-4 hover:underline"
        >
          {coverage.shelterName}
        </a>
        <SpeciesTag species={coverage.species} />
      </div>

      {coverage.phone && (
        <Button asChild className="w-full">
          <a href={telHref(coverage.phone)}>
            <Phone className="size-4 shrink-0" aria-hidden />
            {t("muniCall", { phone: coverage.phone })}
          </a>
        </Button>
      )}

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <ContactRow icon={MapPin}>{coverage.city}</ContactRow>
        {/* When the number above is answered, and what to dial when it is
            not. The call at eleven at night to a line nobody picks up is the
            failure this card can otherwise do nothing about, so both rows
            come before the email and the website, which are for daytime.
            The hours name themselves ("Pon-pet 8.00-12.00"), so their label
            is spoken and not drawn; the on-call number would otherwise be a
            second bare phone number under the first. */}
        {coverage.hours && (
          <ContactRow icon={Clock} label={messages.muniHours} labelHidden>
            {coverage.hours}
          </ContactRow>
        )}
        {coverage.onCallPhone && (
          <ContactRow icon={Phone} label={messages.muniOnCall} strong>
            <a
              href={telHref(coverage.onCallPhone)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {coverage.onCallPhone}
            </a>
          </ContactRow>
        )}
        {coverage.email && (
          <ContactRow icon={Mail}>
            <a
              href={mailtoHref(coverage.email)}
              className="block truncate underline-offset-4 hover:text-foreground hover:underline"
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
              className="block truncate underline-offset-4 hover:text-foreground hover:underline"
            >
              {coverage.website
                .replace(/^https?:\/\/(www\.)?/, "")
                .replace(/\/$/, "")}
            </a>
          </ContactRow>
        )}
      </ul>

      <p className="text-xs leading-snug text-muted-foreground">
        {messages.muniSource}{" "}
        {coverage.sourceUrl ? (
          <a
            href={coverage.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {coverage.sourceLabel}
          </a>
        ) : (
          coverage.sourceLabel
        )}{" "}
        ({coverage.sourceDate}).
        {!coverage.confirmed && <> {messages.muniDatedSource}</>}
      </p>
    </Card>
  );
}
