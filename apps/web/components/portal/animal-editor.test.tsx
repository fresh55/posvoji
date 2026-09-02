// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalEditor } from "@/components/portal/animal-editor";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  SPECIAL_NEEDS_META,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalSaveState } from "@/hooks/portal-list";
import type { PortalAnimal } from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out and has neither of these. The editor scrolls the
// dialog panel when it opens at a field, and scrolls a rejected age box back
// into view on submit.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

const IDLE = { status: "idle" } as const;

function animal(overrides: Partial<PortalAnimal> = {}): PortalAnimal {
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
    ...overrides,
  };
}

function open(
  options: {
    animal?: Partial<PortalAnimal>;
    saveState?: PortalSaveState;
  } = {},
) {
  const onOpenChange = vi.fn();
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <AnimalEditor
      animal={animal(options.animal)}
      open
      onOpenChange={onOpenChange}
      saveState={options.saveState ?? IDLE}
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

/** One icon row of the form, by the field name above it. */
function row(label: string): HTMLElement {
  return screen.getByRole("radiogroup", { name: label });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: portalText.save,
  }) as HTMLButtonElement;
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
      expect(row(label).getAttribute("aria-describedby")).toBe(shared.id);
    }
  });

  it("names the error message from the age box that carries the fault", () => {
    open();

    fireEvent.change(field("portal-age-years"), { target: { value: "1.5" } });
    fireEvent.click(saveButton());

    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.invalidError);
    const years = field("portal-age-years");
    expect(years.getAttribute("aria-invalid")).toBe("true");
    expect(years.getAttribute("aria-errormessage")).toBe(message.id);
  });

  it("keeps the age's message beside the boxes it is about", () => {
    open();

    fireEvent.change(field("portal-age-years"), { target: { value: "1.5" } });
    fireEvent.click(saveButton());

    // At the foot of the form it is a phone screen below the boxes, which is
    // why the submit had to scroll the box back into view to be read at all.
    const ageRow = document.querySelector(
      '[data-field="approximateAgeMonths"]',
    );
    expect(ageRow?.contains(screen.getByRole("alert"))).toBe(true);
  });

  it("moves the focus off the sticky footer onto the rejected box", () => {
    open();

    fireEvent.change(field("portal-age-months"), { target: { value: "-3" } });
    fireEvent.click(saveButton());

    expect(document.activeElement).toBe(field("portal-age-months"));
  });

  it("holds the age's message until an age box is the thing that changed", () => {
    open();

    fireEvent.change(field("portal-age-years"), { target: { value: "1.5" } });
    fireEvent.click(saveButton());
    expect(screen.queryByRole("alert")).not.toBeNull();

    // Another field is not an answer to a number that is still unusable.
    fireEvent.change(field("portal-breed"), { target: { value: "Mešanec" } });
    expect(screen.queryByRole("alert")).not.toBeNull();

    fireEvent.change(field("portal-age-years"), { target: { value: "2" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("taking an icon answer back", () => {
  it("lets a mis-tap on an animal with nothing saved be tapped off", () => {
    open();

    const calm = within(row(portalText.fieldEnergy)).getByRole("radio", {
      name: ENERGY_META.calm.label,
    });
    fireEvent.click(calm);
    expect(calm.getAttribute("aria-checked")).toBe("true");
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(calm);

    // Back to where the form opened: no answer, and nothing left to save.
    expect(calm.getAttribute("aria-checked")).toBe("false");
    expect(saveButton().disabled).toBe(true);
  });

  it("clears an override the same way, and says so before it is saved", async () => {
    const { onSave } = open({
      animal: { goodWithKids: "yes", overrides: { goodWithKids: "yes" } },
    });

    const yes = within(row(portalText.fieldGoodWithKids)).getByRole("radio", {
      name: COMPATIBILITY_META.yes.label,
    });
    fireEvent.click(yes);

    expect(screen.getByText(portalText.willRevert)).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ goodWithKids: null });
    });
  });
});

describe("the special needs flag", () => {
  // The field is a boolean in the schema and on the wire. A third card said
  // "Ni znano" and saved nothing, so it lit up and left Shrani disabled.
  it("offers the two answers it actually has", () => {
    open();

    const cards = within(row(portalText.fieldSpecialNeeds)).getAllByRole(
      "radio",
    );

    expect(cards.map((card) => card.textContent)).toEqual([
      COMPATIBILITY_META.yes.label,
      COMPATIBILITY_META.no.label,
    ]);
  });

  it("saves the answer that is tapped", async () => {
    const { onSave } = open();

    fireEvent.click(
      within(row(portalText.fieldSpecialNeeds)).getByRole("radio", {
        name: COMPATIBILITY_META.no.label,
      }),
    );
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ specialNeeds: false });
    });
  });
});

describe("what a row the shelter has changed says for itself", () => {
  it("explains the way back under the control, not in a hover title", () => {
    open({ animal: { name: "Murka", overrides: { name: "Murka" } } });

    const nameRow = document.querySelector('[data-field="name"]');
    expect(nameRow).toBeTruthy();
    expect(
      within(nameRow as HTMLElement).getByText(portalText.fieldOwnLine),
    ).toBeTruthy();
  });

  it("drops the line once the row is set to be given back", () => {
    open({ animal: { name: "Murka", overrides: { name: "Murka" } } });

    fireEvent.change(field("portal-name"), { target: { value: "" } });

    expect(screen.queryByText(portalText.fieldOwnLine)).toBeNull();
    expect(screen.getByText(portalText.willRevert)).toBeTruthy();
  });

  it("says nothing on a row that is still the crawler's", () => {
    open();

    expect(screen.queryByText(portalText.fieldOwnLine)).toBeNull();
  });
});

describe("a failure left behind by the card's status buttons", () => {
  // saveState is one slot per animal, shared with the status row on the card,
  // and an error in it never expires.
  it("stays out of an editor that has not saved anything yet", () => {
    // Opened the way the card opens it, from closed, because that is the
    // render the failure has to be remembered on.
    const subject = animal();
    const failed: PortalSaveState = {
      status: "error",
      message: portalText.saveError,
    };
    const view = render(
      <AnimalEditor
        animal={subject}
        open={false}
        onOpenChange={vi.fn()}
        saveState={failed}
        onSave={vi.fn()}
      />,
    );

    view.rerender(
      <AnimalEditor
        animal={subject}
        open
        onOpenChange={vi.fn()}
        saveState={failed}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText(portalText.saveError)).toBeNull();
  });

  it("is shown once the editor's own save has failed", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const subject = animal();
    const view = render(
      <AnimalEditor
        animal={subject}
        open
        onOpenChange={vi.fn()}
        saveState={IDLE}
        onSave={onSave}
      />,
    );

    makeDirty();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    view.rerender(
      <AnimalEditor
        animal={subject}
        open
        onOpenChange={vi.fn()}
        saveState={{ status: "error", message: portalText.saveError }}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(portalText.saveError)).toBeTruthy();
  });
});

describe("where the focus goes", () => {
  it("gives it back to the control the editor was opened from", async () => {
    // The editor is opened in code, from the card, so Radix has no trigger of
    // its own to return to and would drop the focus on <body>.
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const subject = animal();
    const view = render(
      <AnimalEditor
        animal={subject}
        open
        onOpenChange={vi.fn()}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );
    expect(document.activeElement).not.toBe(opener);

    view.rerender(
      <AnimalEditor
        animal={subject}
        open={false}
        onOpenChange={vi.fn()}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("leaves the editor standing when Escape dismisses the confirm", async () => {
    const { onOpenChange } = open();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));
    expect(confirmShown()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(confirmShown()).toBe(false));
    expect(
      screen.getByText(fill(portalText.editTitle, { name: "Muri" })),
    ).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("a save that failed before the editor was opened", () => {
  // Same message, two attempts: the hook writes a fresh state object for each
  // one, which is how the dialog tells the failure it inherited from the one
  // its own save produced.
  function failure(): PortalSaveState {
    return { status: "error", message: portalText.saveError };
  }

  const subject = animal();

  function editor(open: boolean, saveState: PortalSaveState) {
    return (
      <AnimalEditor
        animal={subject}
        open={open}
        onOpenChange={vi.fn()}
        saveState={saveState}
        onSave={vi.fn()}
      />
    );
  }

  it("is not reported as this form's own", () => {
    // A status tap on the card failed, and the shelter opens the editor after
    // it. Nothing here has been submitted, so nothing here has failed.
    const { rerender } = render(editor(false, failure()));

    rerender(editor(true, failure()));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not swallow what the next save says", () => {
    const { rerender } = render(editor(false, failure()));
    rerender(editor(true, failure()));

    rerender(editor(true, failure()));

    expect(screen.getByRole("alert").textContent).toContain(
      portalText.saveError,
    );
  });
});

describe("a choice that gives the field back to the crawler", () => {
  function row(field: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!found) throw new Error(`no row for ${field}`);
    return found;
  }

  function revertButton(field: string): HTMLElement | null {
    return within(row(field)).queryByRole("button", { name: /^Povrni/ });
  }

  function edit(subject: PortalAnimal) {
    render(
      <AnimalEditor
        animal={subject}
        open
        onOpenChange={vi.fn()}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );
  }

  it("reads a cleared Posebne potrebe as a revert", () => {
    // specialNeeds is a boolean on the wire, so the row has the two answers
    // it actually has and no third card. Taking the answer back is what
    // reaches the wire as the null that clears the override, the same as an
    // emptied box elsewhere in the form.
    edit(animal({ specialNeeds: true, overrides: { specialNeeds: true } }));
    expect(
      within(row("specialNeeds")).getByText(portalText.edited),
    ).toBeTruthy();

    fireEvent.click(
      within(row("specialNeeds")).getByRole("radio", {
        name: SPECIAL_NEEDS_META.yes.label,
      }),
    );

    expect(
      within(row("specialNeeds")).getByText(portalText.willRevert),
    ).toBeTruthy();
    // And the button is gone: it offers an action already queued.
    expect(revertButton("specialNeeds")).toBeNull();
  });

  it("leaves an unoverridden Posebne potrebe alone", () => {
    // Nothing to give back, so clearing the row is only an answer withdrawn.
    edit(animal({ specialNeeds: true }));

    fireEvent.click(
      within(row("specialNeeds")).getByRole("radio", {
        name: SPECIAL_NEEDS_META.yes.label,
      }),
    );

    expect(
      within(row("specialNeeds")).queryByText(portalText.willRevert),
    ).toBeNull();
  });

  it("still reads an emptied box as a revert", () => {
    edit(animal({ name: "Muri", overrides: { name: "Muri" } }));

    fireEvent.change(field("portal-name"), { target: { value: "" } });

    expect(within(row("name")).getByText(portalText.willRevert)).toBeTruthy();
    expect(revertButton("name")).toBeNull();
  });
});
