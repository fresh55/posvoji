"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { OverrideMark, RevertButton } from "@/components/portal/override-mark";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  PORTAL_SPECIAL_NEEDS_ANSWERS,
  SEARCHABLE_FIELDS,
  SEX_META,
  SIZE_META,
  SPECIAL_NEEDS_META,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
  specialNeedsAnswer,
  specialNeedsValue,
  type PortalSpecialNeedsAnswer,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalSaveState } from "@/hooks/use-portal-animals";
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
  type PortalAnimal,
  type PortalAnimalPatch,
  type PortalCompatibility,
  type PortalEnergy,
  type PortalField,
  type PortalSex,
  type PortalSize,
} from "@/lib/portal-api";

type Draft = {
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
 * and the months box is the only place left to show it: two empty boxes are
 * what reverting the field looks like.
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

function draftFrom(animal: PortalAnimal): Draft {
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

function isOverridden(animal: PortalAnimal, field: PortalField): boolean {
  return Object.prototype.hasOwnProperty.call(animal.overrides, field);
}

/**
 * Only what actually changed goes into the body. A null is sent solely to
 * clear an override the shelter already has, never to "unset" crawled data,
 * which the API cannot do anyway.
 */
function buildPatch(
  draft: Draft,
  animal: PortalAnimal,
): { patch: PortalAnimalPatch; ageError: boolean } {
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
  // "2 let" alone is two years; only two empty boxes clear the override.
  // The months box is not capped at eleven: "18 mesecev" is how a shelter
  // states a young dog's age, and it adds up to the same number.
  const rawYears = draft.ageYears.trim();
  const rawMonths = draft.ageMonths.trim();
  let ageError = false;
  if (rawYears === "" && rawMonths === "") {
    put("approximateAgeMonths", null, animal.approximateAgeMonths ?? null);
  } else {
    const years = rawYears === "" ? 0 : Number(rawYears);
    const months = rawMonths === "" ? 0 : Number(rawMonths);
    if (!isCount(years) || !isCount(months)) {
      ageError = true;
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

/**
 * A filter the adopter searches by that this animal still has no answer for.
 * It sits where OverrideMark sits and is built to the same scale, but says the
 * opposite thing: not "you changed this", "nobody has answered this yet".
 */
function MissingMark() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-4xl border border-amber-500/40 px-1.5 text-2xs font-medium text-amber-700 dark:text-amber-300">
      <Search className="size-2.5" aria-hidden />
      {portalText.missingBadge}
    </span>
  );
}

/** Label row shared by every field: the name, the edit mark, the way back. */
function Field({
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
  /** Names the row so opening the dialog at one field can find it. */
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
        {overridden && !reverting && (
          <RevertButton field={label} onRevert={onRevert} disabled={disabled} />
        )}
      </div>
      {/* Marked off from the label row so the field can be focused without
          landing on its revert button. */}
      <div data-field-control>{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AnimalEditor({
  animal,
  open,
  onOpenChange,
  saveState,
  onSave,
  initialField = null,
}: {
  animal: PortalAnimal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
  /** The field to open at, when the card sent the shelter to a named one. */
  initialField?: PortalField | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(animal));
  const [ageError, setAgeError] = useState(false);
  const [source, setSource] = useState({ animal, open });
  const formRef = useRef<HTMLFormElement>(null);

  // The dialog opens on whatever the server last confirmed, so a cancelled
  // edit leaves nothing behind. Adjusted during render rather than in an
  // effect: there is no external system to synchronise with, only a prop the
  // draft is derived from.
  if (source.animal !== animal || source.open !== open) {
    setSource({ animal, open });
    if (open) {
      setDraft(draftFrom(animal));
      setAgeError(false);
    }
  }

  // Opening at a field: the shelter came from the card's "manjka" line, so the
  // row it named has to be what the dialog shows first, not the top of a form
  // they then have to read through. One frame after the open, which is where
  // the dialog has finished mounting and taken its own initial focus.
  useEffect(() => {
    if (!open || !initialField) return;
    const frame = requestAnimationFrame(() => {
      const form = formRef.current;
      // The dialog panel is the form's parent and the element that scrolls.
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

  const saving = saveState.status === "saving";
  // The same patch the submit will send: what the form would change, and
  // whether the typed age is a number at all.
  const { patch, ageError: ageInvalid } = buildPatch(draft, animal);
  const dirty = Object.keys(patch).length > 0;
  const name = animal.name ?? portalText.unnamed;
  const errorText = ageError
    ? portalText.invalidError
    : saveState.status === "error"
      ? saveState.message
      : null;

  // Which of the adopter's filters this animal still leaves blank. Read off
  // the saved animal, not the draft, so the row keeps saying what the public
  // site currently knows until the save goes through.
  const missing = new Set<PortalField>(
    SEARCHABLE_FIELDS.filter((field) => animal[field.key] === null).map(
      (field) => field.key,
    ),
  );

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setAgeError(false);
  }

  /** Empty is what "give it back to the crawler" looks like in the form. */
  function reverting(field: PortalField, value: string | null): boolean {
    return isOverridden(animal, field) && (value === null || value === "");
  }

  /** The age is one field over two inputs, so reverting it empties both. */
  const ageReverting =
    isOverridden(animal, "approximateAgeMonths") &&
    draft.ageYears.trim() === "" &&
    draft.ageMonths.trim() === "";

  function revertAge() {
    setDraft((current) => ({ ...current, ageYears: "", ageMonths: "" }));
    setAgeError(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ageInvalid) {
      setAgeError(true);
      return;
    }
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    if (await onSave(patch)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Zapri" className="gap-0">
        <DialogHeader>
          <DialogTitle className="text-base">
            {fill(portalText.editTitle, { name })}
          </DialogTitle>
          <DialogDescription>{portalText.editLead}</DialogDescription>
        </DialogHeader>

        {/* The order is what the animal gets out of the form, not what a
            record looks like: the name, then the five fields an adopter
            narrows the public grid by, then the descriptive rest. */}
        <form
          ref={formRef}
          onSubmit={submit}
          className="mt-5 space-y-5"
          noValidate
        >
          <Field
            field="name"
            label={portalText.fieldName}
            htmlFor="portal-name"
            overridden={isOverridden(animal, "name")}
            reverting={reverting("name", draft.name)}
            onRevert={() => set("name", "")}
            disabled={saving}
            hint={portalText.nameHint}
          >
            <Input
              id="portal-name"
              value={draft.name}
              disabled={saving}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>

          <Field
            field="energy"
            label={portalText.fieldEnergy}
            overridden={isOverridden(animal, "energy")}
            reverting={reverting("energy", draft.energy)}
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
                field={field}
                label={label}
                overridden={isOverridden(animal, field)}
                reverting={reverting(field, draft[field])}
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
                />
              </Field>
            ))}
            <p className="text-xs text-muted-foreground">
              {portalText.compatibilityHint}
            </p>
          </div>

          <Field
            field="apartmentOk"
            label={portalText.fieldApartmentOk}
            overridden={isOverridden(animal, "apartmentOk")}
            reverting={reverting("apartmentOk", draft.apartmentOk)}
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

          <Field
            field="sex"
            label={portalText.fieldSex}
            overridden={isOverridden(animal, "sex")}
            reverting={reverting("sex", draft.sex)}
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
            field="breed"
            label={portalText.fieldBreed}
            htmlFor="portal-breed"
            overridden={isOverridden(animal, "breed")}
            reverting={reverting("breed", draft.breed)}
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              field="birthDate"
              label={portalText.fieldBirthDate}
              htmlFor="portal-birth-date"
              overridden={isOverridden(animal, "birthDate")}
              reverting={reverting("birthDate", draft.birthDate)}
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
                as a month count. The unit sits next to each box and labels
                it; the field itself is the group above them. */}
            <Field
              field="approximateAgeMonths"
              label={portalText.fieldAgeMonths}
              overridden={isOverridden(animal, "approximateAgeMonths")}
              reverting={ageReverting}
              onRevert={revertAge}
              disabled={saving}
              hint={portalText.ageHint}
            >
              <div
                role="group"
                aria-label={portalText.fieldAgeMonths}
                className="grid grid-cols-2 gap-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    id="portal-age-years"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={draft.ageYears}
                    disabled={saving}
                    aria-invalid={ageError || undefined}
                    onChange={(event) => set("ageYears", event.target.value)}
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
                    onChange={(event) => set("ageMonths", event.target.value)}
                  />
                  <Label
                    htmlFor="portal-age-months"
                    className="shrink-0 text-xs font-normal text-muted-foreground"
                  >
                    {portalText.fieldAgeMonthsUnit}
                  </Label>
                </div>
              </div>
            </Field>
          </div>

          <Field
            field="size"
            label={portalText.fieldSize}
            overridden={isOverridden(animal, "size")}
            reverting={reverting("size", draft.size)}
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

          <Field
            field="specialNeeds"
            label={portalText.fieldSpecialNeeds}
            overridden={isOverridden(animal, "specialNeeds")}
            reverting={reverting("specialNeeds", draft.specialNeeds)}
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
            />
          </Field>

          <Field
            field="shortDescription"
            label={portalText.fieldDescription}
            htmlFor="portal-description"
            overridden={isOverridden(animal, "shortDescription")}
            reverting={reverting("shortDescription", draft.shortDescription)}
            onRevert={() => set("shortDescription", "")}
            disabled={saving}
            hint={portalText.descriptionHint}
          >
            <Textarea
              id="portal-description"
              rows={5}
              value={draft.shortDescription}
              disabled={saving}
              onChange={(event) => set("shortDescription", event.target.value)}
            />
          </Field>

          {errorText && (
            <p
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
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {portalText.cancel}
            </Button>
            {/* An unusable age is not a change, so the patch stays empty and
                the form is not dirty. The button still has to run, or the
                submit that reports the bad age can never happen. */}
            <Button
              type="submit"
              disabled={saving || (!dirty && !ageInvalid)}
              className="flex-1"
            >
              {saving && <LoaderCircle className="animate-spin" aria-hidden />}
              {saving ? portalText.saving : portalText.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
