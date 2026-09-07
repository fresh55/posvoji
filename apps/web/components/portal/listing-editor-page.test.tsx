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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalEditorPage } from "@/components/portal/animal-editor-page";
import {
  confirmShown,
  fieldRow,
  makeUnreadable,
  typeUnreadable,
} from "@/components/portal/editor-test-helpers";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  SEX_META,
  SPECIES_META,
  STATUS_META,
} from "@/components/portal/portal-fields";
import { PortalProvider } from "@/components/portal/portal-provider";
import { fill, portalText } from "@/components/portal/portal-text";
import {
  PortalError,
  archiveListing,
  createListing,
  deleteListingPhoto,
  fetchAnimals,
  fetchListings,
  fetchSession,
  updateListing,
  uploadListingPhoto,
  type PortalListing,
  type PortalListingInput,
  type PortalListingPhoto,
  type PortalShelter,
} from "@/lib/portal-api";
import { writeDraft } from "@/lib/portal-drafts";

// The address is the page's only argument, so the tests set it the way a
// visitor would and the mock reads it back at every render.
let search = new URLSearchParams();
const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/portal/zival",
  useRouter: () => ({
    push,
    replace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Only the calls the page makes are stubbed; PortalError and isUnauthorized
// stay the real ones, because the hooks branch on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchSession: vi.fn(),
  fetchAnimals: vi.fn(),
  fetchListings: vi.fn(),
  createListing: vi.fn(),
  updateListing: vi.fn(),
  archiveListing: vi.fn(),
  uploadListingPhoto: vi.fn(),
  deleteListingPhoto: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// jsdom lays nothing out and has none of these. The page scrolls to the row it
// was sent to, scrolls a refused control back into view, and previews a picked
// file through an object URL.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectURL = vi.fn();
URL.createObjectURL = createObjectURL;
URL.revokeObjectURL = revokeObjectURL;

afterEach(cleanup);

const ACCOUNT = "info@zavetisce.si";

const MANUAL: PortalShelter = {
  slug: "johanca",
  name: "Zavetišče JoHanca",
  city: "Kranj",
  ingestion: "manual",
};

// No ingestion at all: what every shelter reported before the field.
const CRAWLED: PortalShelter = {
  slug: "ljubljana",
  name: "Zavetišče Ljubljana",
  city: "Ljubljana",
};

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

const ID = "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10";

function listing(overrides: Partial<PortalListing> = {}): PortalListing {
  return {
    providerId: "johanca",
    id: ID,
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

beforeEach(() => {
  // A draft outlives the page it was typed on, on purpose, so each test has to
  // start in a tab that has never been used.
  window.sessionStorage.clear();
  search = new URLSearchParams({ zavetisce: "johanca", id: ID });
  push.mockReset();
  replace.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.mocked(fetchSession).mockReset();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(fetchListings).mockReset();
  vi.mocked(createListing).mockReset().mockResolvedValue(listing());
  vi.mocked(updateListing).mockReset().mockResolvedValue(listing());
  vi.mocked(archiveListing).mockReset().mockResolvedValue(undefined);
  vi.mocked(uploadListingPhoto).mockReset().mockResolvedValue(PHOTO);
  vi.mocked(deleteListingPhoto).mockReset().mockResolvedValue(undefined);
});

function signIn(shelter: PortalShelter = MANUAL) {
  vi.mocked(fetchSession).mockResolvedValue({
    email: ACCOUNT,
    shelters: [shelter],
  });
}

/** The route's own entry point, which picks the editor the shelter needs. */
function renderPage() {
  return render(
    <PortalProvider>
      <AnimalEditorPage />
    </PortalProvider>,
  );
}

/** The page with an existing listing loaded and the form on screen. */
async function open(overrides: Partial<PortalListing> = {}) {
  signIn();
  vi.mocked(fetchListings).mockResolvedValue([listing(overrides)]);
  const view = renderPage();
  await waitFor(() => expect(nameBox()).toBeTruthy());
  return view;
}

/** The page on the empty form a new listing is written in. */
async function openNew() {
  signIn();
  search = new URLSearchParams({ zavetisce: "johanca", nova: "1" });
  vi.mocked(fetchListings).mockResolvedValue([]);
  const view = renderPage();
  await waitFor(() => expect(nameBox()).toBeTruthy());
  return view;
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

function cancelButton(): HTMLElement {
  return screen.getByRole("button", { name: portalText.cancel });
}

function breadcrumb(): HTMLElement {
  return screen.getByRole("link", { name: portalText.animalsTitle });
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

function yearsBox(): HTMLInputElement {
  return screen.getByLabelText(portalText.fieldAgeYearsUnit) as HTMLInputElement;
}

function monthsBox(): HTMLInputElement {
  return screen.getByLabelText(
    portalText.fieldAgeMonthsUnit,
  ) as HTMLInputElement;
}

function dateBox(): HTMLInputElement {
  return screen.getByLabelText(portalText.fieldBirthDate) as HTMLInputElement;
}

function saveBar(): HTMLElement {
  const bar = document.querySelector<HTMLElement>("[data-save-bar]");
  if (!bar) throw new Error("no save bar");
  return bar;
}

/** A save that never answers, for the page while it is waiting. */
function saveHangs() {
  vi.mocked(updateListing).mockReturnValue(new Promise(() => {}));
}

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

describe("finding the listing the address names", () => {
  it("waits for the list before calling an id unknown", async () => {
    signIn();
    let deliver: (listings: PortalListing[]) => void = () => {};
    vi.mocked(fetchListings).mockReturnValue(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(portalText.loading)).toBeTruthy();
    });
    expect(screen.queryByText(portalText.editorNotFoundTitle)).toBeNull();

    deliver([]);

    await waitFor(() => {
      expect(screen.getByText(portalText.editorNotFoundTitle)).toBeTruthy();
    });
    expect(
      screen.getByRole("link", { name: portalText.backToList }),
    ).toBeTruthy();
  });

  it("says so when the list itself will not load", async () => {
    signIn();
    vi.mocked(fetchListings).mockRejectedValue(new PortalError(500));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(portalText.listErrorTitle)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: portalText.retry })).toBeTruthy();
  });

  it("has no new listing to offer a crawled shelter", async () => {
    // Only a manual shelter writes its own animals; a crawled one creating
    // them would duplicate the animal on the next crawl.
    signIn(CRAWLED);
    search = new URLSearchParams({ zavetisce: "ljubljana", nova: "1" });
    vi.mocked(fetchAnimals).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(portalText.editorNotFoundTitle)).toBeTruthy();
    });
    expect(createListing).not.toHaveBeenCalled();
  });
});

describe("a new listing", () => {
  it("opens empty, with a status and nothing to take off the site", async () => {
    await openNew();

    expect(screen.getByRole("heading", { name: portalText.listingNewTitle }))
      .toBeTruthy();
    expect(screen.getByText(portalText.listingNewLead)).toBeTruthy();
    expect(
      card(portalText.statusLegend, STATUS_META.available.label).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(saveButton().disabled).toBe(true);
    expect(
      screen.queryByRole("button", { name: portalText.listingArchive }),
    ).toBeNull();
  });

  it("asks for the species and the name before anything else", async () => {
    await openNew();

    // The two fields a listing cannot exist without are the first section on
    // the page, above the photos it has none of yet.
    const sections = Array.from(document.querySelectorAll("form h2")).map(
      (heading) => heading.textContent,
    );
    expect(sections.slice(0, 3)).toEqual([
      portalText.sectionBasics,
      portalText.fieldPhotos,
      portalText.sectionSearchable,
    ]);
  });

  it("lets Shrani go once a species and a name are in", async () => {
    await openNew();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(nameBox(), { target: { value: "  Luna " } });
    expect(saveButton().disabled).toBe(false);
  });

  it("posts the whole listing, then goes to the list", async () => {
    await openNew();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "  Luna " } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith("johanca", LUNA);
      expect(push).toHaveBeenCalledWith("/portal");
    });
    expect(uploadListingPhoto).not.toHaveBeenCalled();
  });

  it("moves the address onto the listing the POST answered with", async () => {
    // A reload has to keep editing what was created, and Back must not
    // resurrect the empty form and write a second animal.
    await openNew();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        `/portal/zival?zavetisce=johanca&id=${ID}`,
      );
    });
    expect(push).toHaveBeenCalledWith("/portal");
  });

  it("carries the answers that were given", async () => {
    await openNew();

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
      expect(createListing).toHaveBeenCalledWith("johanca", {
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

  it("keeps a status: tapping the chosen card again does not clear it", async () => {
    await openNew();

    const available = card(
      portalText.statusLegend,
      STATUS_META.available.label,
    );
    fireEvent.click(available);

    expect(available.getAttribute("aria-checked")).toBe("true");
  });

  it("does not claim a status was saved when there is none", () => {
    // The crawled page's lead says the status stayed behind; a listing that
    // has never been saved has nothing behind it at all.
    expect(portalText.leaveNewLead).not.toContain("Stanje");
    expect(portalText.leaveNewLead).toContain("se vpisano izgubi");
  });
});

describe("photos on a new listing", () => {
  it("holds picked files as previews until the listing exists", async () => {
    await openNew();

    pick(jpeg("a.jpg"), jpeg("b.jpg"));

    expect(uploadListingPhoto).not.toHaveBeenCalled();
    expect(photoImages().map((img) => img.getAttribute("src"))).toEqual([
      "blob:a.jpg",
      "blob:b.jpg",
    ]);
    // Work the shelter would lose, so leaving has to ask.
    fireEvent.click(cancelButton());
    expect(confirmShown()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a photo, before anything is sent", async () => {
    await openNew();

    pick(new File(["hello"], "notes.txt", { type: "text/plain" }));

    expect(
      screen.getByText(
        fill(portalText.photoTypeRejected, { name: "notes.txt" }),
      ),
    ).toBeTruthy();
    expect(uploadListingPhoto).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("refuses a file over 15 MB, before anything is sent", async () => {
    await openNew();

    const big = jpeg("big.jpg");
    Object.defineProperty(big, "size", { value: 15 * 1024 * 1024 + 1 });
    pick(big);

    expect(
      screen.getByText(fill(portalText.photoTooLarge, { name: "big.jpg" })),
    ).toBeTruthy();
    expect(photoImages()).toHaveLength(0);
  });

  it("drops a preview the shelter takes back, and its object URL with it", async () => {
    await openNew();

    pick(jpeg("a.jpg"));
    fireEvent.click(
      screen.getByRole("button", { name: portalText.photoRemove }),
    );

    expect(photoImages()).toHaveLength(0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:a.jpg");
  });

  it("uploads them one by one after the POST, and stays on the one that fails", async () => {
    const saved = listing();
    // The second file is held so the line about it can be read, then fails.
    let failSecond: (error: unknown) => void = () => {};
    vi.mocked(uploadListingPhoto)
      .mockResolvedValueOnce({ ...PHOTO, id: 1 })
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failSecond = reject;
          }),
      )
      .mockResolvedValueOnce({ ...PHOTO, id: 3 });
    await openNew();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    pick(jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"));
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith("johanca", LUNA);
      expect(uploadListingPhoto).toHaveBeenCalledTimes(2);
    });
    // Mid-sequence: the line says which one is going up, the bar is still
    // saving, and the page is already the created listing's.
    expect(
      screen.getByText(fill(portalText.photoUploading, { index: 2, total: 3 })),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: portalText.saving,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(nameBox().disabled).toBe(true);
    expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();

    failSecond(new PortalError(500));

    await waitFor(() => {
      expect(uploadListingPhoto).toHaveBeenCalledTimes(3);
    });
    const calls = vi.mocked(uploadListingPhoto).mock.calls;
    expect(calls.map(([, id]) => id)).toEqual([saved.id, saved.id, saved.id]);
    expect(calls.map(([, , file]) => file.name)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
    ]);

    // The third still went, the second is named with its retry, and the page
    // did not leave over a listing missing a photo.
    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.photoUploadFailed, { name: "b.jpg" })),
      ).toBeTruthy();
    });
    expect(push).not.toHaveBeenCalled();
    // The two that went up are the listing's own photos now; only the one
    // that failed is still a preview.
    expect(photoImages().map((img) => img.getAttribute("src"))).toEqual([
      PHOTO.url,
      PHOTO.url,
      "blob:b.jpg",
    ]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:a.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:c.jpg");

    fireEvent.click(
      screen.getByRole("button", { name: portalText.photoRetry }),
    );

    await waitFor(() => {
      expect(uploadListingPhoto).toHaveBeenCalledTimes(4);
      expect(
        screen.queryByText(
          fill(portalText.photoUploadFailed, { name: "b.jpg" }),
        ),
      ).toBeNull();
    });
    expect(vi.mocked(uploadListingPhoto).mock.calls[3][2].name).toBe("b.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:b.jpg");
  });

  it("goes to the list once every photo is up", async () => {
    await openNew();

    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    pick(jpeg("a.jpg"), jpeg("b.jpg"));
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(uploadListingPhoto).toHaveBeenCalledTimes(2);
      expect(push).toHaveBeenCalledWith("/portal");
    });
  });
});

describe("photos on an existing listing", () => {
  it("shows the stored ones, first first, and sizes each box", async () => {
    await open({ photos: [PHOTO, { ...PHOTO, id: 8 }] });

    const [first] = photoImages();
    expect(first.getAttribute("src")).toBe(PHOTO.url);
    expect(first.getAttribute("width")).toBe("1600");
    expect(first.getAttribute("height")).toBe("1200");
    expect(screen.getByText(new RegExp(portalText.photosHint))).toBeTruthy();
  });

  it("sends a picked file at once", async () => {
    let finish: (photo: PortalListingPhoto) => void = () => {};
    vi.mocked(uploadListingPhoto).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as (photo: PortalListingPhoto) => void;
        }),
    );
    await open({ photos: [PHOTO] });

    pick(jpeg("new.jpg"));

    expect(uploadListingPhoto).toHaveBeenCalledWith(
      "johanca",
      ID,
      expect.objectContaining({ name: "new.jpg" }),
    );
    expect(
      screen.getByText(fill(portalText.photoUploading, { index: 1, total: 1 })),
    ).toBeTruthy();
    // The typed fields stay open while a photo goes up; only the bar waits.
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
    // A 200: the portal recognised the bytes and answered the existing photo.
    vi.mocked(uploadListingPhoto).mockResolvedValue(PHOTO);
    await open({ photos: [PHOTO] });

    pick(jpeg("same.jpg"));

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:same.jpg");
    });
    expect(photoImages().map((img) => img.getAttribute("src"))).toEqual([
      PHOTO.url,
    ]);
  });

  it("removes a stored photo on the second tap, not the first", async () => {
    await open({ photos: [PHOTO] });

    const remove = screen.getByRole("button", {
      name: fill(portalText.photoRemoveLabel, { index: 1 }),
    });
    fireEvent.click(remove);

    expect(deleteListingPhoto).not.toHaveBeenCalled();
    expect(remove.textContent).toBe(portalText.photoRemoveConfirm);

    fireEvent.click(remove);

    await waitFor(() => {
      expect(deleteListingPhoto).toHaveBeenCalledWith("johanca", ID, 7);
    });
  });

  it("says so beside the grid when a remove fails", async () => {
    vi.mocked(deleteListingPhoto).mockRejectedValue(new PortalError(500));
    await open({ photos: [PHOTO] });

    const remove = screen.getByRole("button", {
      name: fill(portalText.photoRemoveLabel, { index: 1 }),
    });
    fireEvent.click(remove);
    fireEvent.click(remove);

    await waitFor(() => {
      expect(screen.getByText(portalText.photoRemoveError)).toBeTruthy();
    });
    // Once, beside the grid. The remove writes the listing's save slot, and
    // the bar must not repeat what the grid already says.
    expect(
      fieldRow("photos").contains(screen.getByText(portalText.photoRemoveError)),
    ).toBe(true);
    expect(saveBar().textContent).not.toContain(portalText.photoRemoveError);
  });

  it("says a failed upload beside the file alone, not in the bar", async () => {
    vi.mocked(uploadListingPhoto).mockRejectedValue(new PortalError(500));
    await open({ photos: [PHOTO] });

    pick(jpeg("new.jpg"));

    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.photoUploadFailed, { name: "new.jpg" })),
      ).toBeTruthy();
    });
    expect(saveBar().textContent).not.toContain(portalText.photoUploadError);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("editing a listing", () => {
  it("opens on the saved values with nothing to save", async () => {
    await open({
      breed: "mešanec",
      approximateAgeMonths: 27,
      goodWithKids: "yes",
    });

    expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
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
      card(
        portalText.fieldGoodWithKids,
        COMPATIBILITY_META.yes.label,
      ).getAttribute("aria-checked"),
    ).toBe("true");
    expect(saveButton().disabled).toBe(true);
  });

  it("puts the photos first and the status in the summary", async () => {
    await open();

    const sections = Array.from(document.querySelectorAll("form h2")).map(
      (heading) => heading.textContent,
    );
    expect(sections.slice(0, 3)).toEqual([
      portalText.fieldPhotos,
      portalText.sectionSearchable,
      portalText.sectionBasics,
    ]);
    // The status is a save of its own beside the form, not a row inside it.
    expect(screen.queryByRole("radiogroup", { name: portalText.statusLegend }))
      .toBeNull();
    expect(
      screen.getByRole("group", { name: portalText.statusLegend }),
    ).toBeTruthy();
  });

  it("sends the whole listing again with the change in it", async () => {
    await open({ goodWithKids: "yes" });

    fireEvent.click(card(portalText.fieldEnergy, ENERGY_META.calm.label));
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(updateListing).toHaveBeenCalledWith("johanca", ID, {
        ...LUNA,
        goodWithKids: "yes",
        energy: "calm",
      });
      expect(push).toHaveBeenCalledWith("/portal");
    });
  });

  it("saves a status from the summary the moment it is tapped", async () => {
    await open();

    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.statusLegend }),
      ).getByRole("button", { name: STATUS_META.reserved.label }),
    );

    await waitFor(() => {
      expect(updateListing).toHaveBeenCalledWith("johanca", ID, {
        ...LUNA,
        status: "reserved",
      });
    });
    // A status is not typed work: the page stays where it is.
    expect(push).not.toHaveBeenCalled();
  });

  it("does not undo a status the summary saved while the form was open", async () => {
    // The route is a full replace, and the status is not a row in this form.
    // The body has to carry what the record holds now, not what the draft was
    // built from.
    await open();
    vi.mocked(updateListing).mockResolvedValue({
      ...listing(),
      status: "reserved",
    });

    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.statusLegend }),
      ).getByRole("button", { name: STATUS_META.reserved.label }),
    );
    await waitFor(() => expect(updateListing).toHaveBeenCalledTimes(1));

    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(updateListing).toHaveBeenNthCalledWith(2, "johanca", ID, {
        ...LUNA,
        name: "Lunica",
        status: "reserved",
      });
    });
  });

  it("marks the searchable fields the saved listing leaves blank", async () => {
    await open({ energy: "calm" });

    expect(fieldRow("energy").textContent).not.toContain(
      portalText.missingBadge,
    );
    expect(fieldRow("goodWithKids").textContent).toContain(
      portalText.missingBadge,
    );
  });

  it("refuses to save without a name, and puts the focus on the box", async () => {
    await open();

    fireEvent.change(nameBox(), { target: { value: "  " } });
    fireEvent.click(saveButton());

    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.nameRequired);
    expect(nameBox().getAttribute("aria-invalid")).toBe("true");
    expect(nameBox().getAttribute("aria-errormessage")).toBe(message.id);
    expect(document.activeElement).toBe(nameBox());
    expect(updateListing).not.toHaveBeenCalled();

    // Typing a name retires the message.
    fireEvent.change(nameBox(), { target: { value: "Luna" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses to save without a species, under the species cards", async () => {
    await open();

    // Tapping the chosen card off is the one way to lose the species.
    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.click(saveButton());

    expect(fieldRow("species").textContent).toContain(
      portalText.speciesRequired,
    );
    expect(fieldRow("species").contains(document.activeElement)).toBe(true);
    expect(updateListing).not.toHaveBeenCalled();
  });

  it("keeps the age's message beside the boxes and focuses the one at fault", async () => {
    await open();

    fireEvent.change(screen.getByLabelText(portalText.fieldAgeMonthsUnit), {
      target: { value: "-3" },
    });
    fireEvent.click(saveButton());

    expect(
      fieldRow("approximateAgeMonths").contains(screen.getByRole("alert")),
    ).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByLabelText(portalText.fieldAgeMonthsUnit),
    );
  });

  it("shows the save that did not go through, once it has tried one", async () => {
    vi.mocked(updateListing).mockRejectedValue(new PortalError(500));
    await open();

    // Nothing has been submitted from here yet, so nothing here has failed.
    expect(screen.queryByText(portalText.saveError)).toBeNull();

    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        portalText.saveError,
      );
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("links to the public listing under the id ingest builds", async () => {
    await open();

    // The public site knows a manual listing as "<providerId>:<uuid>", which
    // is what its address is hashed from.
    expect(
      screen
        .getByRole("link", { name: portalText.publicListing })
        .getAttribute("href"),
    ).toMatch(/^\/zival\/luna-[0-9a-f]{6}\/kranj\/johanca$/);
    expect(breadcrumb().getAttribute("href")).toBe("/portal");
  });
});

describe("the row the address asked for", () => {
  it("takes the focus once the listing has arrived", async () => {
    signIn();
    search = new URLSearchParams({
      zavetisce: "johanca",
      id: ID,
      polje: "goodWithKids",
    });
    vi.mocked(fetchListings).mockResolvedValue([listing({ energy: "calm" })]);

    renderPage();

    await waitFor(() => {
      expect(fieldRow("goodWithKids").contains(document.activeElement)).toBe(
        true,
      );
    });
  });
});

describe("taking a listing off the site", () => {
  function archiveDialog(): HTMLElement {
    return screen.getByRole("alertdialog");
  }

  function archiveButton(): HTMLElement {
    return screen.getByRole("button", { name: portalText.listingArchive });
  }

  it("asks first, and says when the animal leaves the public site", async () => {
    await open();

    fireEvent.click(archiveButton());

    const dialog = archiveDialog();
    expect(
      within(dialog).getByText(
        fill(portalText.listingArchiveTitle, { name: "Luna" }),
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(portalText.listingArchiveLead),
    ).toBeTruthy();
    expect(archiveListing).not.toHaveBeenCalled();

    // The safe answer is the one the dialog opens on.
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: portalText.listingArchiveCancel,
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(archiveListing).not.toHaveBeenCalled();
  });

  it("archives on confirm and goes back to the list", async () => {
    await open();

    fireEvent.click(archiveButton());
    fireEvent.click(
      within(archiveDialog()).getByRole("button", {
        name: portalText.listingArchive,
      }),
    );

    await waitFor(() => {
      expect(archiveListing).toHaveBeenCalledWith("johanca", ID);
      expect(push).toHaveBeenCalledWith("/portal");
    });
  });

  it("stays on the page when the archive fails", async () => {
    vi.mocked(archiveListing).mockRejectedValue(new PortalError(500));
    await open();

    fireEvent.click(archiveButton());
    fireEvent.click(
      within(archiveDialog()).getByRole("button", {
        name: portalText.listingArchive,
      }),
    );

    await waitFor(() => expect(archiveListing).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(portalText.listingArchiveError)).toBeTruthy();
  });
});

describe("leaving with unsaved work", () => {
  it("holds Prekliči back and asks first", async () => {
    await open();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });

    fireEvent.click(cancelButton());

    expect(confirmShown()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("holds the breadcrumb back and asks first", async () => {
    await open();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });

    fireEvent.click(breadcrumb());

    expect(confirmShown()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves only once the shelter says to drop the work", async () => {
    await open();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    fireEvent.click(cancelButton());

    fireEvent.click(
      screen.getByRole("button", { name: portalText.discardChanges }),
    );

    expect(push).toHaveBeenCalledWith("/portal");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("goes back to the form when the shelter keeps editing", async () => {
    await open();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    fireEvent.click(cancelButton());

    fireEvent.click(
      screen.getByRole("button", { name: portalText.keepEditing }),
    );

    expect(confirmShown()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not ask when nothing was typed", async () => {
    await open();

    fireEvent.click(cancelButton());

    expect(confirmShown()).toBe(false);
    expect(push).toHaveBeenCalledWith("/portal");
  });
});

describe("work the shelter typed and did not save", () => {
  function description(): HTMLTextAreaElement {
    return screen.getByLabelText(
      portalText.fieldDescription,
    ) as HTMLTextAreaElement;
  }

  it("is waiting when the listing is opened again", async () => {
    const view = await open();
    fireEvent.change(description(), { target: { value: "Rada crklja." } });
    // Back, Forward and a reload all reach the form the same way: a fresh
    // mount reading the same session storage.
    view.unmount();

    await open();

    expect(description().value).toBe("Rada crklja.");
    expect(screen.getByText(portalText.draftResumed)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it("resumes a new listing under its own key", async () => {
    writeDraft(ACCOUNT, "johanca", "nova", { name: "Luna", species: "cat" });

    await openNew();

    expect(nameBox().value).toBe("Luna");
    expect(screen.getByText(portalText.draftResumed)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it("is dropped by the line's own Zavrzi, storage and all", async () => {
    const view = await open();
    fireEvent.change(description(), { target: { value: "Rada crklja." } });
    view.unmount();
    await open();

    fireEvent.click(
      screen.getByRole("button", { name: portalText.draftDiscardLabel }),
    );

    expect(description().value).toBe("");
    expect(screen.queryByText(portalText.draftResumed)).toBeNull();
    expect(saveButton().disabled).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("is gone once it has been saved", async () => {
    await open();
    fireEvent.change(description(), { target: { value: "Rada crklja." } });
    expect(window.sessionStorage.length).toBe(1);

    fireEvent.click(saveButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/portal"));
    expect(window.sessionStorage.length).toBe(0);
  });

  it("leaves no key behind for a form nobody typed in", async () => {
    await open();

    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("a box the browser could not read", () => {
  // Chromium reports "2-1" in a number box as an empty value with
  // validity.badInput set. Read as empty, "2-1 let, 3 mesece" would go out as
  // three months, and a year of 0001 in the date box would clear the date.
  it("does not save the rest of the age as the whole of it", async () => {
    await open({ approximateAgeMonths: 24 });
    fireEvent.change(monthsBox(), { target: { value: "3" } });

    typeUnreadable(yearsBox());
    fireEvent.click(saveButton());

    expect(updateListing).not.toHaveBeenCalled();
    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.invalidError);
    expect(fieldRow("approximateAgeMonths").contains(message)).toBe(true);
    // The box at fault, and only that one.
    expect(yearsBox().getAttribute("aria-invalid")).toBe("true");
    expect(yearsBox().getAttribute("aria-errormessage")).toBe(message.id);
    expect(monthsBox().getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(yearsBox());
    expect(yearsBox().scrollIntoView).toHaveBeenCalled();
  });

  it("is work: Shrani stays on and leaving asks", async () => {
    await open({ approximateAgeMonths: 24 });

    typeUnreadable(yearsBox());

    // Nothing the PUT could carry, but something the shelter typed.
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(cancelButton());
    expect(confirmShown()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not clear a birth date it could not read", async () => {
    await open({ birthDate: "2020-05-01" });

    typeUnreadable(dateBox());
    fireEvent.click(saveButton());

    expect(updateListing).not.toHaveBeenCalled();
    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.birthDateError);
    expect(fieldRow("birthDate").contains(message)).toBe(true);
    expect(dateBox().getAttribute("aria-invalid")).toBe("true");
    expect(dateBox().getAttribute("aria-errormessage")).toBe(message.id);
    expect(yearsBox().getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(dateBox());
  });

  it("is not a change and is not mirrored", async () => {
    await open({ approximateAgeMonths: 27, birthDate: "2020-05-01" });

    typeUnreadable(yearsBox());
    typeUnreadable(dateBox());

    // Nothing stored for the next visit to send as an emptied box, and no
    // row claims a value is going anywhere.
    expect(screen.queryByText(portalText.willRevert)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);

    // Reading again with the record's own values is not a change either.
    makeUnreadable(yearsBox(), false);
    fireEvent.change(yearsBox(), { target: { value: "2" } });
    makeUnreadable(dateBox(), false);
    fireEvent.change(dateBox(), { target: { value: "2020-05-01" } });

    expect(window.sessionStorage.length).toBe(0);
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(cancelButton());
    expect(confirmShown()).toBe(false);
  });

  it("saves again once the box reads", async () => {
    await open({ approximateAgeMonths: 24 });
    typeUnreadable(yearsBox());
    fireEvent.click(saveButton());
    expect(screen.queryByRole("alert")).not.toBeNull();

    makeUnreadable(yearsBox(), false);
    fireEvent.change(yearsBox(), { target: { value: "3" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(updateListing).toHaveBeenCalledWith("johanca", ID, {
        ...LUNA,
        approximateAgeMonths: 36,
      });
    });
  });

  it("is noticed from the input event when the value does not move", async () => {
    // "e" typed into the empty months box: "" before and "" after, so React
    // fires no change event. The input event still carries the flag.
    await open();
    makeUnreadable(monthsBox());

    fireEvent.input(monthsBox(), { target: { value: "" } });
    fireEvent.click(saveButton());

    expect(updateListing).not.toHaveBeenCalled();
    expect(monthsBox().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(monthsBox());
  });

  it("is emptied by the line's Zavrzi along with the stored draft", async () => {
    const view = await open();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    view.unmount();
    await open();
    makeUnreadable(monthsBox());
    fireEvent.input(monthsBox(), { target: { value: "" } });

    fireEvent.click(
      screen.getByRole("button", { name: portalText.draftDiscardLabel }),
    );

    expect(nameBox().value).toBe("Luna");
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(cancelButton());
    expect(confirmShown()).toBe(false);
  });
});

describe("a value the animal could not have", () => {
  it("refuses a birth date in the future at the box", async () => {
    await open();

    fireEvent.change(dateBox(), { target: { value: tomorrow() } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());

    expect(updateListing).not.toHaveBeenCalled();
    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.birthDateError);
    expect(fieldRow("birthDate").contains(message)).toBe(true);
    expect(dateBox().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(dateBox());
  });

  it("refuses a birth date before 1900", async () => {
    await open();

    fireEvent.change(dateBox(), { target: { value: "1899-12-31" } });
    fireEvent.click(saveButton());

    expect(updateListing).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      portalText.birthDateError,
    );
  });

  it("takes the date's message down once the date is typed again", async () => {
    await open();
    fireEvent.change(dateBox(), { target: { value: "1899-12-31" } });
    fireEvent.click(saveButton());
    expect(screen.queryByRole("alert")).not.toBeNull();

    // Another field is not an answer to a date that is still wrong.
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    expect(screen.queryByRole("alert")).not.toBeNull();

    fireEvent.change(dateBox(), { target: { value: "2020-05-01" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses an age past a hundred years at the years box", async () => {
    await open();

    fireEvent.change(yearsBox(), { target: { value: "150" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());

    expect(updateListing).not.toHaveBeenCalled();
    expect(yearsBox().getAttribute("aria-invalid")).toBe("true");
    expect(monthsBox().getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(yearsBox());
  });

  it("refuses the same on a listing that does not exist yet", async () => {
    await openNew();
    fireEvent.click(card(portalText.fieldSpecies, SPECIES_META.cat.label));
    fireEvent.change(nameBox(), { target: { value: "Luna" } });

    fireEvent.change(dateBox(), { target: { value: tomorrow() } });
    fireEvent.click(saveButton());

    expect(createListing).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      portalText.birthDateError,
    );
  });
});

describe("what the text boxes take", () => {
  it("carries the API's limits as maxLength", async () => {
    // The same numbers as ListingIn in apps/portal/core/schemas.py.
    await open();

    expect(nameBox().maxLength).toBe(200);
    expect(
      (screen.getByLabelText(portalText.fieldBreed) as HTMLInputElement)
        .maxLength,
    ).toBe(200);
    expect(
      (
        screen.getByLabelText(
          portalText.fieldDescription,
        ) as HTMLTextAreaElement
      ).maxLength,
    ).toBe(2000);
  });
});

describe("a stored draft this form cannot use", () => {
  it("falls back to the record for the parts it drops", async () => {
    // A deploy can change the shape of a draft while a tab is still open on
    // the old one, and the tab's storage is not ours alone.
    writeDraft(ACCOUNT, "johanca", ID, {
      name: null,
      sex: "banana",
      ageYears: "3",
      photos: [PHOTO],
      pending: [{ key: 1 }],
    });

    await open({ sex: "female" });

    expect(nameBox().value).toBe("Luna");
    expect(
      card(portalText.fieldSex, SEX_META.female.label).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(yearsBox().value).toBe("3");
    expect(photoImages()).toHaveLength(0);
  });
});

describe("a save that did not go through", () => {
  async function failOnce() {
    vi.mocked(updateListing).mockRejectedValue(new PortalError(500));
    await open();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        portalText.saveError,
      );
    });
    return screen.getByRole("alert");
  }

  it("is said in the save bar, beside Shrani, and takes the focus", async () => {
    const message = await failOnce();

    // The bar is on screen wherever the shelter pressed from, on both
    // layouts; the foot of the form was a screen away from the fixed bar.
    expect(saveBar().contains(message)).toBe(true);
    expect(saveBar().contains(saveButton())).toBe(true);
    expect(message.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(message);
    expect(message.scrollIntoView).toHaveBeenCalled();
  });

  it("is taken down once the shelter edits a field", async () => {
    await failOnce();

    fireEvent.change(
      screen.getByLabelText(portalText.fieldBreed),
      { target: { value: "mešanec" } },
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("comes back for a second failure", async () => {
    await failOnce();
    fireEvent.change(
      screen.getByLabelText(portalText.fieldBreed),
      { target: { value: "mešanec" } },
    );
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        portalText.saveError,
      );
    });
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("is said under the status buttons when a status tap fails", async () => {
    await open();
    vi.mocked(updateListing).mockRejectedValue(new PortalError(500));

    const statuses = screen.getByRole("group", {
      name: portalText.statusLegend,
    });
    fireEvent.click(
      within(statuses).getByRole("button", {
        name: STATUS_META.reserved.label,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        portalText.saveError,
      );
    });
    const message = screen.getByRole("alert");
    expect(statuses.closest("aside")?.contains(message)).toBe(true);
    expect(saveBar().contains(message)).toBe(false);
    // The Shrani that was never pressed did not fail.
    expect(saveButton().disabled).toBe(true);
  });

  it("is said under Odstrani objavo when the archive fails, not in the bar", async () => {
    vi.mocked(archiveListing).mockRejectedValue(new PortalError(500));
    await open();

    fireEvent.click(
      screen.getByRole("button", { name: portalText.listingArchive }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: portalText.listingArchive,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(portalText.listingArchiveError)).toBeTruthy();
    });
    expect(saveBar().textContent).not.toContain(portalText.listingArchiveError);
  });
});

describe("the breadcrumb", () => {
  it("goes inert while a save is on its way", async () => {
    await open();
    saveHangs();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: portalText.saving }),
      ).toBeTruthy(),
    );

    const link = breadcrumb();
    expect(link.getAttribute("aria-disabled")).toBe("true");
    const proceeded = fireEvent.click(link);

    expect(proceeded).toBe(false);
    expect(confirmShown()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("a submit while a save is on its way", () => {
  it("does not send the body twice", async () => {
    await open();
    saveHangs();
    fireEvent.change(nameBox(), { target: { value: "Lunica" } });

    // Two submits in one task, before React has drawn the saving state: the
    // bar is not disabled yet, so only the page's own guard stands between
    // the second one and the wire.
    const form = nameBox().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    expect(updateListing).toHaveBeenCalledTimes(1);
  });
});

describe("taking an icon answer back", () => {
  it("reaches the wire as not stated", async () => {
    // A listing has no crawled value under a row, so tapping the chosen card
    // off is a real answer: the PUT carries the null.
    await open({ goodWithKids: "yes" });

    const yes = card(portalText.fieldGoodWithKids, COMPATIBILITY_META.yes.label);
    fireEvent.click(yes);

    expect(yes.getAttribute("aria-checked")).toBe("false");
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(updateListing).toHaveBeenCalledWith("johanca", ID, {
        ...LUNA,
        goodWithKids: null,
      });
    });
  });
});
