"use client";

import { useMemo } from "react";
import {
  Check,
  Ellipsis,
  ExternalLink,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  missingCountLabel,
  missingSearchableFields,
  portalMetaLine,
  portalPublicPath,
} from "@/components/portal/animal-meta";
import { Glyph } from "@/components/portal/glyph";
import { DraftMark, OverrideMark } from "@/components/portal/override-mark";
import { portalSpeciesIcon } from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { StatusMenu } from "@/components/portal/status-menu";
import type { PortalSaveState } from "@/hooks/portal-list";
import { portalAnimalPath } from "@/hooks/use-portal-session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { thumbnailUrl } from "@/lib/animal-images";
import type {
  PortalAnimal,
  PortalAnimalPatch,
  PortalShelter,
} from "@/lib/portal-api";

/**
 * One animal as a row of the list. A shelter with 150 animals scrolls this
 * 150 times, so everything that reads the same on every animal is said once
 * above the list, and what is left here is the animal: its name, its line of
 * facts, its status, and what it is still missing.
 *
 * The row draws no border of its own. The list stacks the rows in one divided
 * container, so a border here would double every line between two animals.
 */
export function PortalAnimalRow({
  animal,
  shelter,
  publicName = animal.name,
  hasDraft = false,
  saveState,
  onSave,
}: {
  animal: PortalAnimal;
  /** The shelter this row is listed under, for the public link's address. */
  shelter: PortalShelter;
  /**
   * The name the public site can already have a page for, which is the one
   * the list loaded with. Defaults to the animal's own name, which is what an
   * animal nobody has renamed in this session reads as.
   */
  publicName?: string | null;
  /** This tab is holding typed work for this animal that was never saved. */
  hasDraft?: boolean;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const now = useMemo(() => new Date(), []);

  const name = animal.name ?? portalText.unnamed;
  const overrideCount = Object.keys(animal.overrides).length;
  const saving = saveState.status === "saving";
  const failed = saveState.status === "error";
  const missing = missingSearchableFields(animal);
  const editPath = portalAnimalPath(shelter.slug, animal.id);
  // The public page is still filed under the older name, so the link in the
  // menu does not match the name in the row and the menu has to say why.
  const renamed = publicName !== animal.name;

  return (
    <article className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto_2rem] sm:px-4">
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
          className="size-10 rounded-ui border bg-muted/40 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-ui border bg-muted/40 text-muted-foreground"
        >
          <Glyph icon={portalSpeciesIcon(animal.species)} className="size-4" />
        </span>
      )}

      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="min-w-0 truncate text-sm font-medium">
            {/* next/link, not an anchor: the editor is a page of the portal
                and the point of going there without a document load is that
                the session and this list stay in memory behind it. */}
            <Link
              href={editPath}
              className="rounded-ui underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
            >
              {name}
            </Link>
          </h3>
          {overrideCount > 0 && (
            <OverrideMark
              className="shrink-0"
              aria-label={fill(portalText.editedCount, {
                count: overrideCount,
              })}
            />
          )}
          {hasDraft && <DraftMark className="shrink-0" />}
        </div>
        {/* No species icon beside it. The square to the left is already that
            icon, and at 40px a second copy says nothing the first has not. */}
        <p className="truncate text-xs text-muted-foreground">
          {portalMetaLine(animal, now)}
        </p>
      </div>

      {/* One line on a phone, three cells of the row on a wider screen. From
          sm the wrapper is display: contents, so the pill, the missing cell
          and the menu become grid items of the article itself and fall into
          its last three columns. */}
      <div className="col-span-2 col-start-2 flex items-center justify-end gap-2 sm:contents">
        <div className="flex items-center gap-2">
          <StatusMenu
            animal={animal}
            busy={saving}
            onSave={(patch) => void onSave(patch)}
          />
          {/* One quiet place for the outcome of a save. Nothing is said while
              it runs, because the pill itself is spinning. Nothing animates on
              the way out either, so a stalled exit cannot leave a stale label
              behind. */}
          <div aria-live="polite">
            {saveState.status === "saved" && (
              <m.span
                key="saved"
                initial={
                  shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }
                }
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-flex items-center gap-1 rounded-4xl border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap text-[var(--filter-accent-foreground)]"
              >
                <Check className="size-3" strokeWidth={2.6} aria-hidden />
                {portalText.saved}
              </m.span>
            )}
          </div>
        </div>

        {/* A width of its own from sm up, so the counts of a whole list of
            rows start at the same place instead of stepping with the length
            of the pill beside them. */}
        <div className="flex items-center justify-end sm:min-w-[4.5rem]">
          {missing.length > 0 ? (
            // The shortest way in: it opens the editor at the first field it
            // counts, instead of leaving the shelter to find that field in the
            // form. What it does goes in the title, not in an aria-label: the
            // visible text has to stay the accessible name, or voice control
            // has no way to say this link (WCAG 2.5.3).
            <Link
              href={portalAnimalPath(shelter.slug, animal.id, missing[0].key)}
              title={fill(portalText.missingOpen, { name })}
              className="rounded-ui text-xs whitespace-nowrap text-muted-foreground underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              {missingCountLabel(missing.length)}
            </Link>
          ) : (
            <>
              <Check
                className="size-3.5 text-[var(--filter-accent-foreground)]"
                aria-hidden
              />
              <span className="sr-only">{portalText.missingNone}</span>
            </>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm">
              <Ellipsis aria-hidden />
              <span className="sr-only">
                {fill(portalText.rowMenu, { name })}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={editPath}>
                <Pencil aria-hidden />
                {portalText.edit}
              </Link>
            </DropdownMenuItem>
            {/* The listing as an adopter reads it. A new tab, because the
                shelter is working through a list and must not lose its
                place. */}
            <DropdownMenuItem asChild className="items-start">
              <a
                href={portalPublicPath(animal, shelter, publicName)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mt-0.5" aria-hidden />
                <span className="min-w-0">
                  {portalText.publicListing}
                  {/* Inside the menu rather than as a hover title on the
                      link: a touch user never opens one, and this is the only
                      place that says why the link carries the old name. */}
                  {renamed && (
                    <span className="block text-2xs leading-relaxed text-muted-foreground">
                      {portalText.publicRenamed}
                    </span>
                  )}
                </span>
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {failed && (
        <p
          role="alert"
          className="col-span-full flex items-start gap-1.5 text-xs text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {saveState.message}
        </p>
      )}
    </article>
  );
}
