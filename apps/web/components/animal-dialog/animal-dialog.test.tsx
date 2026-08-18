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
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalGrid } from "@/components/animal-grid";
import { I18nProvider } from "@/components/i18n-provider";

// The filter dock and the drawer read the viewport before they render, and
// the dismiss gesture asks whether it is on the phone layout. jsdom reports
// 1024px, so only the phone query is answered yes here.
const PHONE_LAYOUT = "(max-width: 639px)";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === PHONE_LAYOUT,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function animal(id: string, name: string, rest: Partial<Animal> = {}): Animal {
  return {
    id,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
    name,
    species: "cat",
    status: "available",
    images: [],
    attribution: "Foto: Zavetišče Test",
    ...rest,
  };
}

function photos(id: string, count: number): Animal["images"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
    cachedUrl: `/media/${id}-${index + 1}.jpg`,
    rights: "cache-permitted" as const,
  }));
}

// The one with everything filled in, and the only one with an intake date, so
// it sorts first and the list has a known order.
const REX = animal("rex", "Rex", {
  species: "dog",
  sex: "male",
  breed: "Mešanec",
  approximateAgeMonths: 24,
  size: "medium",
  intakeDate: "2025-01-15",
  originMunicipality: "Kamnik",
  medical: { neutered: true },
  images: photos("rex", 2),
  shortDescription: "Prijazen pes.\nRad teka.",
  attribution: "Foto in opis: Zavetišče Test",
});

const MURI = animal("muri", "Muri", { sex: "female", status: "reserved" });

// More photos than the fan shows at once, so the window has to walk.
const MANY = animal("pika", "Pika", { images: photos("pika", 7) });

const ADOPTED = animal("lucky", "Lucky", { status: "adopted" });

const ANIMALS = [REX, MURI];

// Ages are measured from the dataset's build time, not the clock, so the
// prerendered HTML and the hydrated page cannot disagree.
const REFERENCE = "2026-08-18T00:00:00.000Z";

function renderGrid(animals: Animal[] = ANIMALS) {
  return render(
    <I18nProvider locale="sl">
      <AnimalGrid animals={animals} logoIds={[]} referenceDate={REFERENCE} />
    </I18nProvider>,
  );
}

// The fan and the phone thumbnails label their photos the same way, and both
// are in the tree at once because the breakpoint is pure CSS.
function slot(root: HTMLElement, name: string) {
  const found = root.querySelector(`[data-slot="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${name}`);
  return found;
}

function region(dialog: HTMLElement, name: string) {
  return within(slot(dialog, name));
}

// The photo already in front is labelled as the way into the lightbox, the
// rest as the way to the front, so both are matched on their number.
function photoButton(dialog: HTMLElement, name: string, n: number) {
  return region(dialog, name).getByRole("button", {
    name: new RegExp(`fotografijo ${n}\\b`),
  });
}

function animalDialog() {
  return screen.getAllByRole("dialog")[0] as HTMLElement;
}

// jsdom has no PointerEvent, and the Event it falls back to drops clientY and
// pointerType, so the gesture is built on MouseEvent by hand. React listens by
// event name, so the pointer handlers still receive these. Pointer capture is
// likewise absent, and the dialog only calls it when it exists.
function pointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { x: number; y: number; pointerType: string },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
  });
  Object.defineProperty(event, "pointerType", { value: init.pointerType });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(element, event);
}

function drag(
  element: HTMLElement,
  distance: number,
  pointerType: "touch" | "mouse" = "touch",
) {
  pointer(element, "pointerdown", { x: 100, y: 80, pointerType });
  pointer(element, "pointermove", { x: 104, y: 80 + distance / 2, pointerType });
  pointer(element, "pointermove", { x: 104, y: 80 + distance, pointerType });
  pointer(element, "pointerup", { x: 104, y: 80 + distance, pointerType });
}

// The gallery surface and the text block are two links to the same place.
function cardLink(name: string) {
  return screen.getByRole("link", { name: `Odpri podrobnosti o ${name}` });
}

function openCard(name: string) {
  const link = cardLink(name);
  link.focus();
  fireEvent.click(link);
  return link;
}

describe("animal dialog", () => {
  it("opens from a card click and puts the animal in the URL", async () => {
    renderGrid();
    openCard("Rex");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Rex")).toBeTruthy();
    expect(window.location.search).toBe("?zival=rex");
    expect(window.history.state?.zival).toBe(true);
  });

  it("drops the pushed history entry when the card close is used", async () => {
    renderGrid();
    openCard("Rex");
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(slot(dialog, "dialog-close-card"));
    });

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("strips the param in place when a deep link is closed over the photo", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(slot(dialog, "dialog-close-photo"));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
  });

  it("opens straight from a shared link", async () => {
    window.history.replaceState(null, "", "/?zival=muri");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Muri")).toBeTruthy();
  });

  it("cleans up an id no animal answers to", async () => {
    window.history.replaceState(null, "", "/?zival=ni-me");
    renderGrid();

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cardLink("Rex")).toBeTruthy();
  });

  it("survives a filter that hides it, without its list", async () => {
    renderGrid();
    openCard("Muri");
    await screen.findByRole("dialog");

    // The rest of the page is hidden from assistive tech while the dialog is
    // open, so the species tab has to be asked for by name including hidden.
    fireEvent.click(screen.getByRole("button", { name: /Psi/, hidden: true }));

    await waitFor(() =>
      expect(window.location.search).toBe("?vrsta=pes&zival=muri"),
    );
    // Filtered out of the grid, still open: a shared link outranks the tab.
    const dialog = animalDialog();
    expect(dialog).toBeTruthy();
    // With the animal off the list there is nothing to step through.
    expect(
      within(dialog).queryByRole("button", { name: "Prejšnja žival" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Naslednja žival" }),
    ).toBeNull();
  });

  it("returns focus to the card it was opened from", async () => {
    renderGrid();
    const link = openCard("Rex");
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it("falls back to the shelter photo note when nothing may be shown", async () => {
    window.history.replaceState(null, "", "/?zival=muri");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Fotografija na strani zavetišča"),
    ).toBeTruthy();
  });

  it("badges a reserved animal but leaves an available one unbadged", async () => {
    window.history.replaceState(null, "", "/?zival=muri");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("rezerviran")).toBeTruthy();
  });

  it("shows the attribution, the shelter link and the animal's own facts", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Foto in opis: Zavetišče Test"),
    ).toBeTruthy();
    expect(within(dialog).getByText("Sterilizacija")).toBeTruthy();
    expect(within(dialog).queryByText("na voljo")).toBeNull();

    const cta = within(dialog).getByRole("link", {
      name: /Odpri objavo pri zavetišču/,
    });
    expect(cta.getAttribute("href")).toBe("https://example.test/animals/rex");
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toBe("noreferrer");
  });

  it("enlarges the photo that was clicked and moves the count onto it", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const first = photoButton(dialog, "photo-spread", 1);

    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(within(first).getByText("1 / 2")).toBeTruthy();

    fireEvent.click(photoButton(dialog, "photo-spread", 2));

    expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
      .toBe("false");
    const second = photoButton(dialog, "photo-spread", 2);
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(within(second).getByText("2 / 2")).toBeTruthy();
  });

  it("moves the phone hero to the thumbnail that was tapped", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const hero = () => region(dialog, "photo-hero").getByRole("img");

    expect(hero().getAttribute("src")).toContain("rex-1");

    fireEvent.click(photoButton(dialog, "photo-thumbs", 2));

    expect(hero().getAttribute("src")).toContain("rex-2");
    expect(photoButton(dialog, "photo-thumbs", 2).getAttribute("aria-pressed"))
      .toBe("true");
  });

  it("caps the fan at five photos and keeps the rest reachable", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    expect(
      region(dialog, "photo-spread").getAllByRole("button", {
        name: /fotografijo \d/,
      }),
    ).toHaveLength(5);
    expect(
      region(dialog, "photo-thumbs").getAllByRole("button"),
    ).toHaveLength(7);
    // The counter carries the total, so no second badge has to.
    expect(region(dialog, "photo-spread").getByText("1 / 7")).toBeTruthy();
  });

  it("walks the fan with the chevron buttons", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(
      region(dialog, "photo-spread").getByRole("button", {
        name: "Naslednja fotografija",
      }),
    );

    expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
      .toBe("true");
    expect(region(dialog, "photo-spread").getByText("Fotografija 2 od 2"))
      .toBeTruthy();
  });

  it("steps to the next animal without stacking history", async () => {
    renderGrid();
    openCard("Rex");
    const dialog = await screen.findByRole("dialog");
    const entries = window.history.length;

    fireEvent.click(within(dialog).getByRole("button", { name: "Naslednja žival" }));

    await waitFor(() => expect(window.location.search).toBe("?zival=muri"));
    expect(window.history.length).toBe(entries);
    expect(window.history.state?.zival).toBe(true);
    expect(within(animalDialog()).getByText("Muri")).toBeTruthy();

    // One step back still closes, rather than walking the animals in reverse.
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
  });

  it("walks the list with the page keys and stops at the ends", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    // Rex is first in the sorted list, so there is nothing before it.
    expect(
      within(dialog).queryByRole("button", { name: "Prejšnja žival" }),
    ).toBeNull();

    fireEvent.keyDown(dialog, { key: "PageDown" });
    await waitFor(() => expect(window.location.search).toBe("?zival=muri"));

    // Muri is last, so PageDown from here does nothing.
    fireEvent.keyDown(animalDialog(), { key: "PageDown" });
    expect(window.location.search).toBe("?zival=muri");

    fireEvent.keyDown(animalDialog(), { key: "PageUp" });
    await waitFor(() => expect(window.location.search).toBe("?zival=rex"));
  });

  it("copies the deep link when there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Deli" }));
    });

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(writeText.mock.calls[0][0]).toContain("zival=rex");
    expect(await within(animalDialog()).findByText("Povezava kopirana")).toBeTruthy();
  });

  it("celebrates an adopted animal instead of linking to the listing", async () => {
    window.history.replaceState(null, "", "/?zival=lucky");
    renderGrid([ADOPTED]);
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByText("Ta žival je že našla nov dom."),
    ).toBeTruthy();
    // The listing stays reachable, quietly, and the source stays named.
    expect(
      within(dialog)
        .getByRole("link", { name: /Odpri objavo/ })
        .getAttribute("href"),
    ).toBe("https://example.test/animals/lucky");
    expect(within(dialog).getByText("Foto: Zavetišče Test")).toBeTruthy();
  });

  it("still closes through history after a filter write", async () => {
    renderGrid();
    openCard("Muri");
    const dialog = await screen.findByRole("dialog");
    const entries = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: /Psi/, hidden: true }));
    await waitFor(() =>
      expect(window.location.search).toBe("?vrsta=pes&zival=muri"),
    );
    // The filter write amended the entry, so its marker has to survive.
    expect(window.history.state?.zival).toBe(true);

    await act(async () => {
      fireEvent.click(slot(dialog, "dialog-close-card"));
    });

    // Going back is what closed it, so the filter goes with it rather than
    // the dialog being stripped out of the URL in place.
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.history.length).toBe(entries);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves the dismiss drag to the phone layout", async () => {
    const wide = vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const phone = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: wide,
    });
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      drag(slot(dialog, "animal-dialog-body"), 220);
    });

    expect(window.location.search).toBe("?zival=rex");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: phone,
    });
  });

  it("opens the photo full screen and gives Escape back to the lightbox", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(photoButton(dialog, "photo-spread", 1));

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
    const lightbox = slot(document.body, "photo-lightbox");
    expect(within(lightbox).getByText("1 / 2")).toBeTruthy();

    fireEvent.click(
      within(lightbox).getByRole("button", { name: "Naslednja fotografija" }),
    );
    expect(within(lightbox).getByText("2 / 2")).toBeTruthy();

    // Escape belongs to the top layer only: the animal stays open behind it.
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(window.location.search).toBe("?zival=rex");
  });

  it("closes on a downward drag from the top of the phone layout", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const body = slot(dialog, "animal-dialog-body");

    await act(async () => {
      drag(body, 220);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
  });

  it("ignores a mouse drag and a short pull", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const body = slot(dialog, "animal-dialog-body");

    await act(async () => {
      drag(body, 320, "mouse");
      drag(body, 60);
    });

    expect(window.location.search).toBe("?zival=rex");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("advances the card gallery without opening the dialog", () => {
    renderGrid();
    expect(screen.getByText("Fotografija 1 od 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Naslednja fotografija" }));

    expect(screen.getByText("Fotografija 2 od 2")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
  });
});
