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
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { AnimalGrid } from "@/components/animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { animalPath } from "@/lib/animal-path";
import { animalsForClient } from "@/lib/dataset";

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

// The shape ingest actually delivers: a cached WebP copy with a width ladder
// under it, an inline placeholder, and an AVIF sibling for the first photo
// only. Anything less would leave these tests exercising the fallback path
// while the site runs the other one.
function photos(id: string, count: number): Animal["images"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
    cachedUrl: `/media/animals/${id}-${index + 1}.webp`,
    width: 640,
    height: 480,
    widths: [320, 480, 640],
    ...(index === 0 ? { avif: true } : {}),
    blurDataURL: "data:image/webp;base64,UklGRg==",
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
      <AnimalGrid
        // What the page hands a client component: photos already resolved,
        // and a placeholder only on the one a card and this dialog open on.
        animals={animalsForClient(animals)}
        logos={{}}
        referenceDate={REFERENCE}
      />
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

// The wash is told which photo to show from an effect, so it is empty for the
// first render and every check on it has to be waited for.
function washImage(dialog: HTMLElement) {
  const img = slot(dialog, "photo-wash").querySelector("img");
  if (!(img instanceof HTMLImageElement)) throw new Error("no wash image yet");
  return img;
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

// One link per card. The photo is a second anchor to the same place, but it is
// aria-hidden and out of the tab order on purpose, so the card's link is the
// text block and its name comes from the content it wraps.
function cardLink(name: string) {
  const heading = screen.getByRole("heading", { name });
  const link = heading.closest("a");
  if (!link) throw new Error(`no card link for ${name}`);
  return link;
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
    expect(window.location.pathname).toBe(animalPath(REX, "sl"));
    expect(window.location.search).toBe("");
    expect(window.history.state?.animal).toBe(true);
  });

  it("links every card at the animal's own page", () => {
    renderGrid();

    expect(cardLink("Rex").getAttribute("href")).toBe(animalPath(REX, "sl"));
  });

  // ?zival= is the address the dialog wrote before every animal had a page.
  // Those links are out in the world and still have to open the animal, and
  // the address bar is corrected to the page search engines are told about.
  it("upgrades an old ?zival= link to the animal's own address", async () => {
    window.history.replaceState(null, "", "/?vrsta=pes&zival=rex");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Rex")).toBeTruthy();
    await waitFor(() =>
      expect(window.location.pathname).toBe(animalPath(REX, "sl")),
    );
    // The filters the link carried are not the alias's to drop.
    expect(window.location.search).toBe("?vrsta=pes");
  });

  it("drops the pushed history entry when the card close is used", async () => {
    renderGrid();
    openCard("Rex");
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(slot(dialog, "dialog-close-card"));
    });

    await waitFor(() => expect(window.location.pathname).toBe("/"));
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
    // The toolbar carries a mobile and a desktop copy of the tabs, one of
    // which is always display:none, and either one writes the same filter.
    fireEvent.click(
      screen.getAllByRole("button", { name: /Psi/, hidden: true })[0],
    );

    await waitFor(() => expect(window.location.search).toBe("?vrsta=pes"));
    // The filter wrote the query and left the animal's own path standing.
    expect(window.location.pathname).toBe(animalPath(MURI, "sl"));
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
    expect(within(dialog).getByText("rezervirano")).toBeTruthy();
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

    // The sticky bar mirrors the same button on a phone, so the in-flow
    // shelter block is what this checks against.
    const cta = region(dialog, "shelter-block").getByRole("link", {
      name: /Odpri objavo pri zavetišču/,
    });
    expect(cta.getAttribute("href")).toBe("https://example.test/animals/rex");
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toBe("noreferrer");
  });

  it("puts the species and breed in the subtitle, not the badges", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    // Slovenian writes breed names lowercase, whatever casing the provider
    // delivered.
    expect(within(dialog).getByText("Pes · mešanec")).toBeTruthy();
    // The badge rows carry the identity and the health record; the badge for
    // the breed is gone because the subtitle already says it.
    const details = within(dialog).getByRole("list", {
      name: "Podrobnosti o živali",
    });
    expect(within(details).getByText("Samec")).toBeTruthy();
    expect(within(details).queryByText(/Mešanec/i)).toBeNull();
    const health = within(dialog).getByRole("list", { name: "Zdravje" });
    expect(within(health).getByText("Sterilizacija")).toBeTruthy();
  });

  it("speaks the filter icons' language and explains the health badges", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    // Rex is 24 months old, an adult, so the age badge carries the same
    // shrub the age filter draws for that stage.
    expect(dialog.querySelector('[data-age-icon="odrasel"]')).toBeTruthy();

    // The badge answers with a popover rather than a hover tooltip, so a
    // thumb can ask too. The bubble lands in a portal outside the dialog.
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Sterilizacija" }),
    );
    expect(
      await screen.findByText("Žival je sterilizirana ali kastrirana."),
    ).toBeTruthy();
  });

  it("clamps a long description behind a read-more toggle", async () => {
    const chatty = animal("tia", "Tia", {
      shortDescription: "Zelo prijazna muca. ".repeat(20).trim(),
    });
    window.history.replaceState(null, "", "/?zival=tia");
    renderGrid([chatty]);

    const dialog = await screen.findByRole("dialog");
    const description = within(dialog).getByText(/Zelo prijazna muca/);
    expect(description.className).toContain("line-clamp-5");

    const toggle = within(dialog).getByRole("button", {
      name: "Preberi več",
    });
    fireEvent.click(toggle);

    expect(description.className).not.toContain("line-clamp-5");
    expect(
      within(dialog).getByRole("button", { name: "Pokaži manj" }),
    ).toBeTruthy();
    // Rex's short paragraph never earns the toggle.
    expect(REX.shortDescription!.length).toBeLessThan(320);
  });

  it("folds a complete health record into one line until asked", async () => {
    const model = animal("lira", "Lira", {
      medical: {
        neutered: true,
        vaccinated: true,
        microchipped: true,
        fiv: "negative",
        felv: "negative",
      },
    });
    window.history.replaceState(null, "", "/?zival=lira");
    renderGrid([model]);

    const dialog = await screen.findByRole("dialog");
    const summary = within(dialog).getByRole("button", {
      name: /Vse zdravstveno urejeno \(5\/5\)/,
    });
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(within(dialog).queryByText("Sterilizacija")).toBeNull();

    fireEvent.click(summary);

    expect(within(dialog).getByText("Sterilizacija")).toBeTruthy();
    expect(within(dialog).getByText("Brez FeLV")).toBeTruthy();
  });

  it("keeps a shorter stay as a caption without the callout", async () => {
    // Rex came in 19 months before the reference date, well under the
    // three-year line.
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/V zavetišču: 1 leto/)).toBeTruthy();
    expect(within(dialog).queryByText(/čaka že/)).toBeNull();
    // The place it was found is carried by the pin, words are for screen
    // readers only.
    expect(within(dialog).getByText("Kamnik")).toBeTruthy();
  });

  it("calls out a stay past three years instead of the quiet caption", async () => {
    const longtimer = animal("cufi", "Cufi", { intakeDate: "2022-06-15" });
    window.history.replaceState(null, "", "/?zival=cufi");
    renderGrid([longtimer]);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Cufi v zavetišču čaka že 4 leta."),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/V zavetišču: /)).toBeNull();
    // The list already leads with the longest waits by default, so the
    // callout has nowhere to send anyone.
    expect(
      within(dialog).queryByText("Poglej vse, ki čakajo najdlje"),
    ).toBeNull();
  });

  it("offers the longest-waiting sort from the callout when it would change something", async () => {
    // Rendered on its own rather than through the grid, so the projection the
    // grid would have run is run here.
    const longtimer = animalsForClient([
      animal("cufi", "Cufi", { intakeDate: "2022-06-15" }),
    ])[0]!;
    const onSeeLongestWaiting = vi.fn();
    render(
      <I18nProvider locale="sl">
        <AnimalDialog
          animal={longtimer}
          logos={{}}
          siblingIds={[]}
          reference={new Date(REFERENCE)}
          onNavigate={() => {}}
          onClose={() => {}}
          onSeeLongestWaiting={onSeeLongestWaiting}
        />
      </I18nProvider>,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Poglej vse, ki čakajo najdlje",
      }),
    );

    expect(onSeeLongestWaiting).toHaveBeenCalledTimes(1);
  });

  it("keeps the plea away from a reserved animal", async () => {
    const promised = animal("rezi", "Rezi", {
      status: "reserved",
      intakeDate: "2020-01-15",
    });
    window.history.replaceState(null, "", "/?zival=rezi");
    renderGrid([promised]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/čaka že/)).toBeNull();
    // The stay is still a fact, so the caption keeps it.
    expect(within(dialog).getByText(/V zavetišču: 6 let/)).toBeTruthy();
  });

  it("says nothing about the stay of an animal that has left", async () => {
    const settled = animal("lucky", "Lucky", {
      status: "adopted",
      intakeDate: "2020-01-15",
    });
    window.history.replaceState(null, "", "/?zival=lucky");
    renderGrid([settled]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/čaka že/)).toBeNull();
    expect(within(dialog).queryByText(/V zavetišču: /)).toBeNull();
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

  it("brings a tapped side photo to the front of the phone fan", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(photoButton(dialog, "photo-fan", 1).getAttribute("aria-pressed"))
      .toBe("true");

    fireEvent.click(photoButton(dialog, "photo-fan", 2));

    // The fan walks there first and commits when the spring lands.
    await waitFor(() =>
      expect(photoButton(dialog, "photo-fan", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(photoButton(dialog, "photo-fan", 1).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("swipes the phone fan to the next photo and swallows the tap", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-fan");

    await act(async () => {
      pointer(fan, "pointerdown", { x: 300, y: 200, pointerType: "touch" });
      pointer(fan, "pointermove", { x: 160, y: 204, pointerType: "touch" });
      pointer(fan, "pointerup", { x: 160, y: 204, pointerType: "touch" });
    });

    // The release hands the fan to a spring, and the step commits when it
    // lands.
    await waitFor(() =>
      expect(photoButton(dialog, "photo-fan", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    // The click the browser fires at whatever the finger ended on lands in
    // the capture handler and goes no further, so the gesture stepped one
    // photo and did not also select or open one.
    fireEvent.click(photoButton(dialog, "photo-fan", 2));
    expect(photoButton(dialog, "photo-fan", 2).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("leaves a mouse drag on the phone fan to the photos themselves", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-fan");

    await act(async () => {
      pointer(fan, "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
      pointer(fan, "pointermove", { x: 160, y: 204, pointerType: "mouse" });
      pointer(fan, "pointerup", { x: 160, y: 204, pointerType: "mouse" });
    });

    expect(photoButton(dialog, "photo-fan", 1).getAttribute("aria-pressed"))
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
      region(dialog, "photo-fan").getAllByRole("button", {
        name: /fotografijo \d/,
      }),
    ).toHaveLength(5);
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

  // The fan is remounted per animal so its photos start over. A wash inside it
  // would go out with the old animal and come back from nothing, so it is
  // mounted above the fan and only told which photo is on show.
  it("keeps the wash outside the fan and follows the photo on show", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(slot(dialog, "photo-spread").contains(slot(dialog, "photo-wash")))
      .toBe(false);
    await waitFor(() =>
      expect(washImage(dialog).getAttribute("src")).toContain("rex-1"),
    );

    fireEvent.click(photoButton(dialog, "photo-spread", 2));

    await waitFor(() =>
      expect(washImage(dialog).getAttribute("src")).toContain("rex-2"),
    );
  });

  // The wash reaches 12% past the stage on each side, which on a phone is 124%
  // of the screen, and the dialog answered with a horizontal scrollbar. jsdom
  // has no layout to measure, so what is pinned is the clip that stops it,
  // where the overhang stands. The dialog's own max-sm:overflow-x-hidden is
  // policy for the whole surface, not this fix, so it is not asserted here.
  it("clips the stage wash rather than letting it widen the dialog", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(washImage(dialog)).toBeTruthy());
    const stage = slot(dialog, "photo-wash").parentElement;
    expect(stage).toBeTruthy();
    expect(stage?.className).toContain("overflow-x-clip");
    // The overhang is decoration from sm up, where it has room inside the
    // dialog, so the clip belongs to the phone alone.
    expect(stage?.className).toContain("sm:overflow-x-visible");
  });

  // A link straight to an animal has no card to grow out of, so the dialog
  // falls back to the zoom it always had rather than flying a photo in from
  // nowhere.
  it("carries no photo across when the dialog was opened by link", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toBeTruthy();
    expect(document.querySelector('[data-slot="photo-bloom"]')).toBeNull();
  });

  it("drains the wash for an animal whose adoption is over", async () => {
    const settled = animal("lucky", "Lucky", {
      status: "adopted",
      images: photos("lucky", 1),
    });
    window.history.replaceState(null, "", "/?zival=lucky");
    renderGrid([settled]);
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(washImage(dialog)).toBeTruthy());
    const tone = washImage(dialog).getAttribute("class") ?? "";
    expect(tone).toContain("saturate-[110%]");
    expect(tone).not.toContain("saturate-[440%]");
  });

  it("steps to the next animal without stacking history", async () => {
    renderGrid();
    openCard("Rex");
    const dialog = await screen.findByRole("dialog");
    const entries = window.history.length;

    fireEvent.click(within(dialog).getByRole("button", { name: "Naslednja žival" }));

    await waitFor(() =>
      expect(window.location.pathname).toBe(animalPath(MURI, "sl")),
    );
    expect(window.history.length).toBe(entries);
    expect(window.history.state?.animal).toBe(true);
    // By its heading: the sr-only line that announces the step carries the
    // same name, and a plain text match now finds both.
    expect(
      within(animalDialog()).getByRole("heading", { name: "Muri" }),
    ).toBeTruthy();

    // One step back still closes, rather than walking the animals in reverse.
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.pathname).toBe("/");
  });

  // Radix speaks the title once, on open. A title that changes afterwards is
  // not announced again, so the arrows and the page keys used to move a screen
  // reader to a different animal without a word.
  it("announces the animal it stepped to, and not the one it opened on", async () => {
    renderGrid();
    openCard("Rex");
    const dialog = await screen.findByRole("dialog");

    expect(slot(dialog, "animal-announcement").textContent).toBe("");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Naslednja žival" }),
    );
    await waitFor(() =>
      expect(slot(animalDialog(), "animal-announcement").textContent).toBe(
        "Muri",
      ),
    );

    fireEvent.keyDown(animalDialog(), { key: "PageUp" });
    await waitFor(() =>
      expect(slot(animalDialog(), "animal-announcement").textContent).toBe(
        "Rex",
      ),
    );
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
    await waitFor(() =>
      expect(window.location.pathname).toBe(animalPath(MURI, "sl")),
    );

    // Muri is last, so PageDown from here does nothing.
    fireEvent.keyDown(animalDialog(), { key: "PageDown" });
    expect(window.location.pathname).toBe(animalPath(MURI, "sl"));

    fireEvent.keyDown(animalDialog(), { key: "PageUp" });
    await waitFor(() =>
      expect(window.location.pathname).toBe(animalPath(REX, "sl")),
    );
  });

  it("hands out the animal's own page, not the address bar", async () => {
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

    const sheet = await screen.findByText("Deli to žival");
    const panel = sheet.closest("[data-slot=popover-content]") as HTMLElement;
    const page = `https://posvoji.si${animalPath(REX, "sl")}`;

    // Every target points at the page, which is the only address with a
    // title, a description and a card of its own.
    expect(
      within(panel).getByRole("link", { name: "Facebook" }).getAttribute("href"),
    ).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(page)}`,
    );
    expect(
      within(panel).getByRole("link", { name: "WhatsApp" }).getAttribute("href"),
    ).toContain(encodeURIComponent(page));
    expect(within(panel).getByLabelText("Povezava")).toHaveProperty(
      "value",
      page,
    );

    await act(async () => {
      fireEvent.click(
        within(panel).getByRole("button", { name: "Kopiraj povezavo" }),
      );
    });

    expect(writeText).toHaveBeenCalledWith(page);
    expect(within(panel).getByRole("status").textContent).toBe(
      "Povezava kopirana",
    );
  });

  // The confirmation used to sit in the tree from the start with its words
  // already in it, fading in on a copy. A live region whose text never changes
  // has nothing to announce, so the copy was silent.
  it("says the link was copied only once it has been", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Deli" }));
    });
    const sheet = await screen.findByText("Deli to žival");
    const panel = sheet.closest("[data-slot=popover-content]") as HTMLElement;

    // Mounted and empty: the region has to be there before its text arrives.
    const status = within(panel).getByRole("status");
    expect(status.textContent).toBe("");

    await act(async () => {
      fireEvent.click(
        within(panel).getByRole("button", { name: "Kopiraj povezavo" }),
      );
    });

    expect(status.textContent).toBe("Povezava kopirana");
  });

  it("offers the platform's own share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Deli" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Več" }));
    });

    expect(share).toHaveBeenCalledWith({
      title: "Rex išče dom",
      url: `https://posvoji.si${animalPath(REX, "sl")}`,
    });
    Reflect.deleteProperty(navigator, "share");
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
      region(dialog, "shelter-block")
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

    fireEvent.click(
      screen.getAllByRole("button", { name: /Psi/, hidden: true })[0],
    );
    await waitFor(() => expect(window.location.search).toBe("?vrsta=pes"));
    // The filter wrote the query and left the animal's own path standing.
    expect(window.location.pathname).toBe(animalPath(MURI, "sl"));
    // The filter write amended the entry, so its marker has to survive.
    expect(window.history.state?.animal).toBe(true);

    await act(async () => {
      fireEvent.click(slot(dialog, "dialog-close-card"));
    });

    // Going back is what closed it, so the filter goes with it rather than
    // the dialog being stripped out of the URL in place.
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(window.location.search).toBe("");
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

    expect(window.location.pathname).toBe(animalPath(REX, "sl"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: phone,
    });
  });

  it("offers the fan's photos as a ladder, and never the hero avif", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    const photo = slot(dialog, "photo-spread").querySelector("img");
    expect(photo?.getAttribute("srcset")).toBe(
      "/media/animals/rex-1-320.webp 320w, " +
        "/media/animals/rex-1-480.webp 480w, " +
        "/media/animals/rex-1.webp 640w",
    );
    expect(photo?.getAttribute("sizes")).toBe("(max-width: 639px) 80vw, 24rem");
    // The fan draws five photos, four of them scaled well under half size, and
    // the AVIF sibling only exists at the cached copy's full width. A <source>
    // here would hand every one of them the largest file there is.
    expect(slot(dialog, "photo-spread").querySelector("picture")).toBeNull();
  });

  it("gives the lightbox the whole ladder and the top of it as src", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(photoButton(dialog, "photo-spread", 1));
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));

    const frame = slot(document.body, "photo-lightbox-frame");
    const photo = frame.querySelector("img");
    // 100vw, so this is the one surface that reaches the top rung on almost
    // every screen. That is the point of it.
    expect(photo?.getAttribute("sizes")).toBe("100vw");
    expect(photo?.getAttribute("src")).toBe("/media/animals/rex-1.webp");
    expect(photo?.getAttribute("srcset")).toContain(
      "/media/animals/rex-1.webp 640w",
    );
    // object-contain leaves ground either side, which a cover-scaled
    // placeholder would paint into. The wash fills it instead.
    expect(frame.querySelector("div[aria-hidden][style*='background-image']"))
      .toBeNull();
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
    expect(window.location.pathname).toBe(animalPath(REX, "sl"));
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
    expect(window.location.pathname).toBe("/");
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

    expect(window.location.pathname).toBe(animalPath(REX, "sl"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("mirrors the shelter's CTA in a sticky bar for the phone layout", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    const bar = region(dialog, "sticky-cta");
    expect(
      bar.getByRole("link", { name: /Odpri objavo pri zavetišču/ })
        .getAttribute("href"),
    ).toBe("https://example.test/animals/rex");
  });

  // The lightbox used to hang off the desktop fan alone, which left the one
  // layout with the smallest photo as the only one that could not open it
  // large. The phone fan's active photo is the same way in now.
  it("opens the photo full screen from the phone fan", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(
      region(dialog, "photo-fan").getByRole("button", {
        name: /čez cel zaslon/,
      }),
    );

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
  });

  // Two identical buttons used to stand 90px apart on the phone, and the
  // upper one had its middle covered by the lower.
  it("leaves the phone's call to action to the sticky bar alone", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(
      region(dialog, "shelter-block")
        .getByRole("link", { name: /Odpri objavo pri zavetišču/ })
        .className,
    ).toContain("max-sm:hidden");
    expect(
      region(dialog, "sticky-cta").getByRole("link", {
        name: /Odpri objavo pri zavetišču/,
      }),
    ).toBeTruthy();
  });

  // The animal's own page renders the same box with no bar under it, so there
  // the button has to stay, and at a size a thumb can land on.
  it("keeps the shelter box's button where nothing mirrors it", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterBlock
          animal={REX}
          logos={{}}
          reference={new Date(REFERENCE)}
        />
      </I18nProvider>,
    );

    const cta = screen.getByRole("link", {
      name: /Odpri objavo pri zavetišču/,
    });
    expect(cta.className).not.toContain("max-sm:hidden");
    expect(cta.className).toContain("max-sm:h-11");
  });

  // The shelter block replaces the CTA with the good news and a quiet text
  // link for an animal that has left, and the bar was still giving the phone
  // a full-width primary "open the listing" over the top of it.
  it("hides the sticky bar for an animal that has already found a home", async () => {
    window.history.replaceState(null, "", "/?zival=lucky");
    renderGrid([ADOPTED]);
    const dialog = await screen.findByRole("dialog");

    expect(dialog.querySelector('[data-slot="sticky-cta"]')).toBeNull();
    // With no bar to mirror, the block's own way to the listing is the one
    // the phone gets, and it stays visible.
    const link = region(dialog, "shelter-block").getByRole("link", {
      name: /Odpri objavo pri zavetišču/,
    });
    expect(link.className).not.toContain("max-sm:hidden");
    expect(within(dialog).getByText("Ta žival je že našla nov dom.")).toBeTruthy();
  });

  // The line is the provider's own Slovenian, printed verbatim, so on an
  // English page it has to say which language it is in.
  it("marks the attribution Slovenian away from the Slovenian pages", () => {
    render(
      <I18nProvider locale="en">
        <ShelterBlock animal={REX} logos={{}} reference={new Date(REFERENCE)} />
      </I18nProvider>,
    );

    expect(
      screen.getByText("Foto in opis: Zavetišče Test").getAttribute("lang"),
    ).toBe("sl");
  });

  it("hides the sticky bar when there is no listing to send anyone to", async () => {
    const noListing = animal("brez", "Brez", {
      source: {
        providerId: "test-shelter",
        sourceAnimalId: "brez",
        sourceUrl: "",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    });
    window.history.replaceState(null, "", "/?zival=brez");
    renderGrid([noListing]);
    const dialog = await screen.findByRole("dialog");

    expect(dialog.querySelector('[data-slot="sticky-cta"]')).toBeNull();
  });

  it("closes instead of leaving the site when a deep-linked dialog is popped", async () => {
    window.history.replaceState(null, "", animalPath(REX, "sl"));
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    // Opened straight from a URL, so nothing pushed a marker for this entry;
    // the effect has to have pushed its own throwaway one instead.
    expect(window.history.state?.mobileDialogGesture).toBe(true);

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.pathname).toBe("/");
  });

  it("advances the card gallery without opening the dialog", () => {
    renderGrid();
    expect(screen.getByText("Fotografija 1 od 2")).toBeTruthy();

    // getByLabelText, not getByRole: the card chevrons are aria-hidden (they
    // are a pointer affordance; keyboard and screen readers get the arrow-key
    // route), so the role query no longer sees them.
    fireEvent.click(screen.getByLabelText("Naslednja fotografija"));

    expect(screen.getByText("Fotografija 2 od 2")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
  });
});
