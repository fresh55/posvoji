"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  PORTAL_SPECIAL_NEEDS_ANSWERS,
  SEARCHABLE_FIELDS,
  SEX_META,
  SIZE_META,
  SPECIAL_NEEDS_META,
  SPECIES_META,
  STATUS_META,
  choiceCard,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
  isPortalStatus,
  specialNeedsAnswer,
  specialNeedsValue,
  type PortalSpecialNeedsAnswer,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalSaveState } from "@/hooks/use-portal-animals";
import type { PortalListingActions } from "@/hooks/use-portal-listings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PORTAL_COMPATIBILITIES,
  PORTAL_ENERGIES,
  PORTAL_SEXES,
  PORTAL_SIZES,
  PORTAL_SPECIES,
  PORTAL_STATUSES,
  type PortalCompatibility,
  type PortalEnergy,
  type PortalField,
  type PortalListing,
  type PortalListingInput,
  type PortalSex,
  type PortalSize,
  type PortalSpecies,
  type PortalStatus,
} from "@/lib/portal-api";
import { SPECIES_ORDER } from "@/lib/species";
import { cn } from "@/lib/utils";

/** What the API takes, checked by opening the file; this is the first pass. */
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The same cap as PORTAL_MAX_UPLOAD_BYTES in apps/portal. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** The rows the form has, for the data-field marks opening at one needs. */
type ListingField = PortalField | "species" | "photos";

type Draft = {
  species: PortalSpecies | null;
  status: PortalStatus;
  name: string;
  breed: string;
  birthDate: string;
  /** The age is one number on the wire and two inputs here: years and months. */
  ageYears: string;
  ageMonths: string;
  shortDescription: string;
  sex: PortalSex | null;
  size: PortalSize | null;
  energy: PortalEnergy | null;
  goodWithKids: PortalCompatibility | null;
  goodWithDogs: PortalCompatibility | null;
  goodWithCats: PortalCompatibility | null;
  apartmentOk: PortalCompatibility | null;
  specialNeeds: PortalSpecialNeedsAnswer | null;
};

/**
 * The input as the draft reads right now, before the two required fields are
 * enforced. Kept apart from PortalListingInput so "what changed" can be
 * asked of a draft the API would refuse.
 */
type Shape = Omit<PortalListingInput, "species" | "name"> & {
  species: PortalSpecies | null;
  name: string | null;
};

/** Which of the two age inputs holds something that is not a count. */
type AgeBox = "years" | "months";

/** The two fields a listing cannot exist without. */
type Required = "species" | "name";

/** A file picked for a listing and not stored yet. */
type PendingPhoto = {
  key: number;
  file: File;
  /** An object URL of the file, revoked once the file is stored or dropped. */
  previewUrl: string;
  failed: boolean;
};

const isPortalSpecies = (value: string | null): value is PortalSpecies =>
  value !== null && (PORTAL_SPECIES as readonly string[]).includes(value);

/** <input type="date"> only understands YYYY-MM-DD, so both sides get cut to it. */
function isoDate(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function trimmed(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/**
 * The stored month count split over the two age inputs. A half that comes out
 * zero stays empty rather than reading "0", except when the whole age is zero
 * and the months box is the only place left to show it.
 */
function ageParts(total: number | null): { years: string; months: string } {
  if (total === null) return { years: "", months: "" };
  const years = Math.floor(total / 12);
  const months = total % 12;
  return {
    years: years === 0 ? "" : String(years),
    months: months === 0 && years !== 0 ? "" : String(months),
  };
}

/** Both halves of the age are whole counts, never a fraction or a minus. */
function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * The form a new listing opens on: nothing chosen but the status, which the
 * API defaults to "available" and the form says out loud.
 */
const EMPTY_DRAFT: Draft = {
  species: null,
  status: "available",
  name: "",
  breed: "",
  birthDate: "",
  ageYears: "",
  ageMonths: "",
  shortDescription: "",
  sex: null,
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: null,
  apartmentOk: null,
  specialNeeds: null,
};

function draftFrom(listing: PortalListing | null): Draft {
  if (!listing) return EMPTY_DRAFT;
  const age = ageParts(listing.approximateAgeMonths);
  return {
    species: isPortalSpecies(listing.species) ? listing.species : null,
    status: isPortalStatus(listing.status) ? listing.status : "available",
    name: listing.name,
    breed: listing.breed ?? "",
    birthDate: isoDate(listing.birthDate) ?? "",
    ageYears: age.years,
    ageMonths: age.months,
    shortDescription: listing.shortDescription ?? "",
    sex: isPortalSex(listing.sex) ? listing.sex : null,
    size: isPortalSize(listing.size) ? listing.size : null,
    energy: isPortalEnergy(listing.energy) ? listing.energy : null,
    goodWithKids: isPortalCompatibility(listing.goodWithKids)
      ? listing.goodWithKids
      : null,
    goodWithDogs: isPortalCompatibility(listing.goodWithDogs)
      ? listing.goodWithDogs
      : null,
    goodWithCats: isPortalCompatibility(listing.goodWithCats)
      ? listing.goodWithCats
      : null,
    apartmentOk: isPortalCompatibility(listing.apartmentOk)
      ? listing.apartmentOk
      : null,
    specialNeeds: specialNeedsAnswer(listing.specialNeeds),
  };
}

/**
 * The whole draft as the API would read it. The age stays null while a box
 * holds something that is not a count, and says which box.
 */
function shapeOf(draft: Draft): { shape: Shape; ageError: AgeBox | null } {
  // The wire carries one month count. An empty half counts as zero, so
  // "2 let" alone is two years; only two empty boxes mean no age. The months
  // box is not capped at eleven: "18 mesecev" adds up to the same age.
  const rawYears = draft.ageYears.trim();
  const rawMonths = draft.ageMonths.trim();
  let ageError: AgeBox | null = null;
  let approximateAgeMonths: number | null = null;
  if (rawYears !== "" || rawMonths !== "") {
    const years = rawYears === "" ? 0 : Number(rawYears);
    const months = rawMonths === "" ? 0 : Number(rawMonths);
    if (!isCount(years)) ageError = "years";
    else if (!isCount(months)) ageError = "months";
    else approximateAgeMonths = years * 12 + months;
  }

  return {
    shape: {
      species: draft.species,
      name: trimmed(draft.name),
      status: draft.status,
      sex: draft.sex,
      breed: trimmed(draft.breed),
      birthDate: trimmed(draft.birthDate),
      approximateAgeMonths,
      size: draft.size,
      energy: draft.energy,
      goodWithKids: draft.goodWithKids,
      goodWithDogs: draft.goodWithDogs,
      goodWithCats: draft.goodWithCats,
      apartmentOk: draft.apartmentOk,
      specialNeeds: specialNeedsValue(draft.specialNeeds),
      shortDescription: trimmed(draft.shortDescription),
    },
    ageError,
  };
}

function sameShape(left: Shape, right: Shape): boolean {
  return (Object.keys(left) as (keyof Shape)[]).every(
    (key) => left[key] === right[key],
  );
}

/** The first required field the shape leaves empty, in the form's order. */
function missingRequired(shape: Shape): Required | null {
  if (shape.species === null) return "species";
  if (shape.name === null) return "name";
  return null;
}

/**
 * A saved listing as the PUT body that would leave it unchanged. The card's
 * status buttons send this with one field swapped, because the route is a
 * full replace and a partial body would clear everything it left out.
 *
 * The API's own enums make the fallbacks unreachable: a listing is stored
 * through ListingIn, which only admits these values.
 */
export function listingInput(listing: PortalListing): PortalListingInput {
  const { shape } = shapeOf(draftFrom(listing));
  return {
    ...shape,
    species: shape.species ?? "other",
    name: shape.name ?? listing.name,
  };
}

/**
 * A filter the adopter searches by that this listing still has no answer for.
 * Built to the same scale as the crawled editor's mark.
 */
function MissingMark() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-4xl border border-amber-500/40 px-1.5 text-2xs font-medium text-amber-700 dark:text-amber-300">
      <Search className="size-2.5" aria-hidden />
      {portalText.missingBadge}
    </span>
  );
}

/** The hint a field renders, named so its control can point aria at it. */
function hintId(uid: string, field: ListingField): string {
  return `${uid}-${field}-hint`;
}

/**
 * Label row shared by every field. The crawled editor's row without the edit
 * mark and the way back: there is no crawled value under a listing to go
 * back to, so a row is only ever the shelter's own.
 */
function Field({
  uid,
  field,
  label,
  htmlFor,
  missing = false,
  hint,
  error,
  errorId,
  children,
}: {
  /** The form's id prefix, which the hint's own id is built from. */
  uid: string;
  /** Names the row so opening the dialog at one field can find it. */
  field: ListingField;
  label: string;
  /** Set for a single control; left out for the icon rows, which are groups. */
  htmlFor?: string;
  /** Searchable and unanswered on the saved listing, not on the draft. */
  missing?: boolean;
  hint?: string;
  /** Under the control, where the shelter is looking when it is refused. */
  error?: string | null;
  errorId?: string;
  children: ReactNode;
}) {
  const heading = (
    <>
      {label}
      {missing && <MissingMark />}
    </>
  );

  return (
    <div data-field={field} className="space-y-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        {htmlFor ? (
          <Label htmlFor={htmlFor}>{heading}</Label>
        ) : (
          <span className="flex items-center gap-2 text-sm leading-none font-medium">
            {heading}
          </span>
        )}
      </div>
      <div data-field-control>{children}</div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId(uid, field)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The one form a manual shelter's listing has. `listing` null is a new one;
 * otherwise it edits, and every save sends the whole record.
 *
 * Photos have routes of their own, so on an existing listing a picked file is
 * stored the moment it is picked. A new listing has no id for the photo route
 * until it is saved, so its files wait as previews and go up one by one after
 * the POST. A parent that keeps the dialog open through that should hand the
 * created listing back in through `listing` once `onCreated` reports it, so
 * the photos the uploads add are read off the live record; until it does, the
 * form holds the created listing itself.
 */
export function ListingForm({
  listing,
  open,
  onOpenChange,
  actions,
  saveState,
  onCreated,
  initialField = null,
}: {
  listing: PortalListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: PortalListingActions;
  /** The listing's own slot, or NEW_LISTING's while it does not exist yet. */
  saveState: PortalSaveState;
  /** The POST went through; the dialog is now editing what it answered. */
  onCreated?: (listing: PortalListing) => void;
  /** The field to open at, when the card sent the shelter to a named one. */
  initialField?: PortalField | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(listing));
  // The listing the POST answered with, for a parent that does not switch
  // the prop over. Cleared on every fresh open.
  const [created, setCreated] = useState<PortalListing | null>(null);
  const [ageError, setAgeError] = useState(false);
  const [requiredError, setRequiredError] = useState<Required | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // The save slot is shared with the card's status buttons and an error in
  // it never expires, so the foot of the form only reads it once this form
  // has sent a save of its own.
  const [attempted, setAttempted] = useState(false);
  // Around the POST, the PUT and the archive: the whole form waits on those.
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState<{
    index: number;
    total: number;
  } | null>(null);
  /** The sentence beside the photo control: a refused file, a failed remove. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** The stored photo whose Odstrani is waiting for its second tap. */
  const [removing, setRemoving] = useState<number | null>(null);
  const [source, setSource] = useState({ id: listing?.id ?? null, open });
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const speciesRef = useRef<HTMLDivElement>(null);
  const ageYearsRef = useRef<HTMLInputElement>(null);
  const ageMonthsRef = useRef<HTMLInputElement>(null);
  // The form is opened programmatically, so Radix has no trigger to give the
  // focus back to and would leave it on <body>. Every dialog here captures
  // what was focused before it opened and puts it back itself.
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirmReturnFocus = useRef<HTMLElement | null>(null);
  const archiveReturnFocus = useRef<HTMLElement | null>(null);
  // Every object URL made for a preview, by the pending file's key. Object
  // URLs are not garbage collected, so each is revoked when its file is
  // stored or dropped, and the rest when the dialog closes or unmounts.
  const previews = useRef(new Map<number, string>());
  // Bumped on every close, so an upload loop the shelter walked away from
  // stops writing into the next opening's state.
  const sessionRef = useRef(0);
  const nextKey = useRef(0);

  const uid = useId();
  const nameId = `${uid}-name`;
  const breedId = `${uid}-breed`;
  const birthDateId = `${uid}-birth-date`;
  const ageYearsId = `${uid}-age-years`;
  const ageMonthsId = `${uid}-age-months`;
  const descriptionId = `${uid}-description`;
  const fileId = `${uid}-file`;
  const compatibilityHintId = `${uid}-compatibility-hint`;
  const errorId = `${uid}-error`;
  const ageErrorId = `${uid}-age-error`;
  const requiredErrorId = `${uid}-required-error`;
  const photoErrorId = `${uid}-photo-error`;

  const current = listing ?? created;

  // The dialog opens on whatever the server last confirmed. Adjusted during
  // render rather than in an effect: only a prop the draft is derived from
  // changed. Keyed on the id, not the object: a photo upload replaces the
  // listing object mid-edit, and a draft reset then would drop typed work.
  const id = listing?.id ?? null;
  if (source.id !== id || source.open !== open) {
    setSource({ id, open });
    if (source.open !== open) {
      // Both ways: a fresh open starts with no files, and a close drops
      // whatever an upload loop was still reporting.
      setPending([]);
      setUploading(null);
      setCreated(null);
      setPhotoError(null);
      setRemoving(null);
    }
    if (open) {
      setDraft(draftFrom(listing));
      setAgeError(false);
      setRequiredError(null);
      setConfirming(false);
      setArchiving(false);
      setAttempted(false);
    }
  }

  // The previews are handed to the browser outside React, so they are taken
  // back outside it too: on close, and on an unmount with one still up.
  useEffect(() => {
    if (open) return;
    sessionRef.current += 1;
    for (const url of previews.current.values()) URL.revokeObjectURL(url);
    previews.current.clear();
  }, [open]);
  useEffect(() => {
    const held = previews.current;
    return () => {
      for (const url of held.values()) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  // Opening at a field: the shelter came from the card's "manjka" line, so the
  // row it named has to be what the dialog shows first. One frame after the
  // open, which is where the dialog has finished mounting and taken its own
  // initial focus.
  useEffect(() => {
    if (!open || !initialField) return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current;
      const panel = form?.parentElement;
      const row = form?.querySelector<HTMLElement>(
        `[data-field="${initialField}"]`,
      );
      if (!panel || !row) return;
      const offset =
        row.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      panel.scrollTo({ top: Math.max(panel.scrollTop + offset - 12, 0) });
      row
        .querySelector<HTMLElement>(
          "[data-field-control] input, [data-field-control] textarea, [data-field-control] button",
        )
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initialField]);

  const editing = current !== null;
  const { shape, ageError: badAgeBox } = shapeOf(draft);
  const missing = missingRequired(shape);
  const input: PortalListingInput | null =
    shape.species !== null && shape.name !== null && badAgeBox === null
      ? { ...shape, species: shape.species, name: shape.name }
      : null;
  // What the form would change against what is saved, or against nothing.
  const baseline = shapeOf(draftFrom(current)).shape;
  const dirty = !sameShape(shape, baseline);
  // Pending files are work too: a failed upload is a photo the shelter still
  // means to add, and a new listing's files have nowhere to be yet.
  const unsaved = dirty || badAgeBox !== null || pending.length > 0;
  // An unusable age is not a change, but Shrani has to be pressable for the
  // form to say what is wrong with it.
  const canSave = editing ? dirty || badAgeBox !== null : missing === null;
  const busy = submitting || uploading !== null;
  const name = current?.name ?? portalText.unnamed;
  const errorText =
    attempted && saveState.status === "error" ? saveState.message : null;

  // Which of the adopter's filters this listing still leaves blank. Read off
  // the saved listing, not the draft, so the row keeps saying what the public
  // site currently knows until the save goes through.
  const missingSearchable = new Set<PortalField>(
    current
      ? SEARCHABLE_FIELDS.filter((field) => current[field.key] === null).map(
          (field) => field.key,
        )
      : [],
  );

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((draft) => ({ ...draft, [key]: value }));
  }

  /**
   * The age's own setter. Typing in either box retires its error; nothing
   * else in the form can.
   */
  function setAge(key: "ageYears" | "ageMonths", value: string) {
    setDraft((draft) => ({ ...draft, [key]: value }));
    setAgeError(false);
  }

  /** Every way out but a finished save. Typed work is confirmed away, never dropped. */
  function requestClose() {
    if (unsaved) {
      setConfirming(true);
      return;
    }
    onOpenChange(false);
  }

  function discard() {
    // The form the focus would go back to is about to unmount with the
    // dialog, which then puts the focus back where it opened from.
    confirmReturnFocus.current = null;
    setConfirming(false);
    onOpenChange(false);
  }

  /** Takes the preview of a file that is stored or dropped back from the browser. */
  function releasePreview(key: number) {
    const url = previews.current.get(key);
    if (url === undefined) return;
    URL.revokeObjectURL(url);
    previews.current.delete(key);
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
    const session = sessionRef.current;
    let failed = false;
    for (const [index, item] of items.entries()) {
      setUploading({ index: index + 1, total: items.length });
      const photo = await actions.uploadPhoto(listingId, item.file);
      if (sessionRef.current !== session) return failed;
      if (photo) {
        releasePreview(item.key);
        setPending((pending) =>
          pending.filter((candidate) => candidate.key !== item.key),
        );
      } else {
        failed = true;
        setPending((pending) =>
          pending.map((candidate) =>
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
    let refused: string | null = null;
    for (const file of files) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        refused ??= fill(portalText.photoTypeRejected, { name: file.name });
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        refused ??= fill(portalText.photoTooLarge, { name: file.name });
        continue;
      }
      const key = nextKey.current++;
      const previewUrl = URL.createObjectURL(file);
      previews.current.set(key, previewUrl);
      accepted.push({ key, file, previewUrl, failed: false });
    }
    if (refused) setPhotoError(refused);
    if (accepted.length === 0) return;

    setPending((pending) => [...pending, ...accepted]);
    // An existing listing has a photo route; a new one gets its id from the
    // save, and the files wait for that.
    if (current) void uploadFiles(current.id, accepted);
  }

  function retry(item: PendingPhoto) {
    if (!current) return;
    const again = { ...item, failed: false };
    setPending((pending) =>
      pending.map((candidate) => (candidate.key === item.key ? again : candidate)),
    );
    void uploadFiles(current.id, [again]);
  }

  function dropPending(item: PendingPhoto) {
    releasePreview(item.key);
    setPending((pending) =>
      pending.filter((candidate) => candidate.key !== item.key),
    );
  }

  async function removePhoto(photoId: number) {
    if (!current) return;
    if (removing !== photoId) {
      setRemoving(photoId);
      return;
    }
    setRemoving(null);
    setPhotoError(null);
    if (!(await actions.deletePhoto(current.id, photoId))) {
      setPhotoError(portalText.photoRemoveError);
    }
  }

  // The confirm closes on the tap and hands the focus back to Odstrani
  // objavo, which is where it belongs if the request fails; on success the
  // whole dialog closes after it and moves the focus out again.
  async function archive() {
    if (!current) return;
    setArchiving(false);
    setAttempted(true);
    setSubmitting(true);
    try {
      if (await actions.archive(current.id)) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A refused field takes the focus with it: a submit from the sticky
    // footer leaves the reason off screen otherwise.
    if (missing) {
      setRequiredError(missing);
      const target =
        missing === "species"
          ? speciesRef.current?.querySelector<HTMLElement>("button")
          : nameRef.current;
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }
    if (badAgeBox) {
      setAgeError(true);
      const box =
        badAgeBox === "years" ? ageYearsRef.current : ageMonthsRef.current;
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
      return;
    }
    if (!input) return;

    // From here the form owns whatever the shared save slot says next.
    setAttempted(true);
    setSubmitting(true);
    try {
      if (current) {
        if (await actions.update(current.id, input)) onOpenChange(false);
        return;
      }
      const saved = await actions.create(input);
      if (!saved) return;
      setCreated(saved);
      onCreated?.(saved);
      // The listing exists now whatever happens to its photos, so from here
      // the dialog is editing it. A failed file stays on screen with its
      // retry rather than closing over a listing with fewer photos than the
      // shelter picked. `pending` is this render's, which is the one the
      // submit was clicked in: nothing could be picked during the POST.
      const failed = await uploadFiles(saved.id, pending);
      if (!failed) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const photos = current?.photos ?? [];

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        closeLabel="Zapri"
        className="gap-0"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
          returnFocus.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">
            {editing
              ? fill(portalText.editTitle, { name })
              : portalText.listingNewTitle}
          </DialogTitle>
          <DialogDescription>
            {editing ? portalText.listingEditLead : portalText.listingNewLead}
          </DialogDescription>
        </DialogHeader>

        {/* The two fields a listing cannot exist without come first, then
            the photos, then the status and the five fields an adopter
            narrows the public grid by, then the descriptive rest. */}
        <form
          ref={formRef}
          onSubmit={submit}
          className="mt-5 space-y-5"
          noValidate
        >
          <Field
            uid={uid}
            field="species"
            label={portalText.fieldSpecies}
            error={requiredError === "species" ? portalText.speciesRequired : null}
            errorId={requiredErrorId}
          >
            <div ref={speciesRef}>
              <ChoiceGrid
                label={portalText.fieldSpecies}
                options={SPECIES_ORDER}
                meta={SPECIES_META}
                value={draft.species}
                onPick={(species) => {
                  set("species", species);
                  if (species) setRequiredError(null);
                }}
                disabled={submitting}
                describedBy={
                  requiredError === "species" ? requiredErrorId : undefined
                }
              />
            </div>
          </Field>

          <Field
            uid={uid}
            field="name"
            label={portalText.fieldName}
            htmlFor={nameId}
            hint={portalText.nameHint}
            error={requiredError === "name" ? portalText.nameRequired : null}
            errorId={requiredErrorId}
          >
            <Input
              ref={nameRef}
              id={nameId}
              value={draft.name}
              disabled={submitting}
              aria-invalid={requiredError === "name" || undefined}
              aria-errormessage={
                requiredError === "name" ? requiredErrorId : undefined
              }
              aria-describedby={hintId(uid, "name")}
              onChange={(event) => {
                set("name", event.target.value);
                if (event.target.value.trim()) setRequiredError(null);
              }}
            />
          </Field>

          <Field
            uid={uid}
            field="photos"
            label={portalText.fieldPhotos}
            hint={`${portalText.photosHint} ${portalText.photoLimits}`}
            error={photoError}
            errorId={photoErrorId}
          >
            <div
              role="group"
              aria-label={portalText.fieldPhotos}
              aria-describedby={hintId(uid, "photos")}
              className="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
            >
              {photos.map((photo, index) => {
                const confirm = removing === photo.id;
                return (
                  <figure key={photo.id} className="space-y-1">
                    {/* The API host is not one next/image knows, and the
                        stored copy is already capped at 2048px. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      width={photo.width}
                      height={photo.height}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-ui border bg-muted/40 object-cover"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={busy}
                      aria-label={
                        confirm
                          ? undefined
                          : fill(portalText.photoRemoveLabel, {
                              index: index + 1,
                            })
                      }
                      onClick={() => void removePhoto(photo.id)}
                      className={cn(
                        "w-full font-normal text-muted-foreground hover:text-foreground",
                        confirm && "text-destructive hover:text-destructive",
                      )}
                    >
                      {confirm
                        ? portalText.photoRemoveConfirm
                        : portalText.photoRemove}
                    </Button>
                  </figure>
                );
              })}

              {pending.map((item) => (
                <figure key={item.key} className="space-y-1">
                  {/* A local object URL; nothing to optimise. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt=""
                    className={cn(
                      "aspect-square w-full rounded-ui border bg-muted/40 object-cover",
                      !item.failed && "opacity-60",
                    )}
                  />
                  {item.failed ? (
                    <div className="space-y-1">
                      <p
                        role="alert"
                        className="text-2xs leading-tight text-destructive"
                      >
                        {fill(portalText.photoUploadFailed, {
                          name: item.file.name,
                        })}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={busy || !current}
                          onClick={() => retry(item)}
                          className="flex-1"
                        >
                          <RefreshCw aria-hidden />
                          {portalText.photoRetry}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy}
                          onClick={() => dropPending(item)}
                          className="font-normal text-muted-foreground hover:text-foreground"
                        >
                          {portalText.photoRemove}
                        </Button>
                      </div>
                    </div>
                  ) : editing ? (
                    <p className="text-center text-2xs text-muted-foreground">
                      {portalText.photoPending}
                    </p>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={busy}
                      onClick={() => dropPending(item)}
                      className="w-full font-normal text-muted-foreground hover:text-foreground"
                    >
                      {portalText.photoRemove}
                    </Button>
                  )}
                </figure>
              ))}

              {/* The picker is an icon card like every other choice in the
                  form. The input itself is what takes the focus, so the card
                  draws the ring for it. */}
              <label
                htmlFor={fileId}
                className={choiceCard(
                  false,
                  cn(
                    "aspect-square cursor-pointer flex-col gap-1 self-start px-1.5 py-1.5 text-center text-xs leading-tight font-medium focus-within:border-ring focus-within:ring-3 focus-within:ring-ring",
                    busy && "pointer-events-none opacity-50",
                  ),
                )}
              >
                <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
                <span>{portalText.photoAdd}</span>
                <input
                  id={fileId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={busy}
                  aria-describedby={hintId(uid, "photos")}
                  onChange={pickFiles}
                  className="sr-only"
                />
              </label>
            </div>
            {uploading && (
              <p
                aria-live="polite"
                className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                {fill(portalText.photoUploading, uploading)}
              </p>
            )}
          </Field>

          <Field
            uid={uid}
            field="status"
            label={portalText.statusLegend}
          >
            <ChoiceGrid
              label={portalText.statusLegend}
              options={PORTAL_STATUSES}
              meta={STATUS_META}
              value={draft.status}
              // A listing always has a status, so the chosen card cannot be
              // tapped off; the API would default it to "available" anyway.
              onPick={(status) => {
                if (status) set("status", status);
              }}
              disabled={submitting}
            />
          </Field>

          <Field
            uid={uid}
            field="energy"
            label={portalText.fieldEnergy}
            missing={missingSearchable.has("energy")}
            hint={portalText.listingEnergyHint}
          >
            <ChoiceGrid
              label={portalText.fieldEnergy}
              options={PORTAL_ENERGIES}
              meta={ENERGY_META}
              value={draft.energy}
              onPick={(energy) => set("energy", energy)}
              disabled={submitting}
              describedBy={hintId(uid, "energy")}
            />
          </Field>

          <div className="space-y-5">
            {(
              [
                ["goodWithKids", portalText.fieldGoodWithKids],
                ["goodWithDogs", portalText.fieldGoodWithDogs],
                ["goodWithCats", portalText.fieldGoodWithCats],
              ] as const
            ).map(([field, label]) => (
              <Field
                key={field}
                uid={uid}
                field={field}
                label={label}
                missing={missingSearchable.has(field)}
              >
                <ChoiceGrid
                  label={label}
                  options={PORTAL_COMPATIBILITIES}
                  meta={COMPATIBILITY_META}
                  value={draft[field]}
                  onPick={(value) => set(field, value)}
                  disabled={submitting}
                  describedBy={compatibilityHintId}
                />
              </Field>
            ))}
            {/* One line for the three rows above, so all three point at it. */}
            <p
              id={compatibilityHintId}
              className="text-xs text-muted-foreground"
            >
              {portalText.compatibilityHint}
            </p>
          </div>

          <Field
            uid={uid}
            field="apartmentOk"
            label={portalText.fieldApartmentOk}
            missing={missingSearchable.has("apartmentOk")}
          >
            <ChoiceGrid
              label={portalText.fieldApartmentOk}
              options={PORTAL_COMPATIBILITIES}
              meta={COMPATIBILITY_META}
              value={draft.apartmentOk}
              onPick={(value) => set("apartmentOk", value)}
              disabled={submitting}
            />
          </Field>

          <Field uid={uid} field="sex" label={portalText.fieldSex}>
            <ChoiceGrid
              label={portalText.fieldSex}
              options={PORTAL_SEXES}
              meta={SEX_META}
              value={draft.sex}
              onPick={(sex) => set("sex", sex)}
              disabled={submitting}
            />
          </Field>

          <Field
            uid={uid}
            field="breed"
            label={portalText.fieldBreed}
            htmlFor={breedId}
          >
            <Input
              id={breedId}
              value={draft.breed}
              disabled={submitting}
              onChange={(event) => set("breed", event.target.value)}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              uid={uid}
              field="birthDate"
              label={portalText.fieldBirthDate}
              htmlFor={birthDateId}
            >
              <Input
                id={birthDateId}
                type="date"
                value={draft.birthDate}
                disabled={submitting}
                onChange={(event) => set("birthDate", event.target.value)}
              />
            </Field>

            {/* Two inputs, because a shelter knows an age as "two years", not
                as a month count. The unit next to each box labels it; the
                field itself is the group above them. */}
            <Field
              uid={uid}
              field="approximateAgeMonths"
              label={portalText.fieldAgeMonths}
              hint={portalText.ageHint}
              error={ageError ? portalText.invalidError : null}
              errorId={ageErrorId}
            >
              <div
                role="group"
                aria-label={portalText.fieldAgeMonths}
                aria-describedby={hintId(uid, "approximateAgeMonths")}
                className="grid grid-cols-2 gap-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    ref={ageYearsRef}
                    id={ageYearsId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={draft.ageYears}
                    disabled={submitting}
                    aria-invalid={ageError || undefined}
                    aria-errormessage={ageError ? ageErrorId : undefined}
                    aria-describedby={hintId(uid, "approximateAgeMonths")}
                    onChange={(event) => setAge("ageYears", event.target.value)}
                  />
                  <Label
                    htmlFor={ageYearsId}
                    className="shrink-0 text-xs font-normal text-muted-foreground"
                  >
                    {portalText.fieldAgeYearsUnit}
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    ref={ageMonthsRef}
                    id={ageMonthsId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={draft.ageMonths}
                    disabled={submitting}
                    aria-invalid={ageError || undefined}
                    aria-errormessage={ageError ? ageErrorId : undefined}
                    aria-describedby={hintId(uid, "approximateAgeMonths")}
                    onChange={(event) =>
                      setAge("ageMonths", event.target.value)
                    }
                  />
                  <Label
                    htmlFor={ageMonthsId}
                    className="shrink-0 text-xs font-normal text-muted-foreground"
                  >
                    {portalText.fieldAgeMonthsUnit}
                  </Label>
                </div>
              </div>
            </Field>
          </div>

          <Field uid={uid} field="size" label={portalText.fieldSize}>
            <ChoiceGrid
              label={portalText.fieldSize}
              options={PORTAL_SIZES}
              meta={SIZE_META}
              value={draft.size}
              onPick={(size) => set("size", size)}
              disabled={submitting}
            />
          </Field>

          <Field
            uid={uid}
            field="specialNeeds"
            label={portalText.fieldSpecialNeeds}
            hint={portalText.specialNeedsHint}
          >
            <ChoiceGrid
              label={portalText.fieldSpecialNeeds}
              options={PORTAL_SPECIAL_NEEDS_ANSWERS}
              meta={SPECIAL_NEEDS_META}
              value={draft.specialNeeds}
              onPick={(value) => set("specialNeeds", value)}
              disabled={submitting}
              describedBy={hintId(uid, "specialNeeds")}
            />
          </Field>

          <Field
            uid={uid}
            field="shortDescription"
            label={portalText.fieldDescription}
            htmlFor={descriptionId}
            hint={portalText.descriptionHint}
          >
            <Textarea
              id={descriptionId}
              rows={5}
              value={draft.shortDescription}
              disabled={submitting}
              aria-describedby={hintId(uid, "shortDescription")}
              onChange={(event) => set("shortDescription", event.target.value)}
            />
          </Field>

          {errorText && (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-1.5 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {errorText}
            </p>
          )}

          <div className="sticky bottom-0 -mx-5 flex gap-2 border-t bg-popover px-5 pt-3 pb-1">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={requestClose}
            >
              {portalText.cancel}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setArchiving(true)}
                className="text-destructive hover:text-destructive"
              >
                {portalText.listingArchive}
              </Button>
            )}
            <Button
              type="submit"
              disabled={busy || !canSave}
              className="flex-1"
            >
              {submitting && (
                <LoaderCircle className="animate-spin" aria-hidden />
              )}
              {submitting ? portalText.saving : portalText.save}
            </Button>
          </div>
        </form>

        {/* Nested on purpose: it opens over the form, so what the shelter is
            deciding about stays behind it. An alert dialog and not a second
            Dialog: it asks a question with a destructive answer, so it is
            announced as one, it cannot be dismissed by a stray tap outside,
            and Radix opens it focused on the cancel. */}
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent
            className="max-w-sm"
            onOpenAutoFocus={() => {
              confirmReturnFocus.current =
                document.activeElement as HTMLElement | null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              confirmReturnFocus.current?.focus();
              confirmReturnFocus.current = null;
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">
                {portalText.discardTitle}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {portalText.discardLead}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Reversed, so the safe answer is both the rightmost button and
                the one the dialog opens focused on. */}
            <div className="flex flex-row-reverse gap-2">
              <AlertDialogCancel variant="default">
                {portalText.keepEditing}
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={discard}>
                {portalText.discardChanges}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* The shelter's delete. The same shape as the discard confirm, and
            the lead says when the animal leaves the public site, because for
            a manual shelter this form is the only listing there is. */}
        <AlertDialog open={archiving} onOpenChange={setArchiving}>
          <AlertDialogContent
            className="max-w-sm"
            onOpenAutoFocus={() => {
              archiveReturnFocus.current =
                document.activeElement as HTMLElement | null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              archiveReturnFocus.current?.focus();
              archiveReturnFocus.current = null;
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">
                {fill(portalText.listingArchiveTitle, { name })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {portalText.listingArchiveLead}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-row-reverse gap-2">
              <AlertDialogCancel variant="default">
                {portalText.listingArchiveCancel}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void archive()}
              >
                {portalText.listingArchive}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
