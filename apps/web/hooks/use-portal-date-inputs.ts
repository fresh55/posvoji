import {
  fieldControls,
  fieldRow,
  type AgeBox,
  type ReadBox,
} from "@/components/portal/portal-fields";
import type { PortalField } from "@/lib/portal-api";
import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { useReadBoxes } from "./use-read-boxes";

export function usePortalFieldFocus(
  form: RefObject<HTMLFormElement | null>,
  field: PortalField | null,
) {
  useEffect(() => {
    if (!field) return;
    const frame = requestAnimationFrame(() => {
      const row = fieldRow(form.current, field);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      fieldControls(row)[0]?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [field, form]);
}

/** The same browser date/number faults, in the order both forms display them. */
export function firstDateFault(
  unreadable: ReadonlySet<ReadBox>,
  badDate: boolean,
  badAgeBox: AgeBox | null,
): ReadBox | null {
  if (unreadable.has("birthDate") || badDate) return "birthDate";
  if (unreadable.has("ageYears") || badAgeBox === "years") return "ageYears";
  if (unreadable.has("ageMonths") || badAgeBox === "months") return "ageMonths";
  return null;
}

type DateDraft = { ageYears: string; ageMonths: string; birthDate: string };

export function usePortalDateInputs<Draft extends DateDraft>(
  setDraft: Dispatch<SetStateAction<Draft>>,
  boxes: ReturnType<typeof useReadBoxes>,
  answered: (field: ReadBox) => void,
  touched: () => void,
) {
  function setAge(
    key: "ageYears" | "ageMonths",
    value: string,
    unreadable: boolean,
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    boxes.mark(key, unreadable);
    answered("ageYears");
    answered("ageMonths");
    touched();
  }
  function setBirthDate(value: string, unreadable: boolean) {
    setDraft((current) => ({ ...current, birthDate: value }));
    boxes.mark("birthDate", unreadable);
    answered("birthDate");
    touched();
  }
  return { setAge, setBirthDate };
}
