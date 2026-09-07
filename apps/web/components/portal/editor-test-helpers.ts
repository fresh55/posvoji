// What both editor page tests need to say the same thing about the same
// markup: the rows, the leave confirm, and the boxes the browser cannot read.
// One copy, so a change to the form's marks is answered in one place.

import { fireEvent, screen } from "@testing-library/react";
import { portalText } from "@/components/portal/portal-text";

/** One row of the form, by the field name it is marked with. */
export function fieldRow(name: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (!found) throw new Error(`no row for ${name}`);
  return found;
}

/** Whether the confirm that stands between typed work and leaving is up. */
export function confirmShown(): boolean {
  return screen.queryByText(portalText.leaveTitle) !== null;
}

/**
 * What Chromium reports for "2-1" in a number box or a year of 0001 in the
 * date box: an empty value with validity.badInput set. jsdom reads every
 * value, so the flag is put on the box by hand.
 */
export function makeUnreadable(control: HTMLElement, badInput = true) {
  Object.defineProperty(control, "validity", {
    configurable: true,
    value: { badInput },
  });
}

/** Types something the browser cannot read into a box. */
export function typeUnreadable(control: HTMLElement) {
  makeUnreadable(control);
  fireEvent.change(control, { target: { value: "" } });
}
