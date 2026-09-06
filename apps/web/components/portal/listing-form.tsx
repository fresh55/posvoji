"use client";

import type { ChangeEvent, ReactNode } from "react";
import {
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { FormSection } from "@/components/portal/animal-form";
import { missingSearchableFields } from "@/components/portal/animal-meta";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { MissingMark } from "@/components/portal/override-mark";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  PORTAL_SPECIAL_NEEDS_ANSWERS,
  SEX_META,
  SIZE_META,
  SPECIAL_NEEDS_META,
  SPECIES_META,
  STATUS_META,
  ageParts,
  choiceCard,
  hintId,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
  isPortalStatus,
  isoDate,
  parseAgeBoxes,
  specialNeedsAnswer,
  specialNeedsValue,
  trimmed,
  type AgeBox,
  type PortalSpecialNeedsAnswer,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
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
  type PortalListingPhoto,
  type PortalSex,
  type PortalSize,
  type PortalSpecies,
  type PortalStatus,
} from "@/lib/portal-api";
import { SPECIES_ORDER } from "@/lib/species";
import { cn } from "@/lib/utils";

/** The rows the form has, for the data-field marks opening at one needs. */
export type ListingField = PortalField | "species" | "photos";

/**
 * What the API takes. One list, because the picker's own check and the file
 * input's accept attribute have to agree: a type the input offers and the
 * check refuses is a file the shelter can pick and then be told off for.
 */
export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type Draft = {
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

/** The two fields a listing cannot exist without. */
type Required = "species" | "name";

/** What a submit can refuse: a required field left empty, or an unusable age. */
export type Refused = Required | "age";

/** A file picked for a listing and not stored yet. */
export type PendingPhoto = {
  key: number;
  file: File;
  /** An object URL of the file, revoked once the file is stored or dropped. */
  previewUrl: string;
  failed: boolean;
};

/** Everything the photo section draws and everything a tap on it reaches. */
type PhotoPanel = {
  /** The photos the API has, in its own order. */
  stored: PortalListingPhoto[];
  pending: PendingPhoto[];
  uploading: { index: number; total: number } | null;
  /** A refused file, or a remove that did not go through. */
  error: string | null;
  errorId: string;
  /** The stored photo whose Odstrani is waiting for its second tap. */
  removing: number | null;
  busy: boolean;
  /**
   * Whether a pending file has somewhere to go yet. A listing that has not
   * been saved has no id for the photo route, so its files wait as previews.
   */
  storable: boolean;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onRetry: (item: PendingPhoto) => void;
  onDrop: (item: PendingPhoto) => void;
  onRemove: (photoId: number) => void;
};

const isPortalSpecies = (value: string | null): value is PortalSpecies =>
  value !== null && (PORTAL_SPECIES as readonly string[]).includes(value);

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

export function draftFrom(listing: PortalListing | null): Draft {
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
export function shapeOf(draft: Draft): { shape: Shape; ageError: AgeBox | null } {
  const { months: approximateAgeMonths, error: ageError } = parseAgeBoxes(
    draft.ageYears,
    draft.ageMonths,
  );

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

/**
 * Both sides come out of the one object literal in shapeOf, so their keys are
 * in the same order and every value is a primitive: comparing the encodings is
 * comparing the shapes.
 */
export function sameShape(left: Shape, right: Shape): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The draft as the API would take it, or the first required field it leaves
 * empty, in the form's order. One answer for both, so what the form refuses
 * and what it would send cannot disagree.
 */
export function inputOf(shape: Shape): {
  input: PortalListingInput | null;
  missing: Required | null;
} {
  if (shape.species === null) return { input: null, missing: "species" };
  if (shape.name === null) return { input: null, missing: "name" };
  return {
    input: { ...shape, species: shape.species, name: shape.name },
    missing: null,
  };
}

/**
 * A saved listing as the PUT body that would leave it unchanged. The status
 * buttons on the card and in the editor's summary send this with one field
 * swapped, because the route is a full replace and a partial body would clear
 * everything it left out.
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
  /** Names the row so an address that opens at one field can find it. */
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
 * The photos, stored and picked alike, in one grid with the picker at its end.
 *
 * Its own section, because it is the one part of the form that talks to the
 * network on its own: on a saved listing a picked file is stored the moment it
 * is picked, and every state of that has to be readable.
 */
function Photos({ uid, panel }: { uid: string; panel: PhotoPanel }) {
  const fileId = `${uid}-file`;

  return (
    <div data-field="photos" className="space-y-1.5">
      <div data-field-control>
        <div
          role="group"
          aria-label={portalText.fieldPhotos}
          aria-describedby={hintId(uid, "photos")}
          className="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
        >
          {panel.stored.map((photo, index) => {
            const confirm = panel.removing === photo.id;
            return (
              <figure key={photo.id} className="space-y-1">
                {/* The API host is not one next/image knows, and the stored
                    copy is already capped at 2048px. */}
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
                  disabled={panel.busy}
                  aria-label={
                    confirm
                      ? undefined
                      : fill(portalText.photoRemoveLabel, {
                          index: index + 1,
                        })
                  }
                  onClick={() => panel.onRemove(photo.id)}
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

          {panel.pending.map((item) => (
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
                      disabled={panel.busy || !panel.storable}
                      onClick={() => panel.onRetry(item)}
                      className="flex-1"
                    >
                      <RefreshCw aria-hidden />
                      {portalText.photoRetry}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={panel.busy}
                      onClick={() => panel.onDrop(item)}
                      className="font-normal text-muted-foreground hover:text-foreground"
                    >
                      {portalText.photoRemove}
                    </Button>
                  </div>
                </div>
              ) : panel.storable ? (
                <p className="text-center text-2xs text-muted-foreground">
                  {portalText.photoPending}
                </p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={panel.busy}
                  onClick={() => panel.onDrop(item)}
                  className="w-full font-normal text-muted-foreground hover:text-foreground"
                >
                  {portalText.photoRemove}
                </Button>
              )}
            </figure>
          ))}

          {/* The picker is an icon card like every other choice in the form.
              The input itself is what takes the focus, so the card draws the
              ring for it. */}
          <label
            htmlFor={fileId}
            className={choiceCard(
              false,
              cn(
                "aspect-square cursor-pointer flex-col gap-1 self-start px-1.5 py-1.5 text-center text-xs leading-tight font-medium focus-within:border-ring focus-within:ring-3 focus-within:ring-ring",
                panel.busy && "pointer-events-none opacity-50",
              ),
            )}
          >
            <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
            <span>{portalText.photoAdd}</span>
            <input
              id={fileId}
              type="file"
              accept={ACCEPTED_PHOTO_TYPES.join(",")}
              multiple
              disabled={panel.busy}
              aria-describedby={hintId(uid, "photos")}
              onChange={panel.onPick}
              className="sr-only"
            />
          </label>
        </div>
        {panel.uploading && (
          <p
            aria-live="polite"
            className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {fill(portalText.photoUploading, panel.uploading)}
          </p>
        )}
      </div>
      {panel.error && (
        <p
          id={panel.errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {panel.error}
        </p>
      )}
      <p id={hintId(uid, "photos")} className="text-xs text-muted-foreground">
        {portalText.photosHint} {portalText.photoLimits}
      </p>
    </div>
  );
}

/**
 * Every row of a manual listing, in named sections. The draft and everything
 * that acts on it belong to the page: this draws the rows and reports what was
 * touched, exactly as AnimalForm does for a crawled animal.
 *
 * The order differs between the two things this form is. A listing that
 * exists is edited photos first, then the fields an adopter narrows the grid
 * by, as the crawled page reads. A listing that does not exist yet cannot be
 * saved without a species and a name, so those come first and the photos wait
 * behind them, which is the order the dialog this replaced asked in.
 */
export function ListingForm({
  uid,
  listing,
  draft,
  set,
  setAge,
  refused,
  refusedErrorId,
  disabled,
  photos,
}: {
  /** One prefix per mounted form, for the hints' own ids. */
  uid: string;
  /** Null while the listing is being written for the first time. */
  listing: PortalListing | null;
  draft: Draft;
  set: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  /** Its own setter, because typing in an age box also retires its error. */
  setAge: (key: "ageYears" | "ageMonths", value: string) => void;
  /** The field the last submit refused. One at a time, so one message. */
  refused: Refused | null;
  /** The three rows share the one message id: only one can be refused. */
  refusedErrorId: string;
  disabled: boolean;
  photos: PhotoPanel;
}) {
  const nameId = `${uid}-name`;
  const breedId = `${uid}-breed`;
  const birthDateId = `${uid}-birth-date`;
  const ageYearsId = `${uid}-age-years`;
  const ageMonthsId = `${uid}-age-months`;
  const descriptionId = `${uid}-description`;
  const compatibilityHintId = `${uid}-compatibility-hint`;

  // Which of the adopter's filters this listing still leaves blank. Read off
  // the saved listing, not the draft, so the row keeps saying what the public
  // site currently knows until the save goes through.
  const missing = new Set<PortalField>(
    listing
      ? missingSearchableFields(listing).map((field) => field.key)
      : [],
  );

  const photoSection = (
    <FormSection title={portalText.fieldPhotos}>
      <Photos uid={uid} panel={photos} />
    </FormSection>
  );

  const searchableSection = (
    <FormSection title={portalText.sectionSearchable}>
      <Field
        uid={uid}
        field="energy"
        label={portalText.fieldEnergy}
        missing={missing.has("energy")}
        hint={portalText.listingEnergyHint}
      >
        <ChoiceGrid
          label={portalText.fieldEnergy}
          options={PORTAL_ENERGIES}
          meta={ENERGY_META}
          value={draft.energy}
          onPick={(energy) => set("energy", energy)}
          disabled={disabled}
          describedBy={hintId(uid, "energy")}
        />
      </Field>

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
          missing={missing.has(field)}
        >
          <ChoiceGrid
            label={label}
            options={PORTAL_COMPATIBILITIES}
            meta={COMPATIBILITY_META}
            value={draft[field]}
            onPick={(value) => set(field, value)}
            disabled={disabled}
            describedBy={compatibilityHintId}
          />
        </Field>
      ))}
      {/* One line for the three rows above, so all three point at it. */}
      <p id={compatibilityHintId} className="text-xs text-muted-foreground">
        {portalText.compatibilityHint}
      </p>

      <Field
        uid={uid}
        field="apartmentOk"
        label={portalText.fieldApartmentOk}
        missing={missing.has("apartmentOk")}
      >
        <ChoiceGrid
          label={portalText.fieldApartmentOk}
          options={PORTAL_COMPATIBILITIES}
          meta={COMPATIBILITY_META}
          value={draft.apartmentOk}
          onPick={(value) => set("apartmentOk", value)}
          disabled={disabled}
        />
      </Field>
    </FormSection>
  );

  const basicsSection = (
    <FormSection title={portalText.sectionBasics}>
      <Field
        uid={uid}
        field="species"
        label={portalText.fieldSpecies}
        error={refused === "species" ? portalText.speciesRequired : null}
        errorId={refusedErrorId}
      >
        <ChoiceGrid
          label={portalText.fieldSpecies}
          options={SPECIES_ORDER}
          meta={SPECIES_META}
          value={draft.species}
          onPick={(species) => set("species", species)}
          disabled={disabled}
          describedBy={refused === "species" ? refusedErrorId : undefined}
        />
      </Field>

      <Field
        uid={uid}
        field="name"
        label={portalText.fieldName}
        htmlFor={nameId}
        hint={portalText.nameHint}
        error={refused === "name" ? portalText.nameRequired : null}
        errorId={refusedErrorId}
      >
        <Input
          id={nameId}
          value={draft.name}
          disabled={disabled}
          aria-invalid={refused === "name" || undefined}
          aria-errormessage={refused === "name" ? refusedErrorId : undefined}
          aria-describedby={hintId(uid, "name")}
          onChange={(event) => set("name", event.target.value)}
        />
      </Field>

      {/* Only while the listing is being written. Once it exists the status is
          the summary's, beside the form, where it saves on the tap. */}
      {!listing && (
        <Field uid={uid} field="status" label={portalText.statusLegend}>
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
            disabled={disabled}
          />
        </Field>
      )}

      <Field uid={uid} field="sex" label={portalText.fieldSex}>
        <ChoiceGrid
          label={portalText.fieldSex}
          options={PORTAL_SEXES}
          meta={SEX_META}
          value={draft.sex}
          onPick={(sex) => set("sex", sex)}
          disabled={disabled}
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
          disabled={disabled}
          onChange={(event) => set("breed", event.target.value)}
        />
      </Field>

      <Field uid={uid} field="size" label={portalText.fieldSize}>
        <ChoiceGrid
          label={portalText.fieldSize}
          options={PORTAL_SIZES}
          meta={SIZE_META}
          value={draft.size}
          onPick={(size) => set("size", size)}
          disabled={disabled}
        />
      </Field>
    </FormSection>
  );

  const ageSection = (
    <FormSection title={portalText.sectionAge}>
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
            disabled={disabled}
            onChange={(event) => set("birthDate", event.target.value)}
          />
        </Field>

        {/* Two inputs, because a shelter knows an age as "two years", not as a
            month count. The unit next to each box labels it; the field itself
            is the group above them. */}
        <Field
          uid={uid}
          field="approximateAgeMonths"
          label={portalText.fieldAgeMonths}
          hint={portalText.ageHint}
          error={refused === "age" ? portalText.invalidError : null}
          errorId={refusedErrorId}
        >
          <div
            role="group"
            aria-label={portalText.fieldAgeMonths}
            aria-describedby={hintId(uid, "approximateAgeMonths")}
            className="grid grid-cols-2 gap-1.5"
          >
            <div className="flex items-center gap-1.5">
              <Input
                id={ageYearsId}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={draft.ageYears}
                disabled={disabled}
                aria-invalid={refused === "age" || undefined}
                aria-errormessage={
                  refused === "age" ? refusedErrorId : undefined
                }
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
                id={ageMonthsId}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={draft.ageMonths}
                disabled={disabled}
                aria-invalid={refused === "age" || undefined}
                aria-errormessage={
                  refused === "age" ? refusedErrorId : undefined
                }
                aria-describedby={hintId(uid, "approximateAgeMonths")}
                onChange={(event) => setAge("ageMonths", event.target.value)}
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
    </FormSection>
  );

  const descriptionSection = (
    <FormSection title={portalText.sectionDescription}>
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
          disabled={disabled}
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
          disabled={disabled}
          aria-describedby={hintId(uid, "shortDescription")}
          onChange={(event) => set("shortDescription", event.target.value)}
        />
      </Field>
    </FormSection>
  );

  return (
    <div className="space-y-8">
      {listing ? (
        <>
          {photoSection}
          {searchableSection}
          {basicsSection}
        </>
      ) : (
        <>
          {basicsSection}
          {photoSection}
          {searchableSection}
        </>
      )}
      {ageSection}
      {descriptionSection}
    </div>
  );
}
