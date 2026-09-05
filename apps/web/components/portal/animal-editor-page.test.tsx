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
import { AnimalEditorPage } from "@/components/portal/animal-editor-page";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  SPECIAL_NEEDS_META,
} from "@/components/portal/portal-fields";
import { PortalProvider } from "@/components/portal/portal-provider";
import { portalText } from "@/components/portal/portal-text";
import { PortalWorkspace } from "@/components/portal/portal-workspace";
import {
  PortalError,
  fetchAnimals,
  fetchSession,
  saveAnimal,
  type PortalAnimal,
  type PortalShelter,
} from "@/lib/portal-api";

// The address is the page's only argument, so the tests set it the way a
// visitor would and the mock reads it back at every render.
let search = new URLSearchParams();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/portal/zival",
  useRouter: () => ({
    push,
    replace: vi.fn(),
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
  saveAnimal: vi.fn(),
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

// jsdom lays nothing out and has neither of these. The page scrolls to the
// row it was sent to, and scrolls a rejected age box back into view.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

beforeEach(() => {
  // A draft outlives the page it was typed on, on purpose, so each test has
  // to start in a tab that has never been used.
  window.sessionStorage.clear();
  search = new URLSearchParams({ zavetisce: "testno", id: "testno:1" });
  push.mockReset();
  vi.mocked(fetchSession).mockReset();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(saveAnimal).mockReset();
});

const SHELTER: PortalShelter = {
  slug: "testno",
  name: "Zavetišče Testno",
  city: "Ljubljana",
};

const SECOND: PortalShelter = {
  slug: "drugo",
  name: "Zavetišče Drugo",
  city: "Kranj",
};

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

function signIn(shelters: PortalShelter[] = [SHELTER]) {
  vi.mocked(fetchSession).mockResolvedValue({
    email: "info@zavetisce.si",
    shelters,
  });
}

function renderPage() {
  return render(
    <PortalProvider>
      <AnimalEditorPage />
    </PortalProvider>,
  );
}

/** The page with its animal loaded and the form on screen. */
async function open(overrides: Partial<PortalAnimal> = {}) {
  signIn();
  vi.mocked(fetchAnimals).mockResolvedValue([animal(overrides)]);
  vi.mocked(saveAnimal).mockResolvedValue(animal(overrides));
  const view = renderPage();
  await waitFor(() => expect(document.getElementById("portal-name")).toBeTruthy());
  return view;
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

function fieldRow(name: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (!found) throw new Error(`no row for ${name}`);
  return found;
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

/** Types something, so the form has work in it that leaving would lose. */
function makeDirty() {
  fireEvent.change(field("portal-name"), { target: { value: "Murka" } });
}

function confirmShown(): boolean {
  return screen.queryByText(portalText.leaveTitle) !== null;
}

describe("finding the animal the address names", () => {
  it("waits for the list before calling an id unknown", async () => {
    signIn();
    search = new URLSearchParams({ zavetisce: "testno", id: "testno:404" });
    let deliver: (animals: PortalAnimal[]) => void = () => {};
    vi.mocked(fetchAnimals).mockReturnValue(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(portalText.loading)).toBeTruthy();
    });
    // The animal is not in a list that has not arrived, which is not the same
    // as not being there.
    expect(screen.queryByText(portalText.editorNotFoundTitle)).toBeNull();

    deliver([animal()]);

    await waitFor(() => {
      expect(screen.getByText(portalText.editorNotFoundTitle)).toBeTruthy();
    });
    expect(
      screen.getByRole("link", { name: portalText.backToList }),
    ).toBeTruthy();
  });

  it("answers a shelter the account does not have at once", async () => {
    signIn();
    search = new URLSearchParams({ zavetisce: "tuje", id: "tuje:1" });
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(portalText.editorNotFoundTitle)).toBeTruthy();
    });
    // Nothing was read for a shelter that is not the account's.
    expect(fetchAnimals).not.toHaveBeenCalledWith("tuje");
  });

  it("says so when the list itself will not load", async () => {
    signIn();
    vi.mocked(fetchAnimals).mockRejectedValue(new PortalError(500));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(portalText.listErrorTitle)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: portalText.retry })).toBeTruthy();
  });

  it("opens under the shelter the address names, not the first one", async () => {
    // What a reload on this page has to do: the account holds two shelters
    // and the animal belongs to the second.
    signIn([SHELTER, SECOND]);
    search = new URLSearchParams({ zavetisce: "drugo", id: "drugo:7" });
    vi.mocked(fetchAnimals).mockImplementation(async (slug) =>
      slug === "drugo" ? [animal({ id: "drugo:7", name: "Bela" })] : [animal()],
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Bela" })).toBeTruthy();
    });
    expect(fetchAnimals).toHaveBeenCalledWith("drugo");
  });
});

describe("leaving with unsaved work", () => {
  it("holds Prekliči back and asks first", async () => {
    await open();
    makeDirty();

    fireEvent.click(cancelButton());

    expect(confirmShown()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("holds the breadcrumb back and asks first", async () => {
    await open();
    makeDirty();

    fireEvent.click(breadcrumb());

    expect(confirmShown()).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves only once the shelter says to drop the work", async () => {
    await open();
    makeDirty();
    fireEvent.click(cancelButton());

    fireEvent.click(
      screen.getByRole("button", { name: portalText.discardChanges }),
    );

    expect(push).toHaveBeenCalledWith("/portal");
  });

  it("goes back to the form when the shelter keeps editing", async () => {
    await open();
    makeDirty();
    fireEvent.click(cancelButton());

    fireEvent.click(
      screen.getByRole("button", { name: portalText.keepEditing }),
    );

    expect(confirmShown()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("leaves the page standing when Escape dismisses the confirm", async () => {
    await open();
    makeDirty();
    fireEvent.click(cancelButton());
    expect(confirmShown()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(confirmShown()).toBe(false));
    expect(screen.getByRole("heading", { name: "Muri" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not ask when nothing was typed", async () => {
    await open();

    fireEvent.click(cancelButton());

    expect(confirmShown()).toBe(false);
    expect(push).toHaveBeenCalledWith("/portal");
  });

  it("says that the status is already saved and only text is at stake", () => {
    // The two halves of what leaving costs, in one sentence each, because
    // the status buttons on this page saved the moment they were tapped.
    expect(portalText.leaveLead).toContain("se vpisano izgubi");
    expect(portalText.leaveLead).toContain("shranilo takoj");
  });

  it("does not ask after the work has been saved", async () => {
    await open();
    makeDirty();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
        name: "Murka",
      });
      expect(push).toHaveBeenCalledWith("/portal");
    });
    expect(confirmShown()).toBe(false);
  });
});

describe("what a field tells a screen reader", () => {
  it("points every control at its own hint", async () => {
    await open();

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

  it("names the error message from the age box that carries the fault", async () => {
    await open();

    fireEvent.change(field("portal-age-years"), { target: { value: "1.5" } });
    fireEvent.click(saveButton());

    const message = screen.getByRole("alert");
    expect(message.textContent).toContain(portalText.invalidError);
    const years = field("portal-age-years");
    expect(years.getAttribute("aria-invalid")).toBe("true");
    expect(years.getAttribute("aria-errormessage")).toBe(message.id);
  });

  it("keeps the age's message beside the boxes it is about", async () => {
    await open();

    fireEvent.change(field("portal-age-years"), { target: { value: "1.5" } });
    fireEvent.click(saveButton());

    // At the foot of the page it is a screen below the boxes, which is why
    // the submit had to scroll the box back into view to be read at all.
    expect(
      fieldRow("approximateAgeMonths").contains(screen.getByRole("alert")),
    ).toBe(true);
  });

  it("moves the focus off the save bar onto the rejected box", async () => {
    await open();

    fireEvent.change(field("portal-age-months"), { target: { value: "-3" } });
    fireEvent.click(saveButton());

    expect(document.activeElement).toBe(field("portal-age-months"));
  });

  it("holds the age's message until an age box is the thing that changed", async () => {
    await open();

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
  it("lets a mis-tap on an animal with nothing saved be tapped off", async () => {
    await open();

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
    await open({ goodWithKids: "yes", overrides: { goodWithKids: "yes" } });

    const yes = within(row(portalText.fieldGoodWithKids)).getByRole("radio", {
      name: COMPATIBILITY_META.yes.label,
    });
    fireEvent.click(yes);

    expect(screen.getByText(portalText.willRevert)).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
        goodWithKids: null,
      });
    });
  });
});

describe("the special needs flag", () => {
  // The field is a boolean in the schema and on the wire. A third card said
  // "Ni znano" and saved nothing, so it lit up and left Shrani disabled.
  it("offers the two answers it actually has", async () => {
    await open();

    const cards = within(row(portalText.fieldSpecialNeeds)).getAllByRole(
      "radio",
    );

    expect(cards.map((card) => card.textContent)).toEqual([
      COMPATIBILITY_META.yes.label,
      COMPATIBILITY_META.no.label,
    ]);
  });

  it("saves the answer that is tapped", async () => {
    await open();

    fireEvent.click(
      within(row(portalText.fieldSpecialNeeds)).getByRole("radio", {
        name: COMPATIBILITY_META.no.label,
      }),
    );
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
        specialNeeds: false,
      });
    });
  });
});

describe("what a row the shelter has changed says for itself", () => {
  it("explains the way back under the control, not in a hover title", async () => {
    await open({ name: "Murka", overrides: { name: "Murka" } });

    expect(
      within(fieldRow("name")).getByText(portalText.fieldOwnLine),
    ).toBeTruthy();
  });

  it("drops the line once the row is set to be given back", async () => {
    await open({ name: "Murka", overrides: { name: "Murka" } });

    fireEvent.change(field("portal-name"), { target: { value: "" } });

    expect(screen.queryByText(portalText.fieldOwnLine)).toBeNull();
    expect(screen.getByText(portalText.willRevert)).toBeTruthy();
  });

  it("says nothing on a row that is still the crawler's", async () => {
    await open();

    expect(screen.queryByText(portalText.fieldOwnLine)).toBeNull();
  });
});

describe("a choice that gives the field back to the crawler", () => {
  function revertButton(name: string): HTMLElement | null {
    return within(fieldRow(name)).queryByRole("button", { name: /^Povrni/ });
  }

  it("reads a cleared Posebne potrebe as a revert", async () => {
    // specialNeeds is a boolean on the wire, so the row has the two answers
    // it actually has and no third card. Taking the answer back is what
    // reaches the wire as the null that clears the override, the same as an
    // emptied box elsewhere in the form.
    await open({ specialNeeds: true, overrides: { specialNeeds: true } });
    expect(
      within(fieldRow("specialNeeds")).getByText(portalText.edited),
    ).toBeTruthy();

    fireEvent.click(
      within(fieldRow("specialNeeds")).getByRole("radio", {
        name: SPECIAL_NEEDS_META.yes.label,
      }),
    );

    expect(
      within(fieldRow("specialNeeds")).getByText(portalText.willRevert),
    ).toBeTruthy();
    // And the button is gone: it offers an action already queued.
    expect(revertButton("specialNeeds")).toBeNull();
  });

  it("leaves an unoverridden Posebne potrebe alone", async () => {
    // Nothing to give back, so clearing the row is only an answer withdrawn.
    await open({ specialNeeds: true });

    fireEvent.click(
      within(fieldRow("specialNeeds")).getByRole("radio", {
        name: SPECIAL_NEEDS_META.yes.label,
      }),
    );

    expect(
      within(fieldRow("specialNeeds")).queryByText(portalText.willRevert),
    ).toBeNull();
  });

  it("still reads an emptied box as a revert", async () => {
    await open({ name: "Muri", overrides: { name: "Muri" } });

    fireEvent.change(field("portal-name"), { target: { value: "" } });

    expect(within(fieldRow("name")).getByText(portalText.willRevert)).toBeTruthy();
    expect(revertButton("name")).toBeNull();
  });
});

describe("the row the address asked for", () => {
  it("takes the focus once the animal has arrived", async () => {
    signIn();
    search = new URLSearchParams({
      zavetisce: "testno",
      id: "testno:1",
      polje: "goodWithKids",
    });
    vi.mocked(fetchAnimals).mockResolvedValue([animal({ energy: "calm" })]);

    renderPage();

    await waitFor(() => {
      expect(fieldRow("goodWithKids").contains(document.activeElement)).toBe(
        true,
      );
    });
  });

  it("is ignored when it names nothing the form has", async () => {
    signIn();
    search = new URLSearchParams({
      zavetisce: "testno",
      id: "testno:1",
      polje: "nekaj-drugega",
    });
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);

    renderPage();

    await waitFor(() =>
      expect(document.getElementById("portal-name")).toBeTruthy(),
    );
    expect(document.activeElement).toBe(document.body);
  });
});

describe("a status saved from the summary", () => {
  it("keeps what has been typed into the form", async () => {
    // The save answers with a new animal object. The draft is the shelter's
    // own work and belongs to the animal's id, not to that object, or a tap
    // on Rezerviran would silently empty the description they were writing.
    await open();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({ status: "reserved", overrides: { status: "reserved" } }),
    );

    fireEvent.change(field("portal-description"), {
      target: { value: "Rada crklja." },
    });
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.statusLegend }),
      ).getByRole("button", { name: "Rezerviran" }),
    );

    await waitFor(() => {
      expect(screen.getByText(portalText.statusOwnLine)).toBeTruthy();
    });
    expect((field("portal-description") as HTMLTextAreaElement).value).toBe(
      "Rada crklja.",
    );

    // And the patch the form would still send is the typed one, not an empty
    // one: the base values were re-read off the animal the save answered with.
    vi.mocked(saveAnimal).mockClear();
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
        shortDescription: "Rada crklja.",
      });
    });
  });
});

describe("a failure left behind by the list's status buttons", () => {
  // saveStates is one slot per animal, shared with the card's status row, and
  // an error in it never expires.
  function Swap() {
    const [editing, setEditing] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setEditing(true)}>
          uredi
        </button>
        {editing ? <AnimalEditorPage /> : <PortalWorkspace />}
      </>
    );
  }

  it("stays out of a form that has not saved anything yet", async () => {
    signIn();
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);
    vi.mocked(saveAnimal).mockRejectedValue(new PortalError(500));

    render(
      <PortalProvider>
        <Swap />
      </PortalProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Muri" })).toBeTruthy();
    });

    // A status tap on the card fails, and the shelter opens the editor after
    // it. Nothing here has been submitted, so nothing here has failed.
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.statusLegend }),
      ).getByRole("button", { name: "Rezerviran" }),
    );
    await waitFor(() => {
      expect(screen.getByText(portalText.saveError)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "uredi" }));

    await waitFor(() =>
      expect(document.getElementById("portal-name")).toBeTruthy(),
    );
    expect(screen.queryByText(portalText.saveError)).toBeNull();
  });

  it("is shown once the page's own save has failed", async () => {
    signIn();
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);
    vi.mocked(saveAnimal).mockRejectedValue(new PortalError(500));
    renderPage();
    await waitFor(() =>
      expect(document.getElementById("portal-name")).toBeTruthy(),
    );

    makeDirty();
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        portalText.saveError,
      );
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("work the shelter typed and did not save", () => {
  function description(): HTMLTextAreaElement {
    return field("portal-description") as HTMLTextAreaElement;
  }

  it("is waiting when the page is opened again", async () => {
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

  it("is dropped when the shelter leaves and confirms", async () => {
    await open();
    fireEvent.change(description(), { target: { value: "Rada crklja." } });
    fireEvent.click(cancelButton());

    fireEvent.click(
      screen.getByRole("button", { name: portalText.discardChanges }),
    );

    expect(window.sessionStorage.length).toBe(0);
  });

  it("is kept when the shelter goes back to editing", async () => {
    await open();
    fireEvent.change(description(), { target: { value: "Rada crklja." } });
    fireEvent.click(cancelButton());

    fireEvent.click(
      screen.getByRole("button", { name: portalText.keepEditing }),
    );

    expect(window.sessionStorage.length).toBe(1);
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

describe("what the summary says beside the form", () => {
  it("ticks off the filters the animal already answers", async () => {
    await open({ energy: "calm" });

    const checklist = screen
      .getByText(portalText.searchableLead)
      .closest("div") as HTMLElement;
    expect(within(checklist).getByText(portalText.fieldEnergy)).toBeTruthy();
    expect(
      within(checklist).getByText(portalText.fieldApartmentOk),
    ).toBeTruthy();
  });

  it("says so once all five are answered", async () => {
    await open({
      energy: "calm",
      goodWithKids: "yes",
      goodWithDogs: "no",
      goodWithCats: "unknown",
      apartmentOk: "yes",
    });

    expect(screen.getByText(portalText.searchableDone)).toBeTruthy();
    expect(screen.queryByText(portalText.searchableLead)).toBeNull();
  });

  it("carries the same status control the card has", async () => {
    await open();

    // The crawl's reading, drawn as inherited and offered for confirming,
    // exactly as on the list.
    expect(screen.getByText(portalText.statusFromSiteLine)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: portalText.statusConfirmLabel }),
    ).toBeTruthy();
  });

  it("links to the public listing and to the list it came from", async () => {
    await open();

    expect(
      screen
        .getByRole("link", { name: portalText.publicListing })
        .getAttribute("href"),
    ).toMatch(/^\/zival\/muri-[0-9a-f]{6}\/ljubljana\/testno$/);
    expect(breadcrumb().getAttribute("href")).toBe("/portal");
  });
});
