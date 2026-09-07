"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  ExternalLink,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  portalListingPublicPath,
  portalMetaLine,
} from "@/components/portal/animal-meta";
import type { ReadBox } from "@/components/portal/animal-form";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import {
  DraftResumedLine,
  EditorBreadcrumb,
  EditorSaveBar,
} from "@/components/portal/editor-chrome";
import { Glyph } from "@/components/portal/glyph";
import {
  ACCEPTED_PHOTO_TYPES,
  ListingForm,
  birthDateFault,
  draftFrom,
  inputOf,
  listingInput,
  readBoxControl,
  sameShape,
  sanitizeListingDraft,
  shapeOf,
  type Draft,
  type PendingPhoto,
  type Refused,
} from "@/components/portal/listing-form";
import {
  FieldError,
  PortalNotice,
  PortalPageHeading,
  PortalPending,
} from "@/components/portal/notice";
import {
  fieldControls,
  fieldRow,
  isPortalField,
  isPortalStatus,
  portalSpeciesIcon,
} from "@/components/portal/portal-fields";
import { usePortal } from "@/components/portal/portal-provider";
import { fill, portalText } from "@/components/portal/portal-text";
import { SaveStatusPip } from "@/components/portal/save-status";
import { SearchableChecklist } from "@/components/portal/searchable-checklist";
import { ListingStatusBlock } from "@/components/portal/status-block";
import { IDLE, type PortalSaveState } from "@/hooks/portal-list";
import { NEW_LISTING, type PortalListingActions } from "@/hooks/use-portal-listings";
import { PORTAL_PATH, portalAnimalPath } from "@/hooks/use-portal-session";
import {
  usePortalDraft,
  usePortalDraftMirror,
} from "@/hooks/use-portal-draft";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { Button } from "@/components/ui/button";
import type {
  PortalField,
  PortalListing,
  PortalShelter,
} from "@/lib/portal-api";

/** The same cap as PORTAL_MAX_UPLOAD_BYTES in apps/portal. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * Where a new listing's typed work is filed. A listing id is a uuid, so
 * nothing that exists can collide with it, and the shelter can only be writing
 * one new animal at a time per shelter.
 */
const NEW_DRAFT_ID = "nova";

/**
 * One manual listing, edited on the same page frame a crawled animal is.
 *
 * /portal/zival?zavetisce=<slug>&id=<uuid> edits one that exists;
 * &nova=1 writes one that does not. The shelter's own ingestion mode decides
 * which editor this address opens: AnimalEditorPage hands over here as soon as
 * the active shelter turns out to write its own listings.
 */
export function ListingEditorPage() {
  const params = useSearchParams();
  const router = useRouter();
  const {
    account,
    shelters,
    active,
    activeShelter,
    listings,
    listingState,
    reloadListings,
    listingSaveStates,
    listingActions,
    listingPublicName,
  } = usePortal();

  const slug = params.get("zavetisce");
  const listingId = params.get("id");
  const asked = params.get("polje");
  const polje = isPortalField(asked) ? asked : null;
  // The listing the POST on this visit answered with. Kept here rather than in
  // the editor because the address is replaced with its id the moment it
  // exists: without this the form would look like a different animal and
  // remount, taking the photos still going up with it.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const writing = params.get("nova") === "1" || createdId !== null;

  const known = shelters.some((shelter) => shelter.slug === slug);
  const showing = known && slug === active;
  const wanted = createdId ?? listingId;
  const listing =
    showing && wanted
      ? (listings.find((candidate) => candidate.id === wanted) ?? null)
      : null;

  const notFound = (
    <>
      <PortalPageHeading />
      <PortalNotice
        icon={SearchX}
        title={portalText.editorNotFoundTitle}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={PORTAL_PATH}>{portalText.backToList}</Link>
          </Button>
        }
      >
        {portalText.editorNotFoundLead}
      </PortalNotice>
    </>
  );

  // An address that names neither a listing nor a new one is not this page's,
  // and neither is a shelter the account does not have.
  if (!slug || !known || (!listingId && !writing)) return notFound;

  if (showing && listingState.status === "error") {
    return (
      <>
        <PortalPageHeading />
        <PortalNotice
          icon={TriangleAlert}
          title={portalText.listErrorTitle}
          action={
            <Button variant="outline" size="sm" onClick={reloadListings}>
              {portalText.retry}
            </Button>
          }
        >
          {listingState.message}
        </PortalNotice>
      </>
    );
  }

  // An id with no listing is only a wrong id once the list it would be in has
  // arrived. A new listing needs the same wait: the form is drawn over the
  // shelter, and until the list is ready the page does not have one.
  if (!showing || listingState.status !== "ready" || !activeShelter || !account) {
    return (
      <>
        <PortalPageHeading />
        <PortalPending label={portalText.loading} />
      </>
    );
  }

  if (!writing && !listing) return notFound;

  return (
    <ListingEditor
      // A different listing is a different form with a different draft. The
      // one that is being written keeps its key across the POST, so replacing
      // the address with the created id does not remount the form.
      key={writing || !listingId ? NEW_DRAFT_ID : listingId}
      listing={listing}
      account={account}
      shelter={activeShelter}
      publicName={listing ? listingPublicName(listing) : null}
      actions={listingActions}
      saveState={
        listingSaveStates[listing?.id ?? NEW_LISTING] ?? IDLE
      }
      field={polje}
      onCreated={(saved) => {
        setCreatedId(saved.id);
        // The listing exists now, so the address says which one. replace and
        // not push: Back must not return to an empty form that would write a
        // second animal.
        router.replace(portalAnimalPath(activeShelter.slug, saved.id));
      }}
      onDone={() => router.push(PORTAL_PATH)}
    />
  );
}

function ListingEditor({
  listing,
  account,
  shelter,
  publicName,
  actions,
  saveState,
  field,
  onCreated,
  onDone,
}: {
  /** Null while the listing is being written for the first time. */
  listing: PortalListing | null;
  /** Both halves of where this listing's draft is filed, with its id. */
  account: string;
  shelter: PortalShelter;
  /** The name the public page is filed under, or null when it has none yet. */
  publicName: string | null;
  actions: PortalListingActions;
  /** The listing's own slot, or NEW_LISTING's while it does not exist yet. */
  saveState: PortalSaveState;
  field: PortalField | null;
  onCreated: (listing: PortalListing) => void;
  onDone: () => void;
}) {
  const now = useMemo(() => new Date(), []);
  // Where this listing's typed work is filed. A new one has no id of its own
  // yet, and keeps this key for as long as it is being written.
  const [draftId] = useState(() => listing?.id ?? NEW_DRAFT_ID);
  // The typed half, and whatever this tab still holds of an earlier visit to
  // this listing. See the hook for what is kept and when it is dropped, and
  // sanitizeListingDraft for what of the stored half this form takes back.
  const {
    draft,
    setDraft,
    resumed,
    reset: resetDraft,
    clear: clearOwnDraft,
  } = usePortalDraft(
    account,
    shelter.slug,
    draftId,
    () => draftFrom(listing),
    sanitizeListingDraft,
  );
  /** The field the submit refused. One at a time, so one message at a time. */
  const [refused, setRefused] = useState<Refused | null>(null);
  // The boxes the browser could not read a value out of. "2-1" in a number
  // box and a year of 0001 in the date box both reach the change handler as
  // an empty value with validity.badInput set, so the draft says "" while
  // the box still shows what was typed. Kept apart from the draft on
  // purpose: a sentinel in the controlled value would be written back over
  // the shelter's text. While any box is here, the page has work it cannot
  // read and must neither save nor drop silently.
  const [unreadable, setUnreadable] = useState<ReadonlySet<ReadBox>>(
    () => new Set(),
  );
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // Around the POST, the PUT and the archive: the whole form waits on those.
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState<{
    index: number;
    total: number;
  } | null>(null);
  /** The sentence beside the photos: a refused file, a failed remove. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** The stored photo whose Odstrani is waiting for its second tap. */
  const [removing, setRemoving] = useState<number | null>(null);
  // The save slot is shared with the card's status buttons and an error in it
  // never expires, which is what the card needs: the shelter has to be able
  // to look away and still find out that the tap did not take. Arriving on
  // this page is not that attempt, so the failure the page opens on is
  // remembered here and stays out of the form. Every later save produces a
  // new state object, so identity is enough to tell the two apart.
  const [openedOn] = useState<PortalSaveState | null>(
    saveState.status === "error" ? saveState : null,
  );
  // The failure the shelter has already answered, by changing a field or by
  // starting another save. Same identity test: the slot holds the failure
  // until the next save replaces it, and the page has no other way to take
  // the line down.
  const [dismissed, setDismissed] = useState<PortalSaveState | null>(null);
  // Which control started the save the slot is reporting on. Shrani, the
  // status buttons, Odstrani objavo and the photo grid share one slot per
  // listing, and each failure has to be said next to the control that was
  // pressed. A photo's failure is the grid's own: a refused remove is said
  // beside it and a failed upload beside the file with its retry, so the page
  // says nothing else for it.
  const [origin, setOrigin] = useState<
    "form" | "status" | "archive" | "photo"
  >("form");
  // A save this page has started and not yet heard back from. The bar is
  // disabled one render later; this is for a second submit fired in code
  // before that render.
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Both confirms are opened in code, from a button on this page, so both put
  // the focus back themselves. One pair: only one of them can be open.
  const confirmFocus = useReturnFocus();
  // Every preview URL still outstanding. Object URLs are not garbage
  // collected, so each is revoked when its file is stored or dropped, and
  // whatever is left when the page unmounts.
  const previews = useRef(new Set<string>());
  const nextKey = useRef(0);

  const uid = useId();
  const errorId = `${uid}-error`;
  const statusErrorId = `${uid}-status-error`;
  const archiveErrorId = `${uid}-archive-error`;
  /** One refusal at a time, so the refused rows share the one message id. */
  const refusedErrorId = `${uid}-refused-error`;
  const photoErrorId = `${uid}-photo-error`;

  // Handed back outside React, because that is how they were handed over.
  useEffect(() => {
    const held = previews.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  // Coming in at a named row: the shelter tapped the card's "manjka" line, so
  // that row has to be what the page shows first. One frame after the mount,
  // which is where the page has finished laying out.
  useEffect(() => {
    if (!field) return;
    const frame = requestAnimationFrame(() => {
      const row = fieldRow(formRef.current, field);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      fieldControls(row)[0]?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [field]);

  // The draft as far as it can be read. A box the browser could not read
  // holds "" in the draft, which the shape would take for an emptied box and
  // send as the null that clears the shelter's own age or date, and the
  // mirror would then store that for the next visit to send. Those boxes
  // count as untouched here; the form still shows the draft, so their text
  // stays.
  const readable = useMemo(() => {
    if (unreadable.size === 0) return draft;
    const base = draftFrom(listing);
    const next = { ...draft };
    for (const box of unreadable) next[box] = base[box];
    return next;
  }, [draft, unreadable, listing]);
  const { shape: typed, ageError: badAgeBox } = shapeOf(readable);
  // An existing listing's status belongs to the summary, which saved it the
  // moment it was tapped, so the form sends back whatever the record holds
  // now. Without this the full replace would carry the status the draft was
  // built from and quietly undo a status changed while the shelter typed.
  const shape =
    listing && isPortalStatus(listing.status)
      ? { ...typed, status: listing.status }
      : typed;
  // The age and the date are not tested here: submit() returns on an unusable
  // one before it reads the input.
  const { input, missing } = inputOf(shape);
  const badDate = birthDateFault(readable, now);
  // What the form would change against what is saved, or against nothing.
  // Built from the saved listing alone, so it is not rebuilt on every
  // keystroke: sameShape below serialises both sides to compare them.
  const baseline = useMemo(() => shapeOf(draftFrom(listing)).shape, [listing]);
  const dirty = !sameShape(shape, baseline);
  // An unusable age or date produces no change the PUT could carry, but it is
  // still work the shelter typed and the page must not throw it away silently.
  const typedWork = dirty || badAgeBox !== null || badDate;
  // Plus the boxes the browser could not read. Their text is not in the
  // draft, so it is not mirrored, but it is the shelter's work all the same.
  const unreadableWork = unreadable.size > 0;
  // Pending files are work too: a failed upload is a photo the shelter still
  // means to add, and a new listing's files have nowhere to be yet.
  //
  // They are also the one kind of work this page cannot keep. A File is not
  // JSON and an object URL dies with the document, so a reload or a Back drops
  // whatever has not been stored. That is why leaving with one pending asks
  // first, and why the typed half below is mirrored to storage on every change.
  const unsaved = typedWork || unreadableWork || pending.length > 0;
  // An unusable box is not a change, but Shrani has to be pressable for the
  // form to point at it and say what is wrong.
  const canSave = listing
    ? typedWork || unreadableWork
    : missing === null;
  const busy = submitting || uploading !== null;
  const saving = saveState.status === "saving";
  const name = listing?.name ?? portalText.listingNewTitle;
  const status = listing && isPortalStatus(listing.status) ? listing.status : null;
  const speciesIcon = portalSpeciesIcon(listing?.species ?? draft.species);
  const photo = listing?.photos[0];
  // The save that did not go through, and only once it is this page's own
  // doing and has not been answered since.
  const failed =
    saveState.status === "error" &&
    saveState !== openedOn &&
    saveState !== dismissed
      ? saveState
      : null;
  const formFailure = failed && origin === "form" ? failed : null;
  const statusFailure = failed && origin === "status" ? failed : null;
  const archiveFailure = failed && origin === "archive" ? failed : null;
  // The public page is still filed under the name the list loaded with, so the
  // link says so beside it once the two have parted.
  const renamed = listing !== null && publicName !== listing.name;

  // Mirrored on every change, so a Back, a Forward and a reload all come back
  // to the same typed work. Only while there is work: a form nobody has
  // touched must not leave a key behind, or the list would mark every listing
  // that was ever opened.
  usePortalDraftMirror(
    account,
    shelter.slug,
    draftId,
    readable,
    typedWork,
    () => draftFrom(listing),
  );

  // A failed Shrani is said in the bar, which is on screen wherever the
  // shelter pressed from; the focus follows so a keyboard user lands on the
  // reason and a screen reader has it announced from where they are. Every
  // failure is a new state object, so this runs once per failure.
  useEffect(() => {
    if (!formFailure) return;
    const line = errorRef.current;
    if (!line) return;
    line.scrollIntoView({ block: "nearest" });
    line.focus({ preventScroll: true });
  }, [formFailure]);

  /** The failed save has been answered: the shelter changed something. */
  function touched() {
    if (formFailure) setDismissed(formFailure);
  }

  /** A new save replaces whatever the slot said about the last one. */
  function startSave(from: "form" | "status" | "archive" | "photo") {
    setOrigin(from);
    if (failed) setDismissed(failed);
  }

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    // An answer given to the refused field retires its message, and only its.
    if (key === "species" && value !== null) answered("species");
    if (key === "name" && String(value).trim() !== "") answered("name");
    touched();
  }

  function answered(target: Refused) {
    setRefused((current) => (current === target ? null : current));
  }

  function mark(box: ReadBox, bad: boolean) {
    setUnreadable((current) => {
      if (current.has(box) === bad) return current;
      const next = new Set(current);
      if (bad) next.add(box);
      else next.delete(box);
      return next;
    });
  }

  /**
   * The age's own setter. Typing in either box retires the age's error;
   * nothing else in the form can, or picking a size would clear a message
   * about a number the shelter has not corrected.
   */
  function setAge(
    key: "ageYears" | "ageMonths",
    value: string,
    unreadableNow: boolean,
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    mark(key, unreadableNow);
    answered("ageYears");
    answered("ageMonths");
    touched();
  }

  function setBirthDate(value: string, unreadableNow: boolean) {
    setDraft((current) => ({ ...current, birthDate: value }));
    mark("birthDate", unreadableNow);
    answered("birthDate");
    touched();
  }

  /**
   * Empties the boxes the browser could not read. Their text lives in the
   * DOM alone: the draft only ever held "" for them, so setting it to ""
   * again is no change React would write back, and the text would stay.
   */
  function emptyUnreadable() {
    if (unreadable.size === 0) return;
    for (const box of unreadable) {
      const control = readBoxControl(formRef.current, box);
      if (control) control.value = "";
    }
    setUnreadable(new Set());
  }

  /**
   * Puts a refused field back on screen, with the message the submit left on
   * it: a submit from the bar at the foot of the page leaves the reason off
   * screen otherwise.
   */
  function showRefused(target: Refused) {
    let control: HTMLElement | null | undefined;
    if (target === "species" || target === "name") {
      const row = fieldRow(formRef.current, target);
      control = row ? fieldControls(row)[0] : null;
    } else {
      control = readBoxControl(formRef.current, target);
    }
    control?.scrollIntoView({ block: "center" });
    control?.focus({ preventScroll: true });
  }

  /** The box the submit has to refuse, in the order the form reads them. */
  function firstFault(): Refused | null {
    if (missing) return missing;
    if (unreadable.has("birthDate") || badDate) return "birthDate";
    if (unreadable.has("ageYears") || badAgeBox === "years") return "ageYears";
    if (unreadable.has("ageMonths") || badAgeBox === "months") {
      return "ageMonths";
    }
    return null;
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

  /** The line's own button: keep the listing, drop what was typed before. */
  function discardStored() {
    resetDraft();
    emptyUnreadable();
    setRefused(null);
  }

  /** Takes the preview of a file that is stored or dropped back from the browser. */
  function releasePreview(item: PendingPhoto) {
    URL.revokeObjectURL(item.previewUrl);
    previews.current.delete(item.previewUrl);
  }

  /**
   * Stores `items` one after another, saying which one is going up. A file
   * that fails stays pending, marked, with its retry; the rest still go.
   * Answers whether any failed.
   */
  async function uploadFiles(
    listingId: string,
    items: PendingPhoto[],
  ): Promise<boolean> {
    // Every upload writes the listing's slot; from here its failures are the
    // grid's to say.
    startSave("photo");
    let failed = false;
    for (const [index, item] of items.entries()) {
      setUploading({ index: index + 1, total: items.length });
      const photo = await actions.uploadPhoto(listingId, item.file);
      if (photo) {
        releasePreview(item);
        setPending((current) =>
          current.filter((candidate) => candidate.key !== item.key),
        );
      } else {
        failed = true;
        setPending((current) =>
          current.map((candidate) =>
            candidate.key === item.key
              ? { ...candidate, failed: true }
              : candidate,
          ),
        );
      }
    }
    setUploading(null);
    return failed;
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // So the same file can be picked again after it was dropped.
    event.target.value = "";
    setPhotoError(null);
    setRemoving(null);

    const accepted: PendingPhoto[] = [];
    let rejected: string | null = null;
    for (const file of files) {
      if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
        rejected ??= fill(portalText.photoTypeRejected, { name: file.name });
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        rejected ??= fill(portalText.photoTooLarge, { name: file.name });
        continue;
      }
      const key = nextKey.current++;
      const previewUrl = URL.createObjectURL(file);
      previews.current.add(previewUrl);
      accepted.push({ key, file, previewUrl, failed: false });
    }
    if (rejected) setPhotoError(rejected);
    if (accepted.length === 0) return;

    setPending((current) => [...current, ...accepted]);
    // An existing listing has a photo route; a new one gets its id from the
    // save, and the files wait for that.
    if (listing) void uploadFiles(listing.id, accepted);
  }

  function retry(item: PendingPhoto) {
    if (!listing) return;
    const again = { ...item, failed: false };
    setPending((current) =>
      current.map((candidate) => (candidate.key === item.key ? again : candidate)),
    );
    void uploadFiles(listing.id, [again]);
  }

  function dropPending(item: PendingPhoto) {
    releasePreview(item);
    setPending((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
  }

  async function removePhoto(photoId: number) {
    if (!listing) return;
    if (removing !== photoId) {
      setRemoving(photoId);
      return;
    }
    setRemoving(null);
    setPhotoError(null);
    startSave("photo");
    if (!(await actions.deletePhoto(listing.id, photoId))) {
      setPhotoError(portalText.photoRemoveError);
    }
  }

  // The confirm closes on the tap and hands the focus back to Odstrani objavo,
  // which is where it belongs if the request fails; on success the page goes
  // and takes the focus with it.
  async function archive() {
    if (!listing) return;
    setArchiving(false);
    startSave("archive");
    setSubmitting(true);
    try {
      if (await actions.archive(listing.id)) {
        clearOwnDraft();
        onDone();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The bar is disabled while a save is on its way, so a tap cannot reach
    // here twice; a submit fired in code can, and must not send the body
    // again.
    if (busy || inFlight.current) return;

    const fault = firstFault();
    if (fault) {
      setRefused(fault);
      showRefused(fault);
      return;
    }
    if (!input) return;

    // From here the form owns whatever the shared save slot says next.
    startSave("form");
    inFlight.current = true;
    setSubmitting(true);
    try {
      if (listing) {
        if (await actions.update(listing.id, input)) {
          clearOwnDraft();
          onDone();
        }
        return;
      }
      const saved = await actions.create(input);
      if (!saved) return;
      clearOwnDraft();
      onCreated(saved);
      // The listing exists now whatever happens to its photos, so from here
      // the page is editing it. A failed file stays on screen with its retry
      // rather than leaving over a listing with fewer photos than the shelter
      // picked. `pending` is this render's, which is the one the submit was
      // clicked in: nothing could be picked during the POST.
      if (!(await uploadFiles(saved.id, pending))) onDone();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <EditorBreadcrumb
        name={name}
        blocked={unsaved}
        // Inert for as long as the bar is: a save or an upload on its way
        // would lose the page that is waiting for the answer.
        saving={busy}
        onBlocked={() => setConfirming(true)}
      />

      {/* One form over both columns, so the bar in the summary submits the
          rows beside it without a form attribute to tie them together. */}
      <form ref={formRef} onSubmit={submit} noValidate>
        {/* min-w-0 on both grid items, as on the crawled page: a long name
            with no space in it would otherwise widen the column past the
            viewport below lg, and the truncate on the h1 could not cut it. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
            <div className="flex items-start gap-3">
              {photo ? (
                // The API host is not one next/image knows, and the stored
                // copy is already capped at 2048px.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
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
                <h1 className="min-w-0 truncate text-xl font-medium tracking-tight">
                  {name}
                </h1>
                {listing ? (
                  <>
                    <p className="truncate text-sm text-muted-foreground">
                      {portalMetaLine(listing, now)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {shelter.name}
                    </p>
                  </>
                ) : (
                  // Nothing to summarise yet, so the space says what this form
                  // is for instead: how soon the animal reaches the site.
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {portalText.listingNewLead}
                  </p>
                )}
              </div>

              {/* The same quiet place the card keeps for the outcome of a
                  save, so a status tap reports itself the same way here. */}
              <SaveStatusPip state={saveState} />
            </div>

            {/* Only once there is a listing to save it against. Until then the
                status is a row in the form, which the POST carries. */}
            {listing && (
              <>
                <ListingStatusBlock
                  status={status}
                  busy={busy || saving}
                  // The route is a full replace, so the tap sends the whole
                  // listing with the status swapped, exactly as the card does.
                  onSelect={(next) => {
                    startSave("status");
                    void actions.update(listing.id, {
                      ...listingInput(listing),
                      status: next,
                    });
                  }}
                />
                {/* Under the buttons that were tapped, where the shelter is
                    looking, not in a bar they did not press. */}
                {statusFailure && (
                  <FieldError id={statusErrorId}>
                    {statusFailure.message}
                  </FieldError>
                )}

                {/* Only once the public site can have a page to link to. A
                    listing created in this session is in no build yet, and its
                    address would land on the site's own not-found. */}
                {publicName !== null && (
                  <div className="space-y-1">
                    <Button asChild variant="ghost" size="sm" className="-ml-2">
                      {/* A new tab, so the form the shelter is filling in
                          stays where it is. */}
                      <a
                        href={portalListingPublicPath(
                          listing,
                          shelter,
                          publicName,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
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
                )}

                {/* Beside the form, never above it. On a phone the summary
                    sits on top of the section this repeats, and every row in
                    that section already carries the same mark. */}
                <div className="max-lg:hidden">
                  <SearchableChecklist animal={listing} />
                </div>
              </>
            )}

            {/* One bar, in two places. Beside the form on a wide screen, where
                the summary is sticky and it rides along; pinned to the bottom
                of the window below that, where the summary is at the top of a
                page the shelter has scrolled away from.
                The bottom padding carries the phone's home indicator, and the
                page's own max-lg:pb-28 keeps the last row clear of the bar. */}
            <EditorSaveBar
              saving={submitting}
              cancelDisabled={busy}
              saveDisabled={busy || !canSave}
              error={
                formFailure && (
                  <FieldError ref={errorRef} id={errorId} focusable>
                    {formFailure.message}
                  </FieldError>
                )
              }
              onCancel={requestLeave}
            />

            {/* The shelter's delete, last and on its own: it is the one action
                here that cannot be undone from the portal. A refused one is
                said right under it. */}
            {listing && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setArchiving(true)}
                  className="-ml-2 text-destructive hover:text-destructive"
                >
                  {portalText.listingArchive}
                </Button>
                {archiveFailure && (
                  <FieldError id={archiveErrorId}>
                    {archiveFailure.message}
                  </FieldError>
                )}
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-6 max-lg:pb-28">
            {/* Above the rows it is about, and quiet: the shelter came back to
                a form that is not the listing's saved state, and nothing else
                on the page would say why. */}
            {resumed && (
              <DraftResumedLine disabled={busy} onDiscard={discardStored} />
            )}

            <ListingForm
              uid={uid}
              listing={listing}
              draft={draft}
              set={set}
              setAge={setAge}
              setBirthDate={setBirthDate}
              markBox={mark}
              refused={refused}
              refusedErrorId={refusedErrorId}
              disabled={submitting}
              photos={{
                stored: listing?.photos ?? [],
                pending,
                uploading,
                error: photoError,
                errorId: photoErrorId,
                removing,
                busy,
                storable: listing !== null,
                onPick: pickFiles,
                onRetry: retry,
                onDrop: dropPending,
                onRemove: (photoId) => void removePhoto(photoId),
              }}
            />
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={portalText.leaveTitle}
        // A listing that has never been saved has no status behind it, so the
        // sentence that says the status was kept would not be true of it.
        lead={listing ? portalText.leaveLead : portalText.leaveNewLead}
        keepLabel={portalText.keepEditing}
        confirmLabel={portalText.discardChanges}
        onConfirm={discard}
        {...confirmFocus.props}
      />

      {/* The lead says when the animal leaves the public site, because for a
          manual shelter this form is the only listing there is. */}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={fill(portalText.listingArchiveTitle, { name })}
        lead={portalText.listingArchiveLead}
        keepLabel={portalText.listingArchiveCancel}
        confirmLabel={portalText.listingArchive}
        onConfirm={() => void archive()}
        {...confirmFocus.props}
      />
    </>
  );
}
