"use client";

import { AgeBoxes, BirthDateBox } from "@/components/portal/age-boxes";
import { missingSearchableFields } from "@/components/portal/animal-meta";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { FieldError } from "@/components/portal/notice";
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
  TEXT_LIMITS,
  hintId,
  type ReadBox,
} from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PORTAL_COMPATIBILITIES,
  PORTAL_ENERGIES,
  PORTAL_SEXES,
  PORTAL_SIZES,
  PORTAL_STATUSES,
  type PortalField,
  type PortalListing,
} from "@/lib/portal-api";
import { SPECIES_ORDER } from "@/lib/species";
import type { ReactNode } from "react";
import { FormSection } from "./form-section";
import { Draft, Refused } from "./listing-draft";
import { PhotoPanel, Photos } from "./listing-photos";

/** The rows the form has, for the data-field marks opening at one needs. */
export type ListingField = PortalField | "species" | "photos";

/**
 * The form a new listing opens on: nothing chosen but the status, which the
 * API defaults to "available" and the form says out loud.
 */

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
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {hint && (
        <p id={hintId(uid, field)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
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
  setBirthDate,
  markBox,
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
  /**
   * The boxes the browser reads for us get their own setters, because the
   * page has to know when it could not: `unreadable` is validity.badInput,
   * and a true means the box holds text the value does not carry. Typing in
   * a box also retires its own error, and only its.
   */
  setAge: (
    key: "ageYears" | "ageMonths",
    value: string,
    unreadable: boolean,
  ) => void;
  setBirthDate: (value: string, unreadable: boolean) => void;
  /**
   * The same note, from the input event. onChange only fires when the value
   * changed, and "e" typed into an empty number box takes it from "" to ""
   * with badInput set, as does deleting that "e" again with badInput clear.
   * The input event fires either way, so the mark is kept current from it.
   */
  markBox: (box: ReadBox, unreadable: boolean) => void;
  /** The field the last submit refused. One at a time, so one message. */
  refused: Refused | null;
  /** The rows share the one message id: only one can be refused. */
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

  /** The message a read box points at, which only the refused one has. */
  function errorFor(box: ReadBox): string | null {
    return refused === box ? refusedErrorId : null;
  }

  // Which of the adopter's filters this listing still leaves blank. Read off
  // the saved listing, not the draft, so the row keeps saying what the public
  // site currently knows until the save goes through.
  const missing = new Set<PortalField>(
    listing ? missingSearchableFields(listing).map((field) => field.key) : [],
  );

  const photoSection = (
    <FormSection title={portalText.fieldPhotos}>
      <Photos uid={uid} panel={photos} />
    </FormSection>
  );

  // Every choice row below keeps ChoiceGrid's default, clearable. The crawled
  // editor holds a card on when the answer came off the shelter's site,
  // because the patch would drop the null and show a change it never sends.
  // A listing has no such value under it: the row is the shelter's own, the
  // PUT carries the whole record, and a tapped-off card reaches the wire as
  // the null that means "not stated". Only the status row cannot be emptied,
  // and it says so where it is.
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
          maxLength={TEXT_LIMITS.name}
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
          maxLength={TEXT_LIMITS.breed}
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
          error={refused === "birthDate" ? portalText.birthDateError : null}
          errorId={refusedErrorId}
        >
          <BirthDateBox
            id={birthDateId}
            value={draft.birthDate}
            disabled={disabled}
            errorFor={errorFor}
            setBirthDate={setBirthDate}
            markBox={markBox}
          />
        </Field>

        <Field
          uid={uid}
          field="approximateAgeMonths"
          label={portalText.fieldAgeMonths}
          hint={portalText.ageHint}
          error={
            refused === "ageYears" || refused === "ageMonths"
              ? portalText.invalidError
              : null
          }
          errorId={refusedErrorId}
        >
          <AgeBoxes
            uid={uid}
            yearsId={ageYearsId}
            monthsId={ageMonthsId}
            years={draft.ageYears}
            months={draft.ageMonths}
            disabled={disabled}
            errorFor={errorFor}
            setAge={setAge}
            markBox={markBox}
          />
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
          maxLength={TEXT_LIMITS.shortDescription}
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
export {
  birthDateFault,
  draftFrom,
  inputOf,
  listingInput,
  sameShape,
  sanitizeListingDraft,
  shapeOf,
} from "./listing-draft";
export type { Draft, Refused } from "./listing-draft";
export { ACCEPTED_PHOTO_TYPES } from "./listing-photo-rules";
export type { PendingPhoto } from "./listing-photo-rules";
