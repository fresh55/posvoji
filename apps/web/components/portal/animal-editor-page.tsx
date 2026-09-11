"use client";

import {
  buildPatch,
  draftFrom,
  sanitizeDraft,
  type Draft,
} from "@/components/portal/animal-draft";
import { AnimalForm } from "@/components/portal/animal-form";
import {
  portalMetaLine,
  portalPublicPath,
} from "@/components/portal/animal-meta";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import {
  DraftResumedLine,
  EditorBreadcrumb,
  EditorSaveBar,
} from "@/components/portal/editor-chrome";
import { Glyph } from "@/components/portal/glyph";
import { ListingEditorPage } from "@/components/portal/listing-editor-page";
import {
  EditorListError,
  EditorNotFound,
  FieldError,
  PortalNotice,
  PortalPageHeading,
  PortalPending,
} from "@/components/portal/notice";
import { OverrideMark } from "@/components/portal/override-mark";
import {
  READ_BOXES,
  isPortalField,
  portalSpeciesIcon,
  readBoxControl,
  type ReadBox,
} from "@/components/portal/portal-fields";
import { usePortal } from "@/components/portal/portal-provider";
import { fill, portalText } from "@/components/portal/portal-text";
import { SaveStatusPip } from "@/components/portal/save-status";
import { SearchableChecklist } from "@/components/portal/searchable-checklist";
import { StatusBlock } from "@/components/portal/status-block";
import { Button } from "@/components/ui/button";
import { IDLE, type PortalSaveState } from "@/hooks/portal-list";
import {
  firstDateFault,
  usePortalDateInputs,
  usePortalFieldFocus,
} from "@/hooks/use-portal-date-inputs";
import { usePortalDraft, usePortalDraftMirror } from "@/hooks/use-portal-draft";
import { PORTAL_PATH } from "@/hooks/use-portal-session";
import { useReadBoxes } from "@/hooks/use-read-boxes";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { useSaveSlot } from "@/hooks/use-save-slot";
import { thumbnailUrl } from "@/lib/animal-images";
import type {
  PortalAnimal,
  PortalAnimalPatch,
  PortalField,
} from "@/lib/portal-api";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
    account,
    shelters,
    active,
    activeShelter,
    setActive,
    manual,
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

  // A shelter with no catalogue of its own has no crawled animal to edit: the
  // same address opens one of its listings, on the same frame. Which of the
  // two this is follows the active shelter, which the effect above has just
  // taken from the address.
  if (manual) return <ListingEditorPage />;

  const showing = known && slug === active;
  const animal = showing
    ? (animals.find((candidate) => candidate.id === animalId) ?? null)
    : null;

  const notFound = <EditorNotFound />;

  if (session.status === "loading" || session.status === "anonymous") {
    return (
      <>
        <PortalPageHeading />
        <PortalPending
          label={
            session.status === "anonymous"
              ? portalText.redirecting
              : portalText.loading
          }
        />
      </>
    );
  }

  if (session.status === "error") {
    return (
      <>
        <PortalPageHeading />
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
  if (!slug || !animalId || !known) return notFound;

  if (showing && animalState.status === "error") {
    return (
      <EditorListError message={animalState.message} onReload={reloadAnimals} />
    );
  }

  // An id with no animal is only a wrong id once the list it would be in has
  // arrived. Until then the page is still loading, not empty.
  if (!showing || animalState.status !== "ready") {
    return (
      <>
        <PortalPageHeading />
        <PortalPending label={portalText.loading} />
      </>
    );
  }

  if (!animal || !activeShelter || !account) return notFound;

  return (
    <AnimalEditor
      // A different animal is a different form with a different draft, so it
      // is a different component instance and not this one re-used.
      key={animal.id}
      animal={animal}
      account={account}
      shelter={activeShelter.slug}
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

function AnimalEditor({
  animal,
  account,
  shelter,
  shelterName,
  publicHref,
  renamed,
  saveState,
  onSave,
  field,
  onDone,
}: {
  animal: PortalAnimal;
  /** Both halves of where this animal's draft is filed, with its id. */
  account: string;
  shelter: string;
  shelterName: string;
  publicHref: string;
  /** The public page is still filed under the name the list loaded with. */
  renamed: boolean;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
  field: PortalField | null;
  onDone: () => void;
}) {
  const now = useMemo(() => new Date(), []);
  // The typed half, and whatever this tab still holds of an earlier visit to
  // this animal. See the hook for what is kept and when it is dropped, and
  // sanitizeDraft for what of the stored half this form takes back.
  const {
    draft,
    setDraft,
    resumed,
    reset: resetDraft,
    clear: clearOwnDraft,
  } = usePortalDraft(
    account,
    shelter,
    animal.id,
    () => draftFrom(animal),
    sanitizeDraft,
  );
  /** The box the last submit refused. One at a time, so one message. */
  const [refused, setRefused] = useState<ReadBox | null>(null);
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // The boxes the browser could not read a value out of, and what the page
  // may do with them.
  const boxes = useReadBoxes(formRef);
  // The save slot this animal shares with its row on the list.
  const slot = useSaveSlot<"status">(saveState, errorRef);
  // The confirm is opened in code, from Prekliči or the breadcrumb, so it
  // puts the focus back itself.
  const confirmFocus = useReturnFocus();

  const uid = useId();
  const errorId = `${uid}-error`;
  const statusErrorId = `${uid}-status-error`;
  /** One refusal at a time, so the refused rows share the one message id. */
  const refusedErrorId = `${uid}-refused-error`;

  // Coming in at a named row: the shelter tapped the card's "manjka" line, so
  // that row has to be what the page shows first, not the top of a form they
  // then have to read through. One frame after the mount, which is where the
  // page has finished laying out.
  usePortalFieldFocus(formRef, field);

  const saving = saveState.status === "saving";
  // The draft as far as it can be read. A box the browser could not read
  // holds "" in the draft, which buildPatch would take for an emptied box
  // and turn into a revert of the shelter's own value, and the mirror would
  // then store that revert for the next visit to send.
  const readable = boxes.readable(draft, draftFrom(animal));
  // The same patch the submit will send: what the form would change, and
  // which box, if any, holds something that is not a value.
  const {
    patch,
    ageError: badAgeBox,
    dateError: badDate,
  } = buildPatch(readable, animal, now);
  const dirty = Object.keys(patch).length > 0;
  // An unusable age or date produces no patch, but it is still work the
  // shelter typed and the page must not throw it away silently.
  const typedWork = dirty || badAgeBox !== null || badDate;
  // Plus the boxes the browser could not read. Their text is not in the
  // draft, so it is not mirrored, but it is the shelter's work all the same:
  // leaving asks, and Shrani stays enabled so the submit can point at the box.
  const unsaved = typedWork || boxes.unreadable.size > 0;
  // Mirrored on every change, so a Back, a Forward and a reload all come back
  // to the same typed work. Only while there is work: a form nobody has
  // touched must not leave a key behind, or the list would mark every animal
  // that was ever opened.
  usePortalDraftMirror(account, shelter, animal.id, readable, typedWork, () =>
    draftFrom(animal),
  );

  const name = animal.name ?? portalText.unnamed;
  const overrideCount = Object.keys(animal.overrides).length;
  const speciesIcon = portalSpeciesIcon(animal.species);
  // The age and the date have their own messages, beside the boxes they are
  // about. What is left is the save that did not go through, said in the bar
  // or under the status buttons, whichever started it.
  const statusFailure = slot.failureFrom("status");

  /** The message on a refused box comes down when that box is answered. */
  function answered(box: ReadBox) {
    setRefused((current) => (current === box ? null : current));
  }

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    slot.touched();
  }

  /**
   * The age's own setter. Typing in either box retires the age's error;
   * nothing else in the form can, or picking a size would clear a message
   * about a number the shelter has not corrected.
   */
  const { setAge, setBirthDate } = usePortalDateInputs(
    setDraft,
    boxes,
    answered,
    slot.touched,
  );

  function revertAge() {
    setDraft((current) => ({ ...current, ageYears: "", ageMonths: "" }));
    boxes.empty(["ageYears", "ageMonths"]);
    answered("ageYears");
    answered("ageMonths");
    slot.touched();
  }

  function revertBirthDate() {
    setDraft((current) => ({ ...current, birthDate: "" }));
    boxes.empty(["birthDate"]);
    answered("birthDate");
    slot.touched();
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
    clearOwnDraft();
    onDone();
  }

  /** The line's own button: keep the animal, drop what was typed before. */
  function discardStored() {
    resetDraft();
    boxes.empty(READ_BOXES);
    setRefused(null);
  }

  /** The box the submit has to refuse, in the order the form reads them. */
  function firstFault(): ReadBox | null {
    return firstDateFault(boxes.unreadable, badDate, badAgeBox);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The bar is disabled while a save is on its way, so a tap cannot reach
    // here twice. A submit fired in code can, and the patch still goes once:
    // save() drops a second PUT for an animal it already has one out for.
    if (saving) return;

    const fault = firstFault();
    if (fault) {
      setRefused(fault);
      // A submit from the bar at the foot of the page leaves the reason off
      // screen, so the box that cannot be read takes the focus with it.
      const box = readBoxControl(formRef.current, fault);
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
      return;
    }

    slot.startSave("form");
    if (await onSave(patch)) {
      clearOwnDraft();
      onDone();
    }
  }

  return (
    <>
      <EditorBreadcrumb
        name={name}
        blocked={unsaved}
        saving={saving}
        onBlocked={() => setConfirming(true)}
      />

      {/* One form over both columns, so the bar in the summary submits the
          rows beside it without a form attribute to tie them together. */}
      <form ref={formRef} onSubmit={submit} noValidate>
        {/* min-w-0 on both grid items. Below lg the column is auto-sized and
            a grid item's minimum is its content's, so a long name with no
            space in it (the h1 truncates, which is nowrap) would widen the
            column past the viewport and the page would scroll sideways. With
            the minimum at zero the column stays the viewport's width and the
            truncate on the h1 and the two lines under it can do its job. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
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
                  <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
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
              <SaveStatusPip state={saveState} />
            </div>

            <StatusBlock
              animal={animal}
              busy={saving}
              error={
                statusFailure && (
                  <FieldError id={statusErrorId}>
                    {statusFailure.message}
                  </FieldError>
                )
              }
              onSave={(patch) => {
                slot.startSave("status");
                void onSave(patch);
              }}
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

            {/* Beside the form, never above it. On a phone the summary sits
                on top of the section this repeats, and every row in that
                section already carries the same mark. */}
            <div className="max-lg:hidden">
              <SearchableChecklist animal={animal} />
            </div>

            {/* One bar, in two places. Beside the form on a wide screen,
                where the summary is sticky and it rides along; pinned to the
                bottom of the window below that, where the summary is at the
                top of a page the shelter has scrolled away from.
                The bottom padding carries the phone's home indicator, and the
                page's own max-lg:pb-28 keeps the last row's tap-target
                overlay clear of the bar. */}
            <EditorSaveBar
              saving={saving}
              cancelDisabled={saving}
              saveDisabled={saving || !unsaved}
              error={
                slot.formFailure && (
                  <FieldError ref={errorRef} id={errorId} focusable>
                    {slot.formFailure.message}
                  </FieldError>
                )
              }
              onCancel={requestLeave}
            />
          </aside>

          <div className="min-w-0 space-y-6 max-lg:pb-28">
            {/* Above the rows it is about, and quiet: the shelter came back
                to a form that is not the animal's saved state, and nothing
                else on the page would say why. */}
            {resumed && (
              <DraftResumedLine disabled={saving} onDiscard={discardStored} />
            )}

            <AnimalForm
              uid={uid}
              animal={animal}
              draft={draft}
              set={set}
              setAge={setAge}
              revertAge={revertAge}
              setBirthDate={setBirthDate}
              revertBirthDate={revertBirthDate}
              markBox={boxes.mark}
              reverting={reverting}
              saving={saving}
              refused={refused}
              refusedErrorId={refusedErrorId}
            />
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
