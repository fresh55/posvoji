"use client";

import type { ReactNode } from "react";
import {
  Cat,
  Clock,
  Dog,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { LookupCoverage } from "@/lib/municipality-coverage";
import { Card } from "@/components/ui/card";
import {
  contactName,
  mailtoHref,
  telHref,
  websiteHost,
  websiteName,
} from "@/lib/contact-links";

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
  children,
}: {
  icon: typeof MapPin;
  label?: string;
  labelHidden?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
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
        {/* The invisible 44px layer below lg: a line of text is under the
            24px a target needs, and the nearest-shelter card's names carry
            the same. */}
        <a
          href={coverage.detailHref}
          className="inline-block font-medium underline-offset-4 hover:underline max-lg:tap-target"
        >
          {coverage.shelterName}
        </a>
        <SpeciesTag species={coverage.species} />
      </div>

      {/* 44px tall below lg: the call is the card, and a phone borrowed to
          make it is held in one hand. The same height as the call on the
          nearest-shelter card, so the two states share one shape.

          The dežurna številka is the same act at a different hour, so it is
          the same control in the quieter variant rather than a line of text
          among the addresses below. It was one: on Koper's card the number
          to ring during office hours was a 44px button and the one to ring at
          night was a 17px link, which is the wrong way round for the call
          that is made in the dark over an animal by a road. */}
      {(coverage.phone || coverage.onCallPhone) && (
        <div className="space-y-2">
          {coverage.phone && (
            <Button asChild className="w-full max-lg:h-11">
              <a href={telHref(coverage.phone)}>
                <Phone className="size-4 shrink-0" aria-hidden />
                {t("muniCall", { phone: coverage.phone })}
              </a>
            </Button>
          )}
          {coverage.onCallPhone && (
            <Button
              asChild
              variant="outline"
              className="w-full max-lg:h-11"
            >
              <a href={telHref(coverage.onCallPhone)}>
                <Phone className="size-4 shrink-0" aria-hidden />
                {t("muniCallOnCall", { phone: coverage.onCallPhone })}
              </a>
            </Button>
          )}
        </div>
      )}

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <ContactRow icon={MapPin}>{coverage.city}</ContactRow>
        {/* When the number above is answered. It comes before the email and
            the website, which are for daytime, because it is what says
            whether the call being made now will be picked up. The hours name
            themselves ("Pon-pet 8.00-12.00"), so their label is spoken and
            not drawn. The number to dial outside them is a button above, not
            a row here: the card states each number once. */}
        {coverage.hours && (
          <ContactRow icon={Clock} label={messages.muniHours} labelHidden>
            {coverage.hours}
          </ContactRow>
        )}
        {/* The visible label is the address, so the accessible name puts the
            channel in front of it (WCAG 2.5.3). The two calls above need no
            such prefix: muniCall and muniCallOnCall already begin with the
            act, so their visible text is the announcement.

            title carries the value a mouse cannot otherwise read: both rows
            truncate, and a long address that ends in an ellipsis is left
            only in the accessible name. Same treatment as the register
            card's rows, which truncate for the same reason. */}
        {coverage.email && (
          <ContactRow icon={Mail}>
            <a
              href={mailtoHref(coverage.email)}
              data-contact="email"
              aria-label={contactName(messages.contactEmail, coverage.email)}
              title={coverage.email}
              className="block truncate underline-offset-4 hover:text-foreground hover:underline"
            >
              {coverage.email}
            </a>
          </ContactRow>
        )}
        {coverage.website && (
          // The only contact here that leaves the site. target="_blank" says
          // so to nobody, so the name says it and the mark says it to
          // everyone else: this card is read standing over a found animal,
          // on a phone, where a title is a hover that never happens.
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
              title={websiteHost(coverage.website)}
              className="flex items-center gap-1 underline-offset-4 hover:text-foreground"
            >
              <span className="truncate hover:underline">
                {websiteHost(coverage.website)}
              </span>
              <ExternalLink className="size-3 shrink-0" aria-hidden data-external />
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
            {/* The card's second outbound link, and the citation rather than
                a contact, so it says so the footer's way: a spoken sentence
                after the label, with no mark drawn into a line of small
                print. */}
            <span className="sr-only"> {messages.newWindow}</span>
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
