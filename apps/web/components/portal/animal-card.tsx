"use client";

import { useMemo } from "react";
import {
  Check,
  ExternalLink,
  LoaderCircle,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  missingSearchableFields,
  portalMetaLine,
  portalPublicPath,
} from "@/components/portal/animal-meta";
import { Glyph } from "@/components/portal/glyph";
import { OverrideMark } from "@/components/portal/override-mark";
import { portalSpeciesIcon } from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { StatusBlock } from "@/components/portal/status-block";
import type { PortalSaveState } from "@/hooks/portal-list";
import { portalAnimalPath } from "@/hooks/use-portal-session";
import { Button } from "@/components/ui/button";
import { thumbnailUrl } from "@/lib/animal-images";
import type {
  PortalAnimal,
  PortalAnimalPatch,
  PortalShelter,
} from "@/lib/portal-api";

export function PortalAnimalCard({
  animal,
  shelter,
  publicName = animal.name,
  saveState,
  onSave,
}: {
  animal: PortalAnimal;
  /** The shelter this card is listed under, for the public link's address. */
  shelter: PortalShelter;
  /**
   * The name the public site can already have a page for, which is the one
   * the list loaded with. Defaults to the animal's own name, which is what an
   * animal nobody has renamed in this session reads as.
   */
  publicName?: string | null;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const now = useMemo(() => new Date(), []);

  const speciesIcon = portalSpeciesIcon(animal.species);
  const name = animal.name ?? portalText.unnamed;
  const overrideCount = Object.keys(animal.overrides).length;
  const saving = saveState.status === "saving";
  const failed = saveState.status === "error";
  const missing = missingSearchableFields(animal);
  // The public page is still filed under the older name, so the link below
  // does not match the name above it and the card has to say why.
  const renamed = publicName !== animal.name;

  return (
    <article className="space-y-3 rounded-ui border p-3 transition-colors hover:border-foreground/25 focus-within:border-foreground/25 sm:p-4">
      <div className="flex items-start gap-3">
        {animal.thumbnailUrl ? (
          // next/image would need a build-time allowlist of every shelter
          // domain, since a cache-permitted photo can still fall back to the
          // shelter's own host. thumbnailUrl() rewrites our own cached copies
          // to the 112px derivative; anything else passes through unchanged.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl(animal.thumbnailUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-16 shrink-0 rounded-ui border bg-muted/40 object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-16 shrink-0 place-items-center rounded-ui border bg-muted/40 text-muted-foreground"
          >
            <Glyph icon={speciesIcon} className="size-6" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate font-medium">{name}</h3>
            {overrideCount > 0 && (
              <OverrideMark
                className="shrink-0"
                aria-label={fill(portalText.editedCount, {
                  count: overrideCount,
                })}
              />
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {/* Only next to a photo. Without one the square to the left is
                already this same icon, and drawing it twice on one row says
                nothing the placeholder has not said. */}
            {animal.thumbnailUrl && (
              <Glyph icon={speciesIcon} className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{portalMetaLine(animal, now)}</span>
          </p>
        </div>

        {/* One quiet place for the outcome of a save, so a status tap and a
            save made on the editor page report themselves the same way. Each
            state mounts and fades in on its own; nothing animates on the way
            out, so a stalled exit can never leave a stale label behind. */}
        <div aria-live="polite" className="min-h-6 shrink-0">
          {saving && (
            <m.span
              key="saving"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              {portalText.saving}
            </m.span>
          )}
          {saveState.status === "saved" && (
            <m.span
              key="saved"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="inline-flex items-center gap-1 rounded-4xl border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-1.5 py-0.5 text-2xs font-medium text-[var(--filter-accent-foreground)]"
            >
              <Check className="size-3" strokeWidth={2.6} aria-hidden />
              {portalText.saved}
            </m.span>
          )}
        </div>
      </div>

      <StatusBlock
        animal={animal}
        busy={saving}
        onSave={(patch) => void onSave(patch)}
      />

      {missing.length > 0 && (
        // Sits directly above the link that opens the editor, so the list and
        // the way to answer it read as one thing. The line is also the
        // shortest way in: it opens the editor at the first field it names,
        // instead of leaving the shelter to find that field in the form.
        //
        // What it does goes in the title, not in an aria-label: the visible
        // text has to stay the accessible name, or voice control has no way
        // to say this link's name (WCAG 2.5.3).
        <Link
          href={portalAnimalPath(shelter.slug, animal.id, missing[0].key)}
          title={fill(portalText.missingOpen, { name })}
          className="block w-full rounded-ui text-left text-2xs leading-relaxed text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="font-medium">{portalText.missingTitle}</span>{" "}
          <span className="underline decoration-dotted underline-offset-2">
            {missing.map((field) => field.label).join(", ")}
          </span>
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* next/link, not an anchor: the editor is a page of the portal and
              the whole point of going there without a document load is that
              the session and this list stay in memory behind it. */}
          <Button asChild variant="outline" size="sm">
            <Link href={portalAnimalPath(shelter.slug, animal.id)}>
              <Pencil aria-hidden />
              {portalText.edit}
            </Link>
          </Button>

          {/* The listing as an adopter reads it. A new tab, because the
              shelter is working through a list and must not lose its place. */}
          <Button asChild variant="ghost" size="sm">
            <a
              href={portalPublicPath(animal, shelter, publicName)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden />
              {portalText.publicListing}
            </a>
          </Button>
        </div>

        {failed && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-xs text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {saveState.message}
          </p>
        )}
      </div>

      {/* Directly under the link it is about, and only once the name here and
          the name on the public page have parted: a shelter that has renamed
          nothing never reads a word about publication schedules. */}
      {renamed && (
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {portalText.publicRenamed}
        </p>
      )}
    </article>
  );
}
