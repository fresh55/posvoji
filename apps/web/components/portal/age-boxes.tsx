"use client";

import { hintId, type ReadBox } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The three boxes the browser reads a value out of, as both forms draw them.
 *
 * The crawled editor and the listing form ask for the same age the same way
 * and refuse it the same way; only where the message goes and what the ids
 * are differ, so both stay with the caller.
 */

/**
 * The id of the message about one box, or null while that box has none. Each
 * page maps its own error model onto this, and the aria attributes follow it.
 */
type BoxErrorId = (box: ReadBox) => string | null;

/** The note the page keeps of a box the browser could not read. */
type MarkBox = (box: ReadBox, unreadable: boolean) => void;

export function BirthDateBox({
  id,
  value,
  disabled,
  errorFor,
  setBirthDate,
  markBox,
}: {
  /** The form's own id for this box, which its label points at. */
  id: string;
  value: string;
  disabled: boolean;
  errorFor: BoxErrorId;
  setBirthDate: (value: string, unreadable: boolean) => void;
  markBox: MarkBox;
}) {
  const error = errorFor("birthDate");

  return (
    <Input
      id={id}
      type="date"
      value={value}
      disabled={disabled}
      aria-invalid={error !== null || undefined}
      aria-errormessage={error ?? undefined}
      onChange={(event) =>
        setBirthDate(event.target.value, event.target.validity.badInput)
      }
      onInput={(event) =>
        markBox("birthDate", event.currentTarget.validity.badInput)
      }
    />
  );
}

/** One half of the age, with the unit that labels it. */
function AgeInput({
  id,
  box,
  hint,
  value,
  unit,
  disabled,
  errorFor,
  setAge,
  markBox,
}: {
  id: string;
  box: "ageYears" | "ageMonths";
  /** The id of the line under both boxes, which each one points at. */
  hint: string;
  value: string;
  unit: string;
  disabled: boolean;
  errorFor: BoxErrorId;
  setAge: (
    key: "ageYears" | "ageMonths",
    value: string,
    unreadable: boolean,
  ) => void;
  markBox: MarkBox;
}) {
  const error = errorFor(box);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={error !== null || undefined}
        aria-errormessage={error ?? undefined}
        aria-describedby={hint}
        onChange={(event) =>
          setAge(box, event.target.value, event.target.validity.badInput)
        }
        onInput={(event) =>
          markBox(box, event.currentTarget.validity.badInput)
        }
      />
      <Label
        htmlFor={id}
        className="shrink-0 text-xs font-normal text-muted-foreground"
      >
        {unit}
      </Label>
    </div>
  );
}

/**
 * Two inputs, because a shelter knows an age as "two years", not as a month
 * count. The unit next to each box labels it; the field itself is the group
 * above them.
 */
export function AgeBoxes({
  uid,
  yearsId,
  monthsId,
  years,
  months,
  disabled,
  errorFor,
  setAge,
  markBox,
}: {
  /** The form's id prefix, for the hint the group points at. */
  uid: string;
  /** The form's own ids for the two boxes, which their units point at. */
  yearsId: string;
  monthsId: string;
  years: string;
  months: string;
  disabled: boolean;
  errorFor: BoxErrorId;
  setAge: (
    key: "ageYears" | "ageMonths",
    value: string,
    unreadable: boolean,
  ) => void;
  markBox: MarkBox;
}) {
  const hint = hintId(uid, "approximateAgeMonths");

  return (
    <div
      role="group"
      aria-label={portalText.fieldAgeMonths}
      aria-describedby={hint}
      className="grid grid-cols-2 gap-1.5"
    >
      <AgeInput
        id={yearsId}
        box="ageYears"
        hint={hint}
        value={years}
        unit={portalText.fieldAgeYearsUnit}
        disabled={disabled}
        errorFor={errorFor}
        setAge={setAge}
        markBox={markBox}
      />
      <AgeInput
        id={monthsId}
        box="ageMonths"
        hint={hint}
        value={months}
        unit={portalText.fieldAgeMonthsUnit}
        disabled={disabled}
        errorFor={errorFor}
        setAge={setAge}
        markBox={markBox}
      />
    </div>
  );
}
