// @vitest-environment jsdom

import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListingForm } from "@/components/portal/listing-form";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  SPECIES_META,
  STATUS_META,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalSaveState } from "@/hooks/portal-list";
import type { PortalListingActions } from "@/hooks/use-portal-listings";
import type {
  PortalListing,
  PortalListingInput,
  PortalListingPhoto,
} from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out and has none of these. The form scrolls the dialog
// panel when it opens at a field, scrolls a refused control back into view
// on submit, and previews a picked file through an object URL.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectURL = vi.fn();
URL.createObjectURL = createObjectURL;
URL.revokeObjectURL = revokeObjectURL;

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

const IDLE: PortalSaveState = { status: "idle" };

const PHOTO: PortalListingPhoto = {
  id: 7,
  url: "http://localhost:8000/media/listings/6d1c/3f2a9c.jpg",
  width: 1600,
  height: 1200,
};

const NULLS = {
  sex: null,
  breed: null,
  birthDate: null,
  approximateAgeMonths: null,
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: null,
  apartmentOk: null,
  specialNeeds: null,
  shortDescription: null,
};

function listing(overrides: Partial<PortalListing> = {}): PortalListing {
  return {
    providerId: "johanca",
    id: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
    species: "cat",
    status: "available",
    name: "Luna",
    ...NULLS,
    photos: [],
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

const LUNA: PortalListingInput = {
  species: "cat",
  name: "Luna",
  status: "available",
  ...NULLS,
};

function fakeActions(): PortalListingActions {
  return {
    create: vi.fn().mockResolvedValue(listing()),
    update: vi.fn().mockResolvedValue(listing()),
    archive: vi.fn().mockResolvedValue(true),
    uploadPhoto: vi.fn().mockResolvedValue(PHOTO),
    deletePhoto: vi.fn().mockResolvedValue(true),
  };
}

/**
 * The parent as the workspace plays it: hands the created listing back in
 * once the POST has answered, so the form goes on editing it.
 */
function Harness({
  actions,
  initial,
  onOpenChange,
  saveState = IDLE,
  initialField,
}: {
  actions: PortalListingActions;
  initial: PortalListing | null;
  onOpenChange: (open: boolean) => void;
  saveState?: PortalSaveState;
  initialField?: "energy" | "goodWithKids";
}) {
  const [current, setCurrent] = useState(initial);
  return (
    <ListingForm
      listing={current}
      open
      onOpenChange={onOpenChange}
      actions={actions}
      saveState={saveState}
      onCreated={setCurrent}
      initialField={initialField}
    />
  );
}

function open(
  options: {
    listing?: PortalListing | null;
    actions?: PortalListingActions;
    saveState?: PortalSaveState;
    initialField?: "energy" | "goodWithKids";
  } = {},
) {
  const onOpenChange = vi.fn();
  const actions = options.actions ?? fakeActions();
  render(
    <Harness
      actions={actions}
      initial={options.listing ?? null}
      onOpenChange={onOpenChange}
      saveState={options.saveState}
      initialField={options.initialField}
    />,
  );
  return { onOpenChange, actions };
}

/** One icon row of the form, by the field name above it. */
function row(label: string): HTMLElement {
  return screen.getByRole("radiogroup", { name: label });
}

function card(rowLabel: string, name: string): HTMLElement {
  return within(row(rowLabel)).getByRole("radio", { name });
}

function nameBox(): HTMLInputElement {
  return screen.getByLabelText(portalText.fieldName) as HTMLInputElement;
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: portalText.save,
  }) as HTMLButtonElement;
}

function fileBox(): HTMLInputElement {
  return screen.getByLabelText(portalText.photoAdd) as HTMLInputElement;
}

function jpeg(name: string): File {
  return new File(["jpeg bytes"], name, { type: "image/jpeg" });
}

function pick(...files: File[]) {
  fireEvent.change(fileBox(), { target: { files } });
}

/** Every photo box in the grid, stored and pending alike. */
function photoImages(): HTMLImageElement[] {
  return Array.from(document.querySelectorAll<HTMLImageElement>("figure img"));
}

function confirmShown(): boolean {
  return screen.queryByText(portalText.discardTitle) !== null;
}

describe("a new listing", () => {
  it("opens with nothing to save but the status, and says when it will show", () => {
    open();

    expect(screen.getByText(portalText.listingNewTitle)).toBeTruthy();
    expect(screen.getByText(portalText.listingNewLead)).toBeTruthy();
    expect(
      card(portalText.statusLegend, STATUS_META.available.label).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(saveButton().disabled).toBe(true);
    // Nothing to take off the site yet.
    expect(
      screen.queryByRole("button", { name: portalText.listingArchive }),
    ).toBeNull();
  });

  it("lets Shrani go once a species and a name are in", () => {
    open();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(nameBox(), { target: { value: "  Luna " } });
    expect(saveButton().disabled).toBe(false);
  });

  it("posts the whole listing, with nulls for what was not said", async () => {
    const { onOpenChange, actions } = open();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "  Luna " } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(actions.create).toHaveBeenCalledWith(LUNA);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(actions.uploadPhoto).not.toHaveBeenCalled();
  });

  it("carries the answers that were given", async () => {
    const { actions } = open();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.dog.label));
    fireEvent.change(nameBox(), { target: { value: "Rex" } });
    fireEvent.click(card(portalText.statusLegend, STATUS_META.reserved.label));
    fireEvent.click(card(portalText.fieldEnergy, ENERGY_META.lively.label));
    fireEvent.click(
      card(portalText.fieldGoodWithKids, COMPATIBILITY_META.yes.label),
    );
    fireEvent.change(screen.getByLabelText(portalText.fieldAgeYearsUnit), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(portalText.fieldAgeMonthsUnit), {
      target: { value: "3" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(actions.create).toHaveBeenCalledWith({
        ...LUNA,
        species: "dog",
        name: "Rex",
        status: "reserved",
        energy: "lively",
        goodWithKids: "yes",
        approximateAgeMonths: 27,
      });
    });
  });

  it("keeps a status: tapping the chosen card again does not clear it", () => {
    open();

    const available = card(
      portalText.statusLegend,
      STATUS_META.available.label,
    );
    fireEvent.click(available);

    expect(available.getAttribute("aria-checked")).toBe("true");
  });
});

describe("photos on a new listing", () => {
  it("holds picked files as previews until the listing exists", () => {
    const { actions } = open();

    pick(jpeg("a.jpg"), jpeg("b.jpg"));

    expect(actions.uploadPhoto).not.toHaveBeenCalled();
    expect(photoImages().map((img) => img.getAttribute("src"))).toEqual([
      "blob:a.jpg",
      "blob:b.jpg",
    ]);
    // Work the shelter would lose, so a dismiss has to ask.
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));
    expect(confirmShown()).toBe(true);
  });

  it("refuses a file that is not a photo, before anything is sent", () => {
    const { actions } = open();

    pick(new File(["hello"], "notes.txt", { type: "text/plain" }));

    expect(
      screen.getByText(
        fill(portalText.photoTypeRejected, { name: "notes.txt" }),
      ),
    ).toBeTruthy();
    expect(actions.uploadPhoto).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("refuses a file over 15 MB, before anything is sent", () => {
    open();

    const big = jpeg("big.jpg");
    Object.defineProperty(big, "size", { value: 15 * 1024 * 1024 + 1 });
    pick(big);

    expect(
      screen.getByText(fill(portalText.photoTooLarge, { name: "big.jpg" })),
    ).toBeTruthy();
    expect(photoImages()).toHaveLength(0);
  });

  it("drops a preview the shelter takes back, and its object URL with it", () => {
    open();

    pick(jpeg("a.jpg"));
    fireEvent.click(screen.getByRole("button", { name: portalText.photoRemove }));

    expect(photoImages()).toHaveLength(0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:a.jpg");
  });

  it("uploads them one by one after the POST, and stays open on the one that fails", async () => {
    const actions = fakeActions();
    const saved = listing();
    vi.mocked(actions.create).mockResolvedValue(saved);
    // The second file is held so the line about it can be read, then fails.
    let failSecond: (photo: PortalListingPhoto | null) => void = () => {};
    vi.mocked(actions.uploadPhoto)
      .mockResolvedValueOnce({ ...PHOTO, id: 1 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            failSecond = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...PHOTO, id: 3 });
    const { onOpenChange } = open({ actions });

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    pick(jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"));
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(actions.create).toHaveBeenCalledWith(LUNA);
      expect(actions.uploadPhoto).toHaveBeenCalledTimes(2);
    });
    // Mid-sequence: the line says which one is going up, the footer is still
    // saving, and the dialog is already the created listing's.
    expect(
      screen.getByText(
        fill(portalText.photoUploading, { index: 2, total: 3 }),
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: portalText.saving }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(nameBox().disabled).toBe(true);
    expect(
      screen.getByText(fill(portalText.editTitle, { name: "Luna" })),
    ).toBeTruthy();

    failSecond(null);

    await waitFor(() => {
      expect(actions.uploadPhoto).toHaveBeenCalledTimes(3);
    });
    const calls = vi.mocked(actions.uploadPhoto).mock.calls;
    expect(calls.map(([id]) => id)).toEqual([saved.id, saved.id, saved.id]);
    expect(calls.map(([, file]) => file.name)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
    ]);

    // The third still went, the second is named with its retry, and the
    // dialog did not close over a listing missing a photo.
    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.photoUploadFailed, { name: "b.jpg" })),
      ).toBeTruthy();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(photoImages().map((img) => img.getAttribute("src"))).toEqual([
      "blob:b.jpg",
    ]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:a.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:c.jpg");
    expect(saveButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: portalText.photoRetry }));

    await waitFor(() => {
      expect(actions.uploadPhoto).toHaveBeenCalledTimes(4);
      expect(
        screen.queryByText(
          fill(portalText.photoUploadFailed, { name: "b.jpg" }),
        ),
      ).toBeNull();
    });
    expect(vi.mocked(actions.uploadPhoto).mock.calls[3][1].name).toBe("b.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:b.jpg");
  });

  it("closes once every photo is up", async () => {
    const { onOpenChange, actions } = open();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    pick(jpeg("a.jpg"), jpeg("b.jpg"));
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(actions.uploadPhoto).toHaveBeenCalledTimes(2);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe("photos on an existing listing", () => {
  it("shows the stored ones, first first, and sizes each box", () => {
    open({ listing: listing({ photos: [PHOTO, { ...PHOTO, id: 8 }] }) });

    const [first] = photoImages();
    expect(first.getAttribute("src")).toBe(PHOTO.url);
    expect(first.getAttribute("width")).toBe("1600");
    expect(first.getAttribute("height")).toBe("1200");
    expect(screen.getByText(new RegExp(portalText.photosHint))).toBeTruthy();
  });

  it("sends a picked file at once", async () => {
    const actions = fakeActions();
    let finish: (photo: PortalListingPhoto | null) => void = () => {};
    vi.mocked(actions.uploadPhoto).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const subject = listing({ photos: [PHOTO] });
    open({ listing: subject, actions });

    pick(jpeg("new.jpg"));

    expect(actions.uploadPhoto).toHaveBeenCalledWith(
      subject.id,
      expect.objectContaining({ name: "new.jpg" }),
    );
    expect(
      screen.getByText(
        fill(portalText.photoUploading, { index: 1, total: 1 }),
      ),
    ).toBeTruthy();
    // The typed fields stay open while a photo goes up; only the footer waits.
    expect(nameBox().disabled).toBe(false);
    expect(saveButton().disabled).toBe(true);

    finish({ ...PHOTO, id: 9 });

    await waitFor(() => {
      expect(
        screen.queryByText(
          fill(portalText.photoUploading, { index: 1, total: 1 }),
        ),
      ).toBeNull();
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:new.jpg");
  });

  it("keeps the one copy when the upload answers with a photo already there", async () => {
    const actions = fakeActions();
    // A 200: the portal recognised the bytes and answered the existing photo.
    vi.mocked(actions.uploadPhoto).mockResolvedValue(PHOTO);
    open({ listing: listing({ photos: [PHOTO] }), actions });

    pick(jpeg("same.jpg"));

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:same.jpg");
    });
    expect(photoImages().map((img) => img.getAttribute("src"))).toEqual([
      PHOTO.url,
    ]);
  });

  it("removes a stored photo on the second tap, not the first", async () => {
    const { actions } = open({ listing: listing({ photos: [PHOTO] }) });

    const remove = screen.getByRole("button", {
      name: fill(portalText.photoRemoveLabel, { index: 1 }),
    });
    fireEvent.click(remove);

    expect(actions.deletePhoto).not.toHaveBeenCalled();
    expect(remove.textContent).toBe(portalText.photoRemoveConfirm);

    fireEvent.click(remove);

    await waitFor(() => {
      expect(actions.deletePhoto).toHaveBeenCalledWith(listing().id, 7);
    });
  });

  it("says so beside the grid when a remove fails", async () => {
    const actions = fakeActions();
    vi.mocked(actions.deletePhoto).mockResolvedValue(false);
    open({ listing: listing({ photos: [PHOTO] }), actions });

    const remove = screen.getByRole("button", {
      name: fill(portalText.photoRemoveLabel, { index: 1 }),
    });
    fireEvent.click(remove);
    fireEvent.click(remove);

    await waitFor(() => {
      expect(screen.getByText(portalText.photoRemoveError)).toBeTruthy();
    });
  });
});

describe("editing a listing", () => {
  it("opens on the saved values with nothing to save", () => {
    open({
      listing: listing({
        breed: "mešanec",
        approximateAgeMonths: 27,
        goodWithKids: "yes",
      }),
    });

    expect(
      screen.getByText(fill(portalText.editTitle, { name: "Luna" })),
    ).toBeTruthy();
    expect(screen.getByText(portalText.listingEditLead)).toBeTruthy();
    expect(nameBox().value).toBe("Luna");
    expect(
      (screen.getByLabelText(portalText.fieldBreed) as HTMLInputElement).value,
    ).toBe("mešanec");
    expect(
      (screen.getByLabelText(portalText.fieldAgeYearsUnit) as HTMLInputElement)
        .value,
    ).toBe("2");
    expect(
      (screen.getByLabelText(portalText.fieldAgeMonthsUnit) as HTMLInputElement)
        .value,
    ).toBe("3");
    expect(
      card(portalText.fieldGoodWithKids, COMPATIBILITY_META.yes.label).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(saveButton().disabled).toBe(true);
  });

  it("sends the whole listing again with the change in it", async () => {
    const { onOpenChange, actions } = open({
      listing: listing({ goodWithKids: "yes" }),
    });

    fireEvent.click(card(portalText.fieldEnergy, ENERGY_META.calm.label));
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(actions.update).toHaveBeenCalledWith(listing().id, {
        ...LUNA,
        goodWithKids: "yes",
        energy: "calm",
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("marks the searchable fields the saved listing leaves blank", () => {
    open({ listing: listing({ energy: "calm" }) });

    const energyRow = document.querySelector('[data-field="energy"]');
    const kidsRow = document.querySelector('[data-field="goodWithKids"]');
    expect(energyRow?.textContent).not.toContain(portalText.missingBadge);
    expect(kidsRow?.textContent).toContain(portalText.missingBadge);
  });

  it("refuses to save without a name, and puts the focus on the box", () => {
    const { actions } = open({ listing: listing() });

    fireEvent.change(nameBox(), { target: { value: "  " } });
    fireEvent.click(saveButton());

    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.nameRequired);
    expect(nameBox().getAttribute("aria-invalid")).toBe("true");
    expect(nameBox().getAttribute("aria-errormessage")).toBe(message.id);
    expect(document.activeElement).toBe(nameBox());
    expect(actions.update).not.toHaveBeenCalled();

    // Typing a name retires the message.
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses to save without a species, under the species cards", () => {
    const { actions } = open({ listing: listing() });

    // Tapping the chosen card off is the one way to lose the species.
    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.click(saveButton());

    const speciesRow = document.querySelector('[data-field="species"]');
    expect(speciesRow?.textContent).toContain(portalText.speciesRequired);
    expect(speciesRow?.contains(document.activeElement)).toBe(true);
    expect(actions.update).not.toHaveBeenCalled();
  });

  it("keeps the age's message beside the boxes and focuses the one at fault", () => {
    open({ listing: listing() });

    fireEvent.change(screen.getByLabelText(portalText.fieldAgeMonthsUnit), {
      target: { value: "-3" },
    });
    fireEvent.click(saveButton());

    const ageRow = document.querySelector(
      '[data-field="approximateAgeMonths"]',
    );
    expect(ageRow?.contains(screen.getByRole("alert"))).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByLabelText(portalText.fieldAgeMonthsUnit),
    );
  });

  it("shows the save that did not go through, once it has tried one", () => {
    const failed: PortalSaveState = {
      status: "error",
      message: portalText.saveError,
    };
    open({ listing: listing(), saveState: failed });

    // A failure left behind by the card's status buttons stays out.
    expect(screen.queryByText(portalText.saveError)).toBeNull();
  });
});

describe("taking a listing off the site", () => {
  function archiveDialog(): HTMLElement {
    return screen.getByRole("alertdialog");
  }

  it("asks first, and says when the animal leaves the public site", () => {
    const { actions } = open({ listing: listing() });

    fireEvent.click(
      screen.getByRole("button", { name: portalText.listingArchive }),
    );

    const dialog = archiveDialog();
    expect(
      within(dialog).getByText(
        fill(portalText.listingArchiveTitle, { name: "Luna" }),
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(portalText.listingArchiveLead),
    ).toBeTruthy();
    expect(actions.archive).not.toHaveBeenCalled();

    // The safe answer is the one the dialog opens on.
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: portalText.listingArchiveCancel,
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(actions.archive).not.toHaveBeenCalled();
  });

  it("archives on confirm and closes", async () => {
    const { onOpenChange, actions } = open({ listing: listing() });

    fireEvent.click(
      screen.getByRole("button", { name: portalText.listingArchive }),
    );
    fireEvent.click(
      within(archiveDialog()).getByRole("button", {
        name: portalText.listingArchive,
      }),
    );

    await waitFor(() => {
      expect(actions.archive).toHaveBeenCalledWith(listing().id);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("stays open when the archive fails", async () => {
    const actions = fakeActions();
    vi.mocked(actions.archive).mockResolvedValue(false);
    const { onOpenChange } = open({ listing: listing(), actions });

    fireEvent.click(
      screen.getByRole("button", { name: portalText.listingArchive }),
    );
    fireEvent.click(
      within(archiveDialog()).getByRole("button", {
        name: portalText.listingArchive,
      }),
    );

    await waitFor(() => expect(actions.archive).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("dismissing the form with unsaved work", () => {
  it("holds Prekliči back and asks first", () => {
    const { onOpenChange } = open({ listing: listing() });
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });

    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));

    expect(confirmShown()).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("holds Escape back and asks first", () => {
    const { onOpenChange } = open();
    fireEvent.change(nameBox(), { target: { value: "Luna" } });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(confirmShown()).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes only once the shelter says to drop the work", () => {
    const { onOpenChange } = open();
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));

    fireEvent.click(
      screen.getByRole("button", { name: portalText.discardChanges }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("goes back to the form when the shelter keeps editing", () => {
    const { onOpenChange } = open();
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));

    fireEvent.click(
      screen.getByRole("button", { name: portalText.keepEditing }),
    );

    expect(confirmShown()).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not ask when nothing was typed", () => {
    const { onOpenChange } = open({ listing: listing() });

    fireEvent.click(screen.getByRole("button", { name: "Zapri" }));

    expect(confirmShown()).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("where the focus goes", () => {
  it("gives it back to the control the form was opened from", async () => {
    // The form is opened in code, from the card or the header button, so
    // Radix has no trigger to return to and would drop the focus on <body>.
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const actions = fakeActions();
    const view = render(
      <ListingForm
        listing={null}
        open
        onOpenChange={vi.fn()}
        actions={actions}
        saveState={IDLE}
      />,
    );
    expect(document.activeElement).not.toBe(opener);

    view.rerender(
      <ListingForm
        listing={null}
        open={false}
        onOpenChange={vi.fn()}
        actions={actions}
        saveState={IDLE}
      />,
    );

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("opens at the field the card named", async () => {
    open({ listing: listing({ energy: "calm" }), initialField: "goodWithKids" });

    const kidsRow = document.querySelector('[data-field="goodWithKids"]');
    await waitFor(() => {
      expect(kidsRow?.contains(document.activeElement)).toBe(true);
    });
  });

  it("leaves the form standing when Escape dismisses the confirm", async () => {
    const { onOpenChange } = open();
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    fireEvent.click(screen.getByRole("button", { name: portalText.cancel }));
    expect(confirmShown()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(confirmShown()).toBe(false));
    expect(screen.getByText(portalText.listingNewTitle)).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("drops the previews when the dialog closes", () => {
    const actions = fakeActions();
    const view = render(
      <ListingForm
        listing={null}
        open
        onOpenChange={vi.fn()}
        actions={actions}
        saveState={IDLE}
      />,
    );
    pick(jpeg("a.jpg"));

    view.rerender(
      <ListingForm
        listing={null}
        open={false}
        onOpenChange={vi.fn()}
        actions={actions}
        saveState={IDLE}
      />,
    );

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:a.jpg");
  });
});
