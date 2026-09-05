"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import {
  MissingMark,
  OverrideMark,
  RevertButton,
} from "@/components/portal/override-mark";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  PORTAL_SPECIAL_NEEDS_ANSWERS,
  SEARCHABLE_FIELDS,
  SEX_META,
  SIZE_META,
  SPECIAL_NEEDS_META,
  ageParts,
  hintId,
  isCount,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
  isoDate,
  specialNeedsAnswer,
  specialNeedsValue,
  trimmed,
  type AgeBox,
  type PortalSpecialNeedsAnswer,
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
  type PortalAnimalPatch,
  type PortalCompatibility,
  type PortalEnergy,
  type PortalField,
  type PortalSex,
  type PortalSize,
} from "@/lib/portal-api";

export type Draft = {
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

export function draftFrom(animal: PortalAnimal): Draft {
  const age = ageParts(animal.approximateAgeMonths ?? null);
  return {
    name: animal.name ?? "",
    breed: animal.breed ?? "",
    birthDate: isoDate(animal.birthDate) ?? "",
    ageYears: age.years,
    ageMonths: age.months,
    shortDescription: animal.shortDescription ?? "",
    sex: isPortalSex(animal.sex) ? animal.sex : null,
    size: isPortalSize(animal.size) ? animal.size : null,
    energy: isPortalEnergy(animal.energy) ? animal.energy : null,
    goodWithKids: isPortalCompatibility(animal.goodWithKids)
      ? animal.goodWithKids
      : null,
    goodWithDogs: isPortalCompatibility(animal.goodWithDogs)
      ? animal.goodWithDogs
      : null,
    goodWithCats: isPortalCompatibility(animal.goodWithCats)
      ? animal.goodWithCats
      : null,
    apartmentOk: isPortalCompatibility(animal.apartmentOk)
      ? animal.apartmentOk
      : null,
    specialNeeds: specialNeedsAnswer(animal.specialNeeds),
  };
}

export function isOverridden(
  animal: PortalAnimal,
  field: PortalField,
): boolean {
  return Object.prototype.hasOwnProperty.call(animal.overrides, field);
}

/**
 * Only what actually changed goes into the body. A null is sent solely to
 * clear an override the shelter already has, never to "unset" crawled data,
 * which the API cannot do anyway.
 */
export function buildPatch(
  draft: Draft,
  animal: PortalAnimal,
): { patch: PortalAnimalPatch; ageError: AgeBox | null } {
  const patch: PortalAnimalPatch = {};

  function put<Key extends keyof PortalAnimalPatch>(
    key: Key,
    next: PortalAnimalPatch[Key],
    current: PortalAnimalPatch[Key],
  ): void {
    if (next === current) return;
    if (next === null && !isOverridden(animal, key)) return;
    patch[key] = next;
  }

  put("name", trimmed(draft.name), animal.name ?? null);
  put("breed", trimmed(draft.breed), animal.breed ?? null);
  put(
    "shortDescription",
    trimmed(draft.shortDescription),
    animal.shortDescription ?? null,
  );
  put("birthDate", trimmed(draft.birthDate), isoDate(animal.birthDate));
  put("sex", draft.sex, isPortalSex(animal.sex) ? animal.sex : null);
  put("size", draft.size, isPortalSize(animal.size) ? animal.size : null);
  put(
    "energy",
    draft.energy,
    isPortalEnergy(animal.energy) ? animal.energy : null,
  );
  put(
    "goodWithKids",
    draft.goodWithKids,
    isPortalCompatibility(animal.goodWithKids) ? animal.goodWithKids : null,
  );
  put(
    "goodWithDogs",
    draft.goodWithDogs,
    isPortalCompatibility(animal.goodWithDogs) ? animal.goodWithDogs : null,
  );
  put(
    "goodWithCats",
    draft.goodWithCats,
    isPortalCompatibility(animal.goodWithCats) ? animal.goodWithCats : null,
  );
  put(
    "apartmentOk",
    draft.apartmentOk,
    isPortalCompatibility(animal.apartmentOk) ? animal.apartmentOk : null,
  );
  put(
    "specialNeeds",
    specialNeedsValue(draft.specialNeeds),
    animal.specialNeeds,
  );

  // The wire still carries one month count. An empty half counts as zero, so
  // "2 let" alone is two years; only two empty boxes clear the override. The
  // months box is not capped at eleven: "18 mesecev" adds up to the same age.
  const rawYears = draft.ageYears.trim();
  const rawMonths = draft.ageMonths.trim();
  let ageError: AgeBox | null = null;
  if (rawYears === "" && rawMonths === "") {
    put("approximateAgeMonths", null, animal.approximateAgeMonths ?? null);
  } else {
    const years = rawYears === "" ? 0 : Number(rawYears);
    const months = rawMonths === "" ? 0 : Number(rawMonths);
    if (!isCount(years)) {
      ageError = "years";
    } else if (!isCount(months)) {
      ageError = "months";
    } else {
      put(
        "approximateAgeMonths",
        years * 12 + months,
        animal.approximateAgeMonths ?? null,
      );
    }
  }

  return { patch, ageError };
}

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

/** One titled block of rows. Four of them make the form. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="border-b pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
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
  reverting,
  saving,
  ageError,
  ageErrorId,
}: {
  /** One prefix per mounted form, for the hints' own ids. */
  uid: string;
  animal: PortalAnimal;
  draft: Draft;
  set: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  /** Its own setter, because typing in an age box also retires its error. */
  setAge: (key: "ageYears" | "ageMonths", value: string) => void;
  revertAge: () => void;
  /** Whether saving would give this field back to the crawler. */
  reverting: (field: PortalField) => boolean;
  saving: boolean;
  ageError: boolean;
  ageErrorId: string;
}) {
  const compatibilityHintId = `${uid}-compatibility-hint`;

  // Which of the adopter's filters this animal still leaves blank. Read off
  // the saved animal, not the draft, so the row keeps saying what the public
  // site currently knows until the save goes through.
  const missing = new Set<PortalField>(
    SEARCHABLE_FIELDS.filter((field) => animal[field.key] === null).map(
      (field) => field.key,
    ),
  );

  return (
    <div className="space-y-8">
      <Section title={portalText.sectionSearchable}>
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
            disabled={saving}
          />
        </Field>
      </Section>

      <Section title={portalText.sectionBasics}>
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
            disabled={saving}
          />
        </Field>
      </Section>

      <Section title={portalText.sectionAge}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            uid={uid}
            field="birthDate"
            label={portalText.fieldBirthDate}
            htmlFor="portal-birth-date"
            overridden={isOverridden(animal, "birthDate")}
            reverting={reverting("birthDate")}
            onRevert={() => set("birthDate", "")}
            disabled={saving}
          >
            <Input
              id="portal-birth-date"
              type="date"
              value={draft.birthDate}
              disabled={saving}
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
            overridden={isOverridden(animal, "approximateAgeMonths")}
            reverting={reverting("approximateAgeMonths")}
            onRevert={revertAge}
            disabled={saving}
            hint={portalText.ageHint}
          >
            <div
              role="group"
              aria-label={portalText.fieldAgeMonths}
              aria-describedby={hintId(uid, "approximateAgeMonths")}
              className="grid grid-cols-2 gap-1.5"
            >
              <div className="flex items-center gap-1.5">
                {/* The age's message is its own and sits right below these
                    two boxes, so the box at fault points at that. The save
                    bar at the foot of the page is a screen away. */}
                <Input
                  id="portal-age-years"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={draft.ageYears}
                  disabled={saving}
                  aria-invalid={ageError || undefined}
                  aria-errormessage={ageError ? ageErrorId : undefined}
                  aria-describedby={hintId(uid, "approximateAgeMonths")}
                  onChange={(event) => setAge("ageYears", event.target.value)}
                />
                <Label
                  htmlFor="portal-age-years"
                  className="shrink-0 text-xs font-normal text-muted-foreground"
                >
                  {portalText.fieldAgeYearsUnit}
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  id="portal-age-months"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={draft.ageMonths}
                  disabled={saving}
                  aria-invalid={ageError || undefined}
                  aria-errormessage={ageError ? ageErrorId : undefined}
                  aria-describedby={hintId(uid, "approximateAgeMonths")}
                  onChange={(event) => setAge("ageMonths", event.target.value)}
                />
                <Label
                  htmlFor="portal-age-months"
                  className="shrink-0 text-xs font-normal text-muted-foreground"
                >
                  {portalText.fieldAgeMonthsUnit}
                </Label>
              </div>
            </div>
            {ageError && (
              <p
                id={ageErrorId}
                role="alert"
                className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive"
              >
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden
                />
                {portalText.invalidError}
              </p>
            )}
          </Field>
        </div>
      </Section>

      <Section title={portalText.sectionDescription}>
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
            disabled={saving}
            aria-describedby={hintId(uid, "shortDescription")}
            onChange={(event) => set("shortDescription", event.target.value)}
          />
        </Field>
      </Section>
    </div>
  );
}
