// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalEditor } from "@/components/portal/animal-editor";
import { portalText } from "@/components/portal/portal-text";
import type { PortalAnimal } from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out and has neither of these. The editor scrolls the
// dialog panel when it opens at a field, and scrolls a rejected age box back
// into view on submit.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

const IDLE = { status: "idle" } as const;

function animal(): PortalAnimal {
  return {
    id: "testno:1",
    species: "cat",
    status: "available",
    name: "Muri",
    breed: null,
    sex: "female",
    birthDate: null,
    approximateAgeMonths: 24,
    size: null,
    energy: null,
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    apartmentOk: null,
    specialNeeds: null,
    shortDescription: null,
    thumbnailUrl: null,
    overrides: {},
  };
}

function open(onSave = vi.fn().mockResolvedValue(true)) {
  const onOpenChange = vi.fn();
  render(
    <AnimalEditor
      animal={animal()}
      open
      onOpenChange={onOpenChange}
      saveState={IDLE}
      onSave={onSave}
    />,
  );
  return { onOpenChange, onSave };
}

function field(id: string): HTMLElement {
  const control = document.getElementById(id);
  if (!control) throw new Error(`no control #${id}`);
  return control;
}

/** Types something, so the form has work in it that a dismiss would lose. */
function makeDirty() {
  fireEvent.change(field("portal-name"), { target: { value: "Murka" } });
}

function confirmShown(): boolean {
  return screen.queryByText(portalText.discardTitle) !== null;
}

function overlay(): Element {
  const found = document.querySelector('[data-slot="dialog-overlay"]');
  if (!found) throw new Error("no dialog overlay");
  return found;
}

describe("dismissing an editor with unsaved work", () => {
  it("holds the close button back and asks first", () => {
    const { onOpenChange } = open();
    makeDirty();

    fireEvent.click(screen.getByRole("button", { name: "Zapri" }));

    expect(confirmShown()).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("holds Escape back and asks first", () => {
    const { onOpenChange } = open();
    makeDirty();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(confirmShown()).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("holds a pointer outside back and asks first", async () => {
    const { onOpenChange } = open();
    makeDirty();

    // Radix attaches the outside-pointer listener a tick after the dialog
    // mounts, so the gesture has to wait for that tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(overlay());

    expect(confirmShown()).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("holds Prekliči back and asks first", () => {
    const { onOpenChange } = open();
    makeDirty();

    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));

    expect(confirmShown()).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes only once the shelter says to drop the work", () => {
    const { onOpenChange } = open();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));

    fireEvent.click(
      screen.getByRole("button", { name: portalText.discardChanges }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("goes back to the form when the shelter keeps editing", () => {
    const { onOpenChange } = open();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));

    fireEvent.click(
      screen.getByRole("button", { name: portalText.keepEditing }),
    );

    expect(confirmShown()).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not ask when nothing was typed", () => {
    const { onOpenChange } = open();

    fireEvent.click(screen.getByRole("button", { name: "Zapri" }));

    expect(confirmShown()).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not ask after the work has been saved", async () => {
    const { onOpenChange, onSave } = open();
    makeDirty();

    fireEvent.click(screen.getByRole("button", { name: portalText.save }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ name: "Murka" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(confirmShown()).toBe(false);
  });
});

describe("what a field tells a screen reader", () => {
  it("points every control at its own hint", () => {
    open();

    const hint = screen.getByText(portalText.nameHint);
    expect(hint.id).toBeTruthy();
    expect(field("portal-name").getAttribute("aria-describedby")).toBe(hint.id);

    const description = screen.getByText(portalText.descriptionHint);
    expect(field("portal-description").getAttribute("aria-describedby")).toBe(
      description.id,
    );

    // The three "se razume z" rows share one line, so all three point at it.
    const shared = screen.getByText(portalText.compatibilityHint);
    for (const label of [
      portalText.fieldGoodWithKids,
      portalText.fieldGoodWithDogs,
      portalText.fieldGoodWithCats,
    ]) {
      expect(
        screen
          .getByRole("group", { name: label })
          .getAttribute("aria-describedby"),
      ).toBe(shared.id);
    }
  });

  it("names the error message from the age box that carries the fault", () => {
    open();

    fireEvent.change(field("portal-age-years"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: portalText.save }));

    const summary = screen.getByRole("alert");
    expect(summary.textContent).toContain(portalText.invalidError);
    const years = field("portal-age-years");
    expect(years.getAttribute("aria-invalid")).toBe("true");
    expect(years.getAttribute("aria-errormessage")).toBe(summary.id);
  });

  it("moves the focus off the sticky footer onto the rejected box", () => {
    open();

    fireEvent.change(field("portal-age-months"), { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: portalText.save }));

    expect(document.activeElement).toBe(field("portal-age-months"));
  });
});
