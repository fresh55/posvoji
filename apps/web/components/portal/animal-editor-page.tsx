"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Search,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AnimalForm,
  buildPatch,
  draftFrom,
  type Draft,
} from "@/components/portal/animal-form";
import {
  portalMetaLine,
  portalPublicPath,
} from "@/components/portal/animal-meta";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Glyph } from "@/components/portal/glyph";
import { PortalNotice } from "@/components/portal/notice";
import { OverrideMark } from "@/components/portal/override-mark";
import {
  SEARCHABLE_FIELDS,
  SEARCHABLE_LABELS,
  isPortalField,
  portalSpeciesIcon,
} from "@/components/portal/portal-fields";
import { usePortal } from "@/components/portal/portal-provider";
import { fill, portalText } from "@/components/portal/portal-text";
import { StatusBlock } from "@/components/portal/status-block";
import { IDLE, type PortalSaveState } from "@/hooks/portal-list";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { PORTAL_PATH } from "@/hooks/use-portal-session";
import { Button } from "@/components/ui/button";
import { thumbnailUrl } from "@/lib/animal-images";
import type {
  PortalAnimal,
  PortalAnimalPatch,
  PortalField,
} from "@/lib/portal-api";

/**
 * One animal, edited on a page of its own.
 *
 * The address is /portal/zival?zavetisce=<slug>&id=<id>, with an optional
 * &polje=<field> the card's "manjka za iskalnik" line uses to send the
 * shelter straight to a row. The site is a static export, so the animal
 * cannot be a path segment: the page is prerendered once and reads its
 * subject off the query on the client.
 */
export function AnimalEditorPage() {
  const params = useSearchParams();
  const router = useRouter();
  const {
    session,
    reloadSession,
    shelters,
    active,
    activeShelter,
    setActive,
    animals,
    animalState,
    reloadAnimals,
    saveStates,
    save,
    publicName,
  } = usePortal();

  const slug = params.get("zavetisce");
  const animalId = params.get("id");
  const requested = params.get("polje");
  const polje = isPortalField(requested) ? requested : null;

  // A slug the account has no access to is not a shelter this page can show,
  // whatever the address says.
  const known = shelters.some((shelter) => shelter.slug === slug);

  // The URL decides which shelter the whole portal is looking at, so a reload
  // under the second shelter lands on the right list and Back leaves it there.
  useEffect(() => {
    if (slug && known && slug !== active) setActive(slug);
  }, [active, known, setActive, slug]);

  const showing = known && slug === active;
  const animal = showing
    ? (animals.find((candidate) => candidate.id === animalId) ?? null)
    : null;

  const backToList = (
    <Button asChild variant="outline" size="sm">
      <Link href={PORTAL_PATH}>{portalText.backToList}</Link>
    </Button>
  );

  if (session.status === "loading" || session.status === "anonymous") {
    return (
      <>
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {session.status === "anonymous"
            ? portalText.redirecting
            : portalText.loading}
        </p>
      </>
    );
  }

  if (session.status === "error") {
    return (
      <>
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
        <PortalNotice
          icon={TriangleAlert}
          title={portalText.sessionErrorTitle}
          action={
            <Button variant="outline" size="sm" onClick={reloadSession}>
              {portalText.retry}
            </Button>
          }
        >
          {session.offline
            ? portalText.networkError
            : portalText.sessionErrorLead}
        </PortalNotice>
      </>
    );
  }

  // A shelter the account does not have is answered at once: nothing is
  // loading that could turn it into an animal.
  if (!slug || !animalId || !known) {
    return (
      <>
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
        <PortalNotice
          icon={SearchX}
          title={portalText.editorNotFoundTitle}
          action={backToList}
        >
          {portalText.editorNotFoundLead}
        </PortalNotice>
      </>
    );
  }

  if (showing && animalState.status === "error") {
    return (
      <>
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
        <PortalNotice
          icon={TriangleAlert}
          title={portalText.listErrorTitle}
          action={
            <Button variant="outline" size="sm" onClick={reloadAnimals}>
              {portalText.retry}
            </Button>
          }
        >
          {animalState.message}
        </PortalNotice>
      </>
    );
  }

  // An id with no animal is only a wrong id once the list it would be in has
  // arrived. Until then the page is still loading, not empty.
  if (!showing || animalState.status !== "ready") {
    return (
      <>
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {portalText.loading}
        </p>
      </>
    );
  }

  if (!animal || !activeShelter) {
    return (
      <>
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
        <PortalNotice
          icon={SearchX}
          title={portalText.editorNotFoundTitle}
          action={backToList}
        >
          {portalText.editorNotFoundLead}
        </PortalNotice>
      </>
    );
  }

  return (
    <AnimalEditor
      // A different animal is a different form with a different draft, so it
      // is a different component instance and not this one re-used.
      key={animal.id}
      animal={animal}
      shelterName={activeShelter.name}
      publicHref={portalPublicPath(animal, activeShelter, publicName(animal))}
      renamed={publicName(animal) !== animal.name}
      saveState={saveStates[animal.id] ?? IDLE}
      onSave={(patch) => save(animal.id, patch)}
      field={polje}
      onDone={() => router.push(PORTAL_PATH)}
    />
  );
}

/** The five filters an adopter narrows the grid by, ticked off as the shelter
 *  answers them. Read off the saved animal, so it says what the public site
 *  knows rather than what is typed but not sent. */
function SearchableChecklist({ animal }: { animal: PortalAnimal }) {
  const answered = SEARCHABLE_FIELDS.filter(
    (field) => animal[field.key] !== null,
  ).length;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {portalText.sectionSearchable}
      </p>
      <ul className="space-y-1">
        {SEARCHABLE_FIELDS.map((field) => {
          const done = animal[field.key] !== null;
          return (
            <li key={field.key} className="flex items-center gap-1.5 text-xs">
              {done ? (
                <Check
                  className="size-3.5 shrink-0 text-[var(--filter-accent-foreground)]"
                  strokeWidth={2.4}
                  aria-hidden
                />
              ) : (
                <Search
                  className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
              <span className={done ? "text-muted-foreground" : "font-medium"}>
                {SEARCHABLE_LABELS[field.key]}
              </span>
            </li>
          );
        })}
      </ul>
      {/* Which of the two sentences is true right now, rather than a legend
          for the icons above. */}
      <p className="text-2xs leading-relaxed text-muted-foreground">
        {answered === SEARCHABLE_FIELDS.length
          ? portalText.searchableDone
          : portalText.searchableLead}
      </p>
    </div>
  );
}

function AnimalEditor({
  animal,
  shelterName,
  publicHref,
  renamed,
  saveState,
  onSave,
  field,
  onDone,
}: {
  animal: PortalAnimal;
  shelterName: string;
  publicHref: string;
  /** The public page is still filed under the name the list loaded with. */
  renamed: boolean;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
  field: PortalField | null;
  onDone: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const now = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(animal));
  const [ageError, setAgeError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // A save that failed on the card keeps its message until the next attempt,
  // which is what the card needs: the shelter has to be able to look away and
  // still find out that the tap did not take. Arriving on this page is not
  // that attempt, so the failure the page opens on is remembered here and
  // stays out of the form. Every later save produces a new state object, so
  // identity is enough to tell the two apart.
  const [openedOn] = useState<PortalSaveState | null>(
    saveState.status === "error" ? saveState : null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // The confirm is opened in code, from Prekliči or the breadcrumb, so it
  // puts the focus back itself.
  const confirmFocus = useReturnFocus();

  const uid = useId();
  const errorId = `${uid}-error`;
  const ageErrorId = `${uid}-age-error`;

  // Coming in at a named row: the shelter tapped the card's "manjka" line, so
  // that row has to be what the page shows first, not the top of a form they
  // then have to read through. One frame after the mount, which is where the
  // page has finished laying out.
  useEffect(() => {
    if (!field) return;
    const frame = requestAnimationFrame(() => {
      const row = formRef.current?.querySelector<HTMLElement>(
        `[data-field="${field}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      row
        .querySelector<HTMLElement>(
          "[data-field-control] input, [data-field-control] textarea, [data-field-control] button",
        )
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [field]);

  const saving = saveState.status === "saving";
  // The same patch the submit will send: what the form would change, and
  // which age box, if either, holds something that is not a count.
  const { patch, ageError: badAgeBox } = buildPatch(draft, animal);
  const dirty = Object.keys(patch).length > 0;
  // An unusable age produces no patch, but it is still work the shelter typed
  // and the page must not throw it away silently.
  const unsaved = dirty || badAgeBox !== null;
  const name = animal.name ?? portalText.unnamed;
  const overrideCount = Object.keys(animal.overrides).length;
  const speciesIcon = portalSpeciesIcon(animal.species);
  // The age has its own message, beside the boxes it is about. What is left
  // for the foot of the form is the save that did not go through, and only
  // once it is this page's own doing.
  const errorText =
    saveState.status === "error" && saveState !== openedOn
      ? saveState.message
      : null;

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /**
   * The age's own setter. Typing in either box retires its error; nothing
   * else in the form can, or picking a size would clear a message about a
   * number the shelter has not corrected.
   */
  function setAge(key: "ageYears" | "ageMonths", value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setAgeError(false);
  }

  function revertAge() {
    setDraft((current) => ({ ...current, ageYears: "", ageMonths: "" }));
    setAgeError(false);
  }

  /**
   * Whether saving would give this field back to the crawler.
   *
   * Read off the patch rather than off the control, because "empty" is not
   * the only way to ask for it: an emptied box, a cleared choice row, two
   * empty age boxes and "Ni znano" on Posebne potrebe all reach the wire as
   * the same explicit null. buildPatch is what decides that, and it only
   * writes a null for a field the shelter has actually overridden, so this is
   * also where the "you changed this" mark turns into "this is going back".
   */
  function reverting(target: PortalField): boolean {
    return patch[target] === null;
  }

  /** Every way back to the list but a finished save: Prekliči and the
   *  breadcrumb. Typed work is confirmed away, never dropped. */
  function requestLeave() {
    if (unsaved) {
      setConfirming(true);
      return;
    }
    onDone();
  }

  function discard() {
    // The control the focus would go back to is about to leave with the page.
    confirmFocus.release();
    setConfirming(false);
    onDone();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (badAgeBox) {
      setAgeError(true);
      // A submit from the bar at the foot of the page leaves the reason off
      // screen, so the box that cannot be read takes the focus with it.
      const box = formRef.current?.querySelector<HTMLElement>(
        badAgeBox === "years" ? "#portal-age-years" : "#portal-age-months",
      );
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
      return;
    }
    if (await onSave(patch)) onDone();
  }

  return (
    <>
      <nav
        aria-label={portalText.breadcrumbLabel}
        className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link
          href={PORTAL_PATH}
          onClick={(event) => {
            // The link is a real one, so Back, a middle click and a long
            // press all behave. It is only held back when there is typed
            // work the shelter has not been asked about yet.
            if (unsaved) {
              event.preventDefault();
              setConfirming(true);
            }
          }}
          className="rounded-ui underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring"
        >
          {portalText.animalsTitle}
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <span aria-current="page" className="min-w-0 truncate text-foreground">
          {name}
        </span>
      </nav>

      {/* One form over both columns, so the bar in the summary submits the
          rows beside it without a form attribute to tie them together. */}
      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="flex items-start gap-3">
              {animal.thumbnailUrl ? (
                // Same reasoning as the card: a cache-permitted photo can
                // still fall back to the shelter's own host, which next/image
                // would need a build-time allowlist for.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl(animal.thumbnailUrl)}
                  alt=""
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
                  <h1 className="min-w-0 truncate text-xl font-medium tracking-tight">
                    {name}
                  </h1>
                  {overrideCount > 0 && (
                    <OverrideMark
                      className="shrink-0"
                      aria-label={fill(portalText.editedCount, {
                        count: overrideCount,
                      })}
                    />
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {portalMetaLine(animal, now)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {shelterName}
                </p>
              </div>

              {/* The same quiet place the card keeps for the outcome of a
                  save, so a status tap reports itself the same way here. */}
              <div aria-live="polite" className="min-h-6 shrink-0">
                {saving && (
                  <m.span
                    key="saving"
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <LoaderCircle
                      className="size-3.5 animate-spin"
                      aria-hidden
                    />
                    {portalText.saving}
                  </m.span>
                )}
                {saveState.status === "saved" && (
                  <m.span
                    key="saved"
                    initial={
                      shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }
                    }
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

            <div className="space-y-1">
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                {/* A new tab, so the form the shelter is filling in stays
                    where it is. */}
                <a href={publicHref} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  {portalText.publicListing}
                </a>
              </Button>
              {renamed && (
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  {portalText.publicRenamed}
                </p>
              )}
            </div>

            <SearchableChecklist animal={animal} />

            {/* One bar, in two places. Beside the form on a wide screen,
                where the summary is sticky and it rides along; pinned to the
                bottom of the window below that, where the summary is at the
                top of a page the shelter has scrolled away from.
                pb-safe and the page's own max-lg:pb-28 keep it clear of the
                last row's tap-target overlay. */}
            <div className="flex gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:bg-background max-lg:px-gutter max-lg:py-3 lg:pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={requestLeave}
              >
                {portalText.cancel}
              </Button>
              <Button
                type="submit"
                disabled={saving || !unsaved}
                className="flex-1"
              >
                {saving && (
                  <LoaderCircle className="animate-spin" aria-hidden />
                )}
                {saving ? portalText.saving : portalText.save}
              </Button>
            </div>
          </aside>

          <div className="space-y-6 max-lg:pb-28">
            <AnimalForm
              uid={uid}
              animal={animal}
              draft={draft}
              set={set}
              setAge={setAge}
              revertAge={revertAge}
              reverting={reverting}
              saving={saving}
              ageError={ageError}
              ageErrorId={ageErrorId}
            />

            {errorText && (
              <p
                id={errorId}
                role="alert"
                className="flex items-start gap-1.5 text-sm text-destructive"
              >
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden
                />
                {errorText}
              </p>
            )}
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={portalText.leaveTitle}
        lead={portalText.leaveLead}
        keepLabel={portalText.keepEditing}
        confirmLabel={portalText.discardChanges}
        onConfirm={discard}
        {...confirmFocus.props}
      />
    </>
  );
}
