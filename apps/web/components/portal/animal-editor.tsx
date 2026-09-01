"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

/** Which of the two age inputs holds something that is not a count. */
type AgeBox = "years" | "months";

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

/** The hint a field renders, named so its control can point aria at it. */
function hintId(uid: string, field: PortalField): string {
  return `${uid}-${field}-hint`;
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
  /** The editor's id prefix, which the hint's own id is built from. */
  uid: string;
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
      {hint && (
        <p id={hintId(uid, field)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
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
  const [confirming, setConfirming] = useState(false);
  // A save that failed on the card keeps its message until the next attempt,
  // which is what the card needs: the shelter has to be able to look away and
  // still find out that the tap did not take. Opening this dialog is not that
  // attempt, though, so the failure the dialog opens on is remembered here and
  // stays out of the form. Every later save produces a new state object, so
  // identity is enough to tell the two apart.
  const [openedOn, setOpenedOn] = useState<PortalSaveState | null>(() =>
    open && saveState.status === "error" ? saveState : null,
  );
  const [source, setSource] = useState({ animal, open });
  const formRef = useRef<HTMLFormElement>(null);

  // One prefix per mounted editor, so a hint and the error summary can be
  // named by the controls they belong to without colliding across dialogs.
  const uid = useId();
  const compatibilityHintId = `${uid}-compatibility-hint`;
  const errorId = `${uid}-error`;

  // The dialog opens on whatever the server last confirmed, so a cancelled
  // edit leaves nothing behind. Adjusted during render rather than in an
  // effect: there is no external system to synchronise with, only a prop the
  // draft is derived from.
  if (source.animal !== animal || source.open !== open) {
    setSource({ animal, open });
    if (open) {
      setDraft(draftFrom(animal));
      setAgeError(false);
      setConfirming(false);
      setOpenedOn(saveState.status === "error" ? saveState : null);
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
  // which age box, if either, holds something that is not a count.
  const { patch, ageError: badAgeBox } = buildPatch(draft, animal);
  const dirty = Object.keys(patch).length > 0;
  // An unusable age produces no patch, but it is still work the shelter typed
  // and the dialog must not throw it away silently.
  const unsaved = dirty || badAgeBox !== null;
  const name = animal.name ?? portalText.unnamed;
  const errorText = ageError
    ? portalText.invalidError
    : saveState.status === "error" && saveState !== openedOn
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
  function reverting(field: PortalField): boolean {
    return patch[field] === null;
  }

  function revertAge() {
    setDraft((current) => ({ ...current, ageYears: "", ageMonths: "" }));
    setAgeError(false);
  }

  /**
   * Every way out but a finished save: the close button, Esc, a pointer
   * outside, and Prekliči. Typed work is confirmed away, never dropped.
   */
  function requestClose() {
    if (unsaved) {
      setConfirming(true);
      return;
    }
    onOpenChange(false);
  }

  function discard() {
    setConfirming(false);
    onOpenChange(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (badAgeBox) {
      setAgeError(true);
      // A submit from the sticky footer leaves the reason off screen, so the
      // box that cannot be read takes the focus with it.
      const box = formRef.current?.querySelector<HTMLElement>(
        badAgeBox === "years" ? "#portal-age-years" : "#portal-age-months",
      );
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
      return;
    }
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    if (await onSave(patch)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
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
                  {/* The summary below the form is the age's error message
                      too, so the box at fault points at it. */}
                  <Input
                    id="portal-age-years"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={draft.ageYears}
                    disabled={saving}
                    aria-invalid={ageError || undefined}
                    aria-errormessage={ageError ? errorId : undefined}
                    aria-describedby={hintId(uid, "approximateAgeMonths")}
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
                    aria-errormessage={ageError ? errorId : undefined}
                    aria-describedby={hintId(uid, "approximateAgeMonths")}
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
              disabled={saving}
              onClick={requestClose}
            >
              {portalText.cancel}
            </Button>
            <Button
              type="submit"
              disabled={saving || !unsaved}
              className="flex-1"
            >
              {saving && <LoaderCircle className="animate-spin" aria-hidden />}
              {saving ? portalText.saving : portalText.save}
            </Button>
          </div>
        </form>

        {/* Nested on purpose: it opens over the editor, so the form the
            shelter is deciding about stays behind it. */}
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent showCloseButton={false} className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">
                {portalText.discardTitle}
              </DialogTitle>
              <DialogDescription>{portalText.discardLead}</DialogDescription>
            </DialogHeader>
            {/* Reversed, so the safe answer is both the rightmost button and
                the one the dialog opens focused on. */}
            <div className="flex flex-row-reverse gap-2">
              <Button type="button" onClick={() => setConfirming(false)}>
                {portalText.keepEditing}
              </Button>
              <Button type="button" variant="destructive" onClick={discard}>
                {portalText.discardChanges}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
