"use client";

import { useState, type ReactNode } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { OverrideMark, RevertButton } from "@/components/portal/override-mark";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  SEX_META,
  SIZE_META,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
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
  approximateAgeMonths: string;
  shortDescription: string;
  sex: PortalSex | null;
  size: PortalSize | null;
  energy: PortalEnergy | null;
  goodWithKids: PortalCompatibility | null;
  goodWithDogs: PortalCompatibility | null;
  goodWithCats: PortalCompatibility | null;
};

/** <input type="date"> only understands YYYY-MM-DD, so both sides get cut to it. */
function isoDate(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function trimmed(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

function draftFrom(animal: PortalAnimal): Draft {
  return {
    name: animal.name ?? "",
    breed: animal.breed ?? "",
    birthDate: isoDate(animal.birthDate) ?? "",
    approximateAgeMonths:
      animal.approximateAgeMonths === null
        ? ""
        : String(animal.approximateAgeMonths),
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

  const rawAge = draft.approximateAgeMonths.trim();
  let ageError = false;
  if (rawAge === "") {
    put("approximateAgeMonths", null, animal.approximateAgeMonths ?? null);
  } else {
    const months = Number(rawAge);
    if (!Number.isInteger(months) || months < 0) {
      ageError = true;
    } else {
      put("approximateAgeMonths", months, animal.approximateAgeMonths ?? null);
    }
  }

  return { patch, ageError };
}

/** Label row shared by every field: the name, the edit mark, the way back. */
function Field({
  label,
  htmlFor,
  overridden,
  reverting,
  onRevert,
  disabled,
  hint,
  children,
}: {
  label: string;
  /** Set for a single control; left out for the icon rows, which are groups. */
  htmlFor?: string;
  overridden: boolean;
  reverting: boolean;
  onRevert: () => void;
  disabled: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const heading = (
    <>
      {label}
      {overridden && <OverrideMark pending={reverting} />}
    </>
  );

  return (
    <div className="space-y-1.5">
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
      {children}
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
}: {
  animal: PortalAnimal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(animal));
  const [ageError, setAgeError] = useState(false);
  const [source, setSource] = useState({ animal, open });

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

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setAgeError(false);
  }

  /** Empty is what "give it back to the crawler" looks like in the form. */
  function reverting(field: PortalField, value: string | null): boolean {
    return isOverridden(animal, field) && (value === null || value === "");
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

        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <Field
            label={portalText.fieldName}
            htmlFor="portal-name"
            overridden={isOverridden(animal, "name")}
            reverting={reverting("name", draft.name)}
            onRevert={() => set("name", "")}
            disabled={saving}
          >
            <Input
              id="portal-name"
              value={draft.name}
              disabled={saving}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>

          <Field
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

            <Field
              label={portalText.fieldAgeMonths}
              htmlFor="portal-age-months"
              overridden={isOverridden(animal, "approximateAgeMonths")}
              reverting={reverting(
                "approximateAgeMonths",
                draft.approximateAgeMonths,
              )}
              onRevert={() => set("approximateAgeMonths", "")}
              disabled={saving}
              hint={portalText.fieldAgeMonthsUnit}
            >
              <Input
                id="portal-age-months"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={draft.approximateAgeMonths}
                disabled={saving}
                aria-invalid={ageError || undefined}
                onChange={(event) =>
                  set("approximateAgeMonths", event.target.value)
                }
              />
            </Field>
          </div>

          <Field
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
            label={portalText.fieldEnergy}
            overridden={isOverridden(animal, "energy")}
            reverting={reverting("energy", draft.energy)}
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
                label={label}
                overridden={isOverridden(animal, field)}
                reverting={reverting(field, draft[field])}
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
            <Button type="submit" disabled={saving || !dirty} className="flex-1">
              {saving && <LoaderCircle className="animate-spin" aria-hidden />}
              {saving ? portalText.saving : portalText.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
