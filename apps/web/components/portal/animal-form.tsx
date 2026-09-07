"use client";

import { AgeBoxes, BirthDateBox } from "@/components/portal/age-boxes";
import { missingSearchableFields } from "@/components/portal/animal-meta";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { FieldError } from "@/components/portal/notice";
import {
  MissingMark,
  OverrideMark,
  RevertButton,
} from "@/components/portal/override-mark";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  PORTAL_SPECIAL_NEEDS_ANSWERS,
  SEX_META,
  SIZE_META,
  SPECIAL_NEEDS_META,
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
  type PortalAnimal,
  type PortalField,
} from "@/lib/portal-api";
import type { ReactNode } from "react";
import { ChoiceKey, Draft, draftFrom, isOverridden } from "./animal-draft";
import { FormSection } from "./form-section";

/**
 * The DOM ids of the three boxes the browser reads for us. This form's own,
 * because the listing form draws the same boxes on a page that can hold both.
 */
const BIRTH_DATE_ID = "portal-birth-date";
const AGE_YEARS_ID = "portal-age-years";
const AGE_MONTHS_ID = "portal-age-months";

/** Label row shared by every field: the name, the edit mark, the way back. */
function Field({
  uid,
  field,
  label,
  htmlFor,
  overridden,
  reverting,
  missing = false,
  onRevert,
  disabled,
  hint,
  children,
}: {
  /** The form's id prefix, which the hint's own id is built from. */
  uid: string;
  /** Names the row so an address that opens at one field can find it. */
  field: PortalField;
  label: string;
  /** Set for a single control; left out for the icon rows, which are groups. */
  htmlFor?: string;
  overridden: boolean;
  reverting: boolean;
  /** Searchable and unanswered on the saved animal, not on the draft. */
  missing?: boolean;
  onRevert: () => void;
  disabled: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const heading = (
    <>
      {label}
      {overridden && <OverrideMark pending={reverting} />}
      {missing && <MissingMark />}
    </>
  );

  // The row holds the shelter's own answer as long as they are not giving it
  // back, which is the same condition the way back out is offered under.
  const own = overridden && !reverting;

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
        {own && (
          <RevertButton
            className="max-lg:tap-target"
            field={label}
            onRevert={onRevert}
            disabled={disabled}
          />
        )}
      </div>
      {/* Marked off from the label row so the field can be focused without
          landing on its revert button.
          The padding is for that button's tap-target overlay, which overhangs
          its 24px drawing by 10px per side and would otherwise reach into this
          control and take presses meant for it. space-y-1.5 leaves 6px, and
          padding is what can add to that: the space-y rule outranks a margin
          utility. Same 12px the card keeps. See globals.css. */}
      <div data-field-control className={own ? "max-lg:pt-1.5" : undefined}>
        {children}
      </div>
      {/* Under the control, not in a legend at the top: this is the one place
          the shelter is looking when they wonder what Povrni would do. */}
      {own && (
        <p className="text-xs text-muted-foreground">
          {portalText.fieldOwnLine}
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
 * Every row of the editor, in four named sections. The draft and everything
 * that acts on it belong to the page: this draws the rows and reports what
 * was touched, so the page can hold one draft that survives a status save and
 * a reload.
 *
 * The order is what the animal gets out of the form, not what a record looks
 * like: first the five fields an adopter narrows the public grid by, then the
 * facts, then the age, then the words.
 */
export function AnimalForm({
  uid,
  animal,
  draft,
  set,
  setAge,
  revertAge,
  setBirthDate,
  revertBirthDate,
  markBox,
  reverting,
  saving,
  refused,
  refusedErrorId,
}: {
  /** One prefix per mounted form, for the hints' own ids. */
  uid: string;
  animal: PortalAnimal;
  draft: Draft;
  set: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  /**
   * The boxes the browser reads for us get their own setters, because the
   * page has to know when it could not: `unreadable` is validity.badInput,
   * and a true means the box holds text the value does not carry. Typing in
   * an age box also retires its error.
   */
  setAge: (
    key: "ageYears" | "ageMonths",
    value: string,
    unreadable: boolean,
  ) => void;
  revertAge: () => void;
  setBirthDate: (value: string, unreadable: boolean) => void;
  revertBirthDate: () => void;
  /**
   * The same note, from the input event. onChange only fires when the value
   * changed, and "e" typed into an empty number box takes it from "" to ""
   * with badInput set, as does deleting that "e" again with badInput clear.
   * The input event fires either way, so the mark is kept current from it.
   */
  markBox: (box: ReadBox, unreadable: boolean) => void;
  /** Whether saving would give this field back to the crawler. */
  reverting: (field: PortalField) => boolean;
  saving: boolean;
  /** The box the last submit refused. One at a time, so one message. */
  refused: ReadBox | null;
  /** The rows share the one message id: only one can be refused. */
  refusedErrorId: string;
}) {
  const compatibilityHintId = `${uid}-compatibility-hint`;

  /** The message a read box points at, which only the refused one has. */
  function errorFor(box: ReadBox): string | null {
    return refused === box ? refusedErrorId : null;
  }

  // Which of the adopter's filters this animal still leaves blank. Read off
  // the saved animal, not the draft, so the row keeps saying what the public
  // site currently knows until the save goes through.
  const missing = new Set<PortalField>(
    missingSearchableFields(animal).map((field) => field.key),
  );

  // What the form opened with, for the rows that ask whether a tap on the
  // chosen card may take the answer back.
  const base = draftFrom(animal);

  /**
   * Whether the chosen card of a row may be tapped off.
   *
   * On a row the shelter has overridden, tapping off is the way back: the
   * cleared row reaches the wire as the null that reverts the field. On a row
   * the crawl left empty it is the way out of a mis-tap, with nothing lost.
   * On a row the crawl did answer, tapping off would empty the grid while
   * the patch dropped the null and the saved value stood: a change the page
   * shows and never sends. That row keeps its card; the way back from a
   * mis-tap is the crawled card itself.
   */
  function clearable(field: ChoiceKey): boolean {
    return isOverridden(animal, field) || base[field] === null;
  }

  return (
    <div className="space-y-8">
      <FormSection title={portalText.sectionSearchable}>
        <Field
          uid={uid}
          field="energy"
          label={portalText.fieldEnergy}
          overridden={isOverridden(animal, "energy")}
          reverting={reverting("energy")}
          missing={missing.has("energy")}
          onRevert={() => set("energy", null)}
          disabled={saving}
          hint={portalText.energyHint}
        >
          <ChoiceGrid
            label={portalText.fieldEnergy}
            options={PORTAL_ENERGIES}
            meta={ENERGY_META}
            value={draft.energy}
            onPick={(energy) => set("energy", energy)}
            clearable={clearable("energy")}
            disabled={saving}
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
            overridden={isOverridden(animal, field)}
            reverting={reverting(field)}
            missing={missing.has(field)}
            onRevert={() => set(field, null)}
            disabled={saving}
          >
            <ChoiceGrid
              label={label}
              options={PORTAL_COMPATIBILITIES}
              meta={COMPATIBILITY_META}
              value={draft[field]}
              onPick={(value) => set(field, value)}
              clearable={clearable(field)}
              disabled={saving}
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
          overridden={isOverridden(animal, "apartmentOk")}
          reverting={reverting("apartmentOk")}
          missing={missing.has("apartmentOk")}
          onRevert={() => set("apartmentOk", null)}
          disabled={saving}
        >
          <ChoiceGrid
            label={portalText.fieldApartmentOk}
            options={PORTAL_COMPATIBILITIES}
            meta={COMPATIBILITY_META}
            value={draft.apartmentOk}
            onPick={(value) => set("apartmentOk", value)}
            clearable={clearable("apartmentOk")}
            disabled={saving}
          />
        </Field>
      </FormSection>

      <FormSection title={portalText.sectionBasics}>
        <Field
          uid={uid}
          field="name"
          label={portalText.fieldName}
          htmlFor="portal-name"
          overridden={isOverridden(animal, "name")}
          reverting={reverting("name")}
          onRevert={() => set("name", "")}
          disabled={saving}
          hint={portalText.nameHint}
        >
          <Input
            id="portal-name"
            value={draft.name}
            maxLength={TEXT_LIMITS.name}
            disabled={saving}
            aria-describedby={hintId(uid, "name")}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>

        <Field
          uid={uid}
          field="sex"
          label={portalText.fieldSex}
          overridden={isOverridden(animal, "sex")}
          reverting={reverting("sex")}
          onRevert={() => set("sex", null)}
          disabled={saving}
        >
          <ChoiceGrid
            label={portalText.fieldSex}
            options={PORTAL_SEXES}
            meta={SEX_META}
            value={draft.sex}
            onPick={(sex) => set("sex", sex)}
            clearable={clearable("sex")}
            disabled={saving}
          />
        </Field>

        <Field
          uid={uid}
          field="breed"
          label={portalText.fieldBreed}
          htmlFor="portal-breed"
          overridden={isOverridden(animal, "breed")}
          reverting={reverting("breed")}
          onRevert={() => set("breed", "")}
          disabled={saving}
        >
          <Input
            id="portal-breed"
            value={draft.breed}
            maxLength={TEXT_LIMITS.breed}
            disabled={saving}
            onChange={(event) => set("breed", event.target.value)}
          />
        </Field>

        <Field
          uid={uid}
          field="size"
          label={portalText.fieldSize}
          overridden={isOverridden(animal, "size")}
          reverting={reverting("size")}
          onRevert={() => set("size", null)}
          disabled={saving}
        >
          <ChoiceGrid
            label={portalText.fieldSize}
            options={PORTAL_SIZES}
            meta={SIZE_META}
            value={draft.size}
            onPick={(size) => set("size", size)}
            clearable={clearable("size")}
            disabled={saving}
          />
        </Field>
      </FormSection>

      <FormSection title={portalText.sectionAge}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            uid={uid}
            field="birthDate"
            label={portalText.fieldBirthDate}
            htmlFor={BIRTH_DATE_ID}
            overridden={isOverridden(animal, "birthDate")}
            reverting={reverting("birthDate")}
            onRevert={revertBirthDate}
            disabled={saving}
          >
            <BirthDateBox
              id={BIRTH_DATE_ID}
              value={draft.birthDate}
              disabled={saving}
              errorFor={errorFor}
              setBirthDate={setBirthDate}
              markBox={markBox}
            />
            {refused === "birthDate" && (
              <FieldError id={refusedErrorId} className="mt-1.5">
                {portalText.birthDateError}
              </FieldError>
            )}
          </Field>

          <Field
            uid={uid}
            field="approximateAgeMonths"
            label={portalText.fieldAgeMonths}
            overridden={isOverridden(animal, "approximateAgeMonths")}
            reverting={reverting("approximateAgeMonths")}
            onRevert={revertAge}
            disabled={saving}
            hint={portalText.ageHint}
          >
            <AgeBoxes
              uid={uid}
              yearsId={AGE_YEARS_ID}
              monthsId={AGE_MONTHS_ID}
              years={draft.ageYears}
              months={draft.ageMonths}
              disabled={saving}
              errorFor={errorFor}
              setAge={setAge}
              markBox={markBox}
            />
            {/* The age's message is its own and sits right below the two
                boxes, so the box at fault points at that. The save bar at the
                foot of the page is a screen away. */}
            {(refused === "ageYears" || refused === "ageMonths") && (
              <FieldError id={refusedErrorId} className="mt-1.5">
                {portalText.invalidError}
              </FieldError>
            )}
          </Field>
        </div>
      </FormSection>

      <FormSection title={portalText.sectionDescription}>
        <Field
          uid={uid}
          field="specialNeeds"
          label={portalText.fieldSpecialNeeds}
          overridden={isOverridden(animal, "specialNeeds")}
          reverting={reverting("specialNeeds")}
          onRevert={() => set("specialNeeds", null)}
          disabled={saving}
          hint={portalText.specialNeedsHint}
        >
          <ChoiceGrid
            label={portalText.fieldSpecialNeeds}
            options={PORTAL_SPECIAL_NEEDS_ANSWERS}
            meta={SPECIAL_NEEDS_META}
            value={draft.specialNeeds}
            onPick={(value) => set("specialNeeds", value)}
            clearable={clearable("specialNeeds")}
            disabled={saving}
            describedBy={hintId(uid, "specialNeeds")}
          />
        </Field>

        <Field
          uid={uid}
          field="shortDescription"
          label={portalText.fieldDescription}
          htmlFor="portal-description"
          overridden={isOverridden(animal, "shortDescription")}
          reverting={reverting("shortDescription")}
          onRevert={() => set("shortDescription", "")}
          disabled={saving}
          hint={portalText.descriptionHint}
        >
          <Textarea
            id="portal-description"
            rows={5}
            value={draft.shortDescription}
            maxLength={TEXT_LIMITS.shortDescription}
            disabled={saving}
            aria-describedby={hintId(uid, "shortDescription")}
            onChange={(event) => set("shortDescription", event.target.value)}
          />
        </Field>
      </FormSection>
    </div>
  );
}
export {
  buildPatch,
  draftFrom,
  isOverridden,
  sanitizeDraft,
} from "./animal-draft";
export type { Draft } from "./animal-draft";
export { FormSection } from "./form-section";
