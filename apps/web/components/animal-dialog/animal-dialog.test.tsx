// @vitest-environment jsdom

import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import {
  DESKTOP_DEPTHS,
  PHONE_DEPTHS,
  PhotoSpread,
  fanTempo,
  seatCentre,
  type FanFactors,
} from "@/components/animal-dialog/photo-spread";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { AnimalGrid } from "@/components/animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { animalPath } from "@/lib/animal-path";
import { animalsForClient } from "@/lib/dataset";
import { capturePreloads, pointer, slot } from "@/test/pointer";

// The filter dock and the drawer read the viewport before they render, and
// the dismiss gesture asks whether it is on the phone layout. jsdom reports
// 1024px, so the phone query is answered yes here whatever the fan is doing.
const PHONE_LAYOUT = "(max-width: 639px)";

// The fan mounts one geometry and reads Tailwind's sm to pick it, so which
// layout a test gets is the test's own to say: fanLayout("phone") before the
// render, and the afterEach puts the desktop back.
const FAN_LAYOUT = "(min-width: 640px)";

let desktopFan = true;

function fanLayout(layout: "phone" | "desktop") {
  desktopFan = layout === "desktop";
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === FAN_LAYOUT ? desktopFan : media === PHONE_LAYOUT,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fanLayout("desktop");
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

// The register's longest gallery, and the shape the count is a control on: a
// set the fan cannot show at once has a contact sheet behind it.
const LONG = animal("klopka", "Klopka", { images: photos("klopka", 14) });

// Three is under SHEET_FROM, so the count there is a mark and nothing more.
const TRIO = animal("trio", "Trio", { images: photos("trio", 3) });

// One photo is no fan: nothing to walk to, and nothing for the arrows to do.
const SOLO = animal("sam", "Sam", { images: photos("sam", 1) });

// A second photo that is taller than it is wide. ingest measures every cached
// copy, and animalsForClient reduces the pair to the `aspect` the fan draws by.
const TALL = animal("tall", "Tina", {
  images: photos("tall", 2).map((image, index) =>
    index === 1 ? { ...image, width: 600, height: 800 } : image,
  ),
});

// Every print taller than it is wide, which is where seats measured from the
// middle of the stage came apart: a narrow front leaves its neighbour a much
// closer edge to tuck under than a fan of 4:3 prints does.
const PORTRAITS = animal("nina", "Nina", {
  images: photos("nina", 2).map((image) => ({
    ...image,
    width: 600,
    height: 800,
  })),
});

// 3:4 over 4:3: a portrait print is drawn this much of the standard width.
const PORTRAIT_FACTOR = 0.5625;

const ADOPTED = animal("lucky", "Lucky", { status: "adopted" });

const ANIMALS = [REX, MURI];

// The register holds a phone for fifteen of the seventeen shelters, so the
// fixture shelter has one and the tests that check the other two pass {}.
const PHONES = { "test-shelter": "03 749 06 00" };

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
        phones={PHONES}
        referenceDate={REFERENCE}
      />
    </I18nProvider>,
  );
}

// Queries are scoped to one stage rather than taken off the whole dialog: the
// card gallery on the grid behind it labels its photos the same way the fan
// does.
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

// The paper one print is drawn on, inside the seat the fan moves.
function printPaper(dialog: HTMLElement, name: string, n: number) {
  const found = photoButton(dialog, name, n).querySelector(
    '[data-slot="photo-print"]',
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no paper on ${n}`);
  return found;
}

// The layer that takes a print's light as it stands back, over the picture and
// inside the well.
function printDim(dialog: HTMLElement, name: string, n: number) {
  const found = printPaper(dialog, name, n).querySelector(
    '[data-slot="photo-well"] .bg-black',
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no dim on ${n}`);
  return found;
}

// The <img> of one print, past the placeholder that fills the well under it.
function printImage(dialog: HTMLElement, name: string, n: number) {
  const found = photoButton(dialog, name, n).querySelector("img");
  if (!(found instanceof HTMLImageElement)) throw new Error(`no photo on ${n}`);
  return found;
}

function animalDialog() {
  return screen.getAllByRole("dialog")[0] as HTMLElement;
}

// The same two steps are drawn twice: as arrows at the edges of the dialog for
// a pointer, and as a pair on the title row for a thumb. Each layout hides the
// other one by breakpoint, and jsdom applies no Tailwind, so both are in the
// tree here and a label on its own matches two buttons. Each is asked for by
// what names it instead.
function edgeNav(dialog: HTMLElement, label: string) {
  const found = dialog.querySelector(
    `button[aria-label="${label}"]:not([data-slot="animal-nav-phone"])`,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no edge ${label}`);
  return found;
}

function phoneNav(dialog: HTMLElement, direction: "previous" | "next") {
  const found = dialog.querySelector(
    `[data-slot="animal-nav-phone"][data-direction="${direction}"]`,
  );
  return found instanceof HTMLElement ? found : null;
}

// One animal open with a list stated by hand, for the cases where which
// neighbours it has is the whole point. The grid renders the same dialog off
// its own sort, which cannot be asked for a middle of a list of two.
function renderDialog(target: Animal, siblingIds: string[]) {
  const onNavigate = vi.fn();
  const [client] = animalsForClient([target]);
  render(
    <I18nProvider locale="sl">
      <AnimalDialog
        animal={client}
        logos={{}}
        phones={PHONES}
        siblingIds={siblingIds}
        reference={new Date(REFERENCE)}
        onNavigate={onNavigate}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
  return onNavigate;
}

// Five prints on the stage and no empty frames behind them.
function expectPhotosAndNothingElse(dialog: HTMLElement, name: string) {
  expect(
    slot(dialog, name).querySelectorAll('[data-slot="photo-deck"]'),
  ).toHaveLength(0);
  expect(
    region(dialog, name).getAllByRole("button", { name: /fotografijo \d/ }),
  ).toHaveLength(5);
}

// What a stage says about itself: whose photos it is holding, and the four
// keys it answers. The same on either geometry.
function expectNamedFan(stage: HTMLElement) {
  expect(stage.getAttribute("role")).toBe("group");
  expect(stage.getAttribute("aria-label")).toBe("Fotografija: Rex");
  expect(stage.getAttribute("aria-keyshortcuts")).toBe(
    "ArrowLeft ArrowRight Home End",
  );
}

// Where the fan put a print, read back off the transform motion writes. The
// percentage is of the print's own width, which is the unit seatCentre's
// answer converts into.
function translateX(element: HTMLElement) {
  const found = /translateX\((-?[\d.]+)%\)/.exec(element.style.transform);
  if (!found) throw new Error(`no translateX in "${element.style.transform}"`);
  return Number(found[1]);
}

// The wash holds a layer for the print on show and one for each of its
// neighbours, tagged with how far that photo stands from the front. Offset 0
// is the one on show.
function washLayer(dialog: HTMLElement, offset: number) {
  const layer = slot(dialog, "photo-wash").querySelector(
    `[data-wash-offset="${offset}"]`,
  );
  if (!(layer instanceof HTMLElement)) {
    throw new Error(`no wash layer at ${offset}`);
  }
  return layer;
}

function washImage(dialog: HTMLElement, offset = 0) {
  const img = washLayer(dialog, offset).querySelector("img");
  if (!(img instanceof HTMLImageElement)) throw new Error("no wash image yet");
  return img;
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

// A mouse held down and pulled left across a stage: far enough past the slop
// to declare its axis, and past the fifth of the width that commits a step.
async function mouseDrag(fan: HTMLElement) {
  await act(async () => {
    pointer(fan, "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
    pointer(fan, "pointermove", { x: 160, y: 204, pointerType: "mouse" });
    pointer(fan, "pointerup", { x: 160, y: 204, pointerType: "mouse" });
  });
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
          phones={{}}
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

    // The fan walks to the photo that was clicked and commits the new front
    // when the spring lands.
    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
      .toBe("false");
    expect(
      within(photoButton(dialog, "photo-spread", 2)).getByText("2 / 2"),
    ).toBeTruthy();
  });

  it("brings a tapped side photo to the front of the phone fan", async () => {
    fanLayout("phone");
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
    fanLayout("phone");
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

  // The soft shadow used to be switched on at the commit, which made it the
  // one thing in the fan that snapped rather than walked. It is a layer of its
  // own now, on the same curve the wash blends its light on.
  it("deepens the front print's shadow rather than switching it", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    function shadow(n: number) {
      const layer = photoButton(dialog, "photo-spread", n).querySelector(
        ".shadow-sm",
      );
      if (!(layer instanceof HTMLElement)) throw new Error(`no shadow on ${n}`);
      return layer;
    }

    expect(shadow(1).style.opacity).toBe("1");
    expect(shadow(2).style.opacity).toBe("0");
    // The frame under it keeps the same light shadow whichever photo it is,
    // so nothing about the stack is being switched at the commit any more.
    for (const n of [1, 2]) {
      const frame = photoButton(dialog, "photo-spread", n).querySelector(
        ".overflow-hidden",
      );
      expect(frame?.className).toContain("shadow-xs");
    }
  });

  // A print is paper with a photo on it, except the one in front: there the
  // picture runs to the edge, the way it does on the grid card the dialog was
  // opened from. The strip of the second tier that shows past the front is
  // what needs the paper, or it reads as an image cut off rather than as a
  // print peeking out of a stack. The margin follows depth, so it is the seat
  // that states it and the walk that writes it.
  it("draws paper on the prints behind and none on the one in front", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    const front = photoButton(dialog, "photo-spread", 1);
    expect(front.style.getPropertyValue("--print-margin")).toBe("0px");
    const behind = photoButton(dialog, "photo-spread", 2);
    expect(behind.style.getPropertyValue("--print-margin")).toBe("6px");

    const paper = printPaper(dialog, "photo-spread", 1);
    expect(paper.className).toContain("bg-background");
    expect(paper.className).not.toContain("bg-muted");

    // The picture sits in a well that fills the paper and is clipped by that
    // same margin, so the paper shows as a border all the way round a print
    // that stands back and as nothing at all on the one in front. A clip and
    // not an inset: an inset the walk rewrites is a layout per pointer move.
    const well = paper.querySelector('[data-slot="photo-well"]');
    expect(well?.className).toContain("inset-0");
    expect(well?.className).toContain(
      "[clip-path:inset(var(--print-margin)_round_calc(var(--radius-ui)_-_var(--print-margin)))]",
    );
    // A ground darker than the paper: near white, a well with no photo in it
    // yet read as a blank card.
    expect(well?.className).toContain("bg-foreground/8");
    expect(well?.className).not.toContain("bg-muted");
    expect(well?.querySelector("img")).toBeTruthy();
    // Including the placeholder, which fills the well and not the paper.
    expect(well?.querySelector("div[aria-hidden][style*='background-image']"))
      .toBeTruthy();
  });

  // Five prints are on stage the moment the dialog opens, so none of them is a
  // candidate for the browser's lazy heuristic: a neighbour that opened as an
  // empty card is the most visible thing the paper margin can make worse.
  it("loads every print on the stage at once, the front one first", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    const front = printImage(dialog, "photo-spread", 1);
    expect(front.getAttribute("loading")).toBe("eager");
    expect(front.getAttribute("fetchpriority")).toBe("high");

    // The rest load at once too, but the queue belongs to the photo being
    // looked at.
    const behind = printImage(dialog, "photo-spread", 2);
    expect(behind.getAttribute("loading")).toBe("eager");
    expect(behind.getAttribute("fetchpriority")).toBeNull();
  });

  // The fan answered four keys and said nothing about them. The stage names
  // whose photos these are the same way the card gallery's group does. Both
  // geometries carry it, so each is asked in its own render.
  it("names the desktop fan and states the keys it answers", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expectNamedFan(slot(dialog, "photo-spread"));
  });

  it("names the phone fan and states the keys it answers", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expectNamedFan(slot(dialog, "photo-fan"));
  });

  // Both layouts used to be in the document at once with one of them hidden by
  // CSS: 38 nodes, five eager images and fifty MotionValues idling for a fan
  // nobody could see. The breakpoint is read now, and only the fan on screen
  // is mounted.
  it("mounts the phone fan alone below the breakpoint", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(slot(dialog, "photo-fan")).toBeTruthy();
    expect(dialog.querySelector('[data-slot="photo-spread"]')).toBeNull();
  });

  it("mounts the desktop fan alone above the breakpoint", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(slot(dialog, "photo-spread")).toBeTruthy();
    expect(dialog.querySelector('[data-slot="photo-fan"]')).toBeNull();
  });

  // Two stages meant two groups with the same name, one of them display: none.
  // A screen reader is offered one set of photos now.
  it("puts one photo group in the dialog, not two", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getAllByRole("group", { name: "Fotografija: Rex" }),
    ).toHaveLength(1);
  });

  // A press on the fan used to be React state, so it re-rendered all five
  // prints and rebuilt the ten MotionValues in each of them. The prints are
  // memoised now and every prop the fan hands them is stable, so a render that
  // changes nothing about a print does not reach it.
  //
  // Counted through the photos themselves: a print reads `aspect` off the
  // photo it draws, and so does the <img> inside it, so a getter per photo
  // says whether that print was rendered again. The front photo's counter is
  // also the proof that the fan itself rendered, because the chevrons read the
  // front print's shape on every one of its renders.
  it("leaves the prints alone when the fan re-renders for something else", async () => {
    const [client] = animalsForClient([REX]);
    const reads = [0, 0];
    const counted = {
      ...client,
      images: client.images.map((image, index) => ({
        ...image,
        get aspect() {
          reads[index]++;
          return image.aspect;
        },
      })),
    };
    // Built fresh every time, the way a parent's own render builds it: React
    // skips a subtree whose element it was handed twice, and the whole point
    // here is to make the fan render again.
    const fan = () => (
      <I18nProvider locale="sl">
        <PhotoSpread animal={counted} />
      </I18nProvider>
    );
    const view = render(fan());

    // The first re-render after the mount turns the entrance cascade off,
    // which is a changed prop and does reach the prints.
    await act(async () => {
      view.rerender(fan());
    });
    const settled = [...reads];
    expect(settled[1]).toBeGreaterThan(0);

    await act(async () => {
      view.rerender(fan());
    });

    // The fan rendered again, and the print behind the front one did not.
    expect(reads[0]).toBeGreaterThan(settled[0]);
    expect(reads[1]).toBe(settled[1]);
  });

  // The commit at the end of a walk was the one long task left in the fan's
  // trace: the window re-seated, every print was handed a new offset, and all
  // five rebuilt their transforms for a pose four of them already held. A
  // print's offset is a MotionValue now, jumped alongside the walk in one
  // paint, so the only prints React touches are the two trading the front and
  // the one stepping into the window.
  //
  // Counted through the photos the same way as above, and on the phone fan on
  // purpose: the desktop's chevrons read the front print's own shape on every
  // render of the fan, and here every read has to be a print rendering and
  // nothing else.
  it("re-renders only the prints trading the front when a step lands", async () => {
    // What a commit costs the counter, per photo. The fan reads every photo in
    // the new window once, to build the record of shapes the seats are
    // measured off; that is the fan's own read and not a print's. A print that
    // renders reads it twice more: once to size its own box, and once inside
    // the <img> to decide whether to bias a portrait shot upward.
    const WINDOW_READ = 1;
    const READS_PER_RENDER = 2;
    // And the front photo once more, for the box the fan draws its own
    // controls in over the front print. On this layout that is the count that
    // opens the whole set; on the desktop it is the chevrons as well. A fan's
    // read, not a print's: nothing rendered again for it.
    const FRONT_READ = 1;

    fanLayout("phone");
    const [client] = animalsForClient([MANY]);
    const reads = client.images.map(() => 0);
    const counted = {
      ...client,
      images: client.images.map((image, index) => ({
        ...image,
        get aspect() {
          reads[index]++;
          return image.aspect;
        },
      })),
    };
    const fan = () => (
      <I18nProvider locale="sl">
        <PhotoSpread animal={counted} />
      </I18nProvider>
    );
    const view = render(fan());
    // The first re-render after the mount turns the entrance cascade off,
    // which is a changed prop and does reach every print. From here on every
    // prop the fan hands them is stable.
    await act(async () => {
      view.rerender(fan());
    });
    const settled = [...reads];

    // At photo 1 the window holds 6 and 7 on the left and 2 and 3 on the
    // right. Walking to photo 2 takes 6 off the stage and brings 4 on.
    await act(async () => {
      fireEvent.click(photoButton(view.container, "photo-fan", 2));
    });
    await waitFor(() =>
      expect(
        photoButton(view.container, "photo-fan", 2).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    const step = reads.map((count, index) => count - settled[index]);

    // Photo 1 gave up the front and photo 2 took it: one render each. Photo 4
    // stepped into the window, which is one mount. Photo 2 is also the one the
    // count is drawn over now, which is the fan's extra read of it.
    expect(step[0]).toBe(WINDOW_READ + READS_PER_RENDER);
    expect(step[1]).toBe(WINDOW_READ + FRONT_READ + READS_PER_RENDER);
    expect(step[3]).toBe(WINDOW_READ + READS_PER_RENDER);
    // Photos 3 and 7 only moved a seat: the fan re-seated them and nothing
    // rendered. Photo 6 left the stage, so not even the window read it.
    expect(step[2]).toBe(WINDOW_READ);
    expect(step[6]).toBe(WINDOW_READ);
    expect(step[5]).toBe(0);

    // That the prints which sat out the commit still moved to their new seats
    // is pinned in the browser suite (e2e/photo-fan.spec.ts, "re-seats every
    // print on a step"), not here: a jumped value reaches a print that did not
    // render only through motion's frame loop, and jsdom does not carry that
    // write to the element the way a browser does. The counts above are what
    // this test is for.
  });

  // Depth is drawn with light as well as with size, off the same walk the rest
  // of the pose is read from: no class switching at the commit. It is the
  // opacity of a layer over the picture rather than a filter on the print,
  // because a layer is composited and the filter had the browser repaint five
  // photographs on every frame of a drag.
  it("dims a print with every tier it stands back", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    // At photo 1 the window holds 6 and 7 on the left and 2 and 3 on the
    // right, so 2 is one tier back and 3 is two.
    expect(printDim(dialog, "photo-spread", 1).style.opacity).toBe("0");
    expect(printDim(dialog, "photo-spread", 2).style.opacity).toBe("0.05");
    expect(printDim(dialog, "photo-spread", 3).style.opacity).toBe("0.1");
    // Nothing is filtered and nothing is switched by a class.
    expect(printPaper(dialog, "photo-spread", 2).style.filter).toBe("");
    expect(printPaper(dialog, "photo-spread", 2).className).not.toContain(
      "brightness-95",
    );
  });

  // A set the fan cannot show at once takes one gesture per photo to get
  // through, which is a lot of gestures for twelve. A flick well past the one
  // that turns a photo carries two, and never more than two.
  it("carries two photos on a hard flick through a long set", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-fan");

    // 200px in 60ms is 3.3 px/ms, well past the 1.4 that asks for two.
    await act(async () => {
      pointer(fan, "pointerdown", {
        x: 300,
        y: 200,
        pointerType: "touch",
        time: 1000,
      });
      pointer(fan, "pointermove", {
        x: 200,
        y: 204,
        pointerType: "touch",
        time: 1030,
      });
      pointer(fan, "pointerup", {
        x: 100,
        y: 204,
        pointerType: "touch",
        time: 1060,
      });
    });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-fan", 3).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(region(dialog, "photo-fan").getByText("3 / 7")).toBeTruthy();
  });

  it("keeps the same flick to one photo where the fan shows them all", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-fan");

    await act(async () => {
      pointer(fan, "pointerdown", {
        x: 300,
        y: 200,
        pointerType: "touch",
        time: 1000,
      });
      pointer(fan, "pointermove", {
        x: 200,
        y: 204,
        pointerType: "touch",
        time: 1030,
      });
      pointer(fan, "pointerup", {
        x: 100,
        y: 204,
        pointerType: "touch",
        time: 1060,
      });
    });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-fan", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
  });

  // A mouse used to be turned away at the door, which left the desktop fan
  // with nothing to grab: the photos sat there looking draggable and were not.
  // One geometry is mounted at a time now, so the two layouts are dragged in
  // two renders rather than in one.
  it("walks the desktop fan with a mouse drag", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await mouseDrag(slot(dialog, "photo-spread"));

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
  });

  it("walks the phone fan with a mouse drag", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await mouseDrag(slot(dialog, "photo-fan"));

    await waitFor(() =>
      expect(photoButton(dialog, "photo-fan", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
  });

  it("lets a walk a press caught carry on to where it was going", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    // A side photo picked, and a press on the empty stage before the walk
    // has landed. The press stops the walk so a finger could take the fan;
    // released without a drag, it must hand the walk back rather than leave
    // the fan wherever it was caught.
    fireEvent.click(photoButton(dialog, "photo-spread", 2));
    await act(async () => {
      pointer(fan, "pointerdown", { x: 40, y: 20, pointerType: "mouse" });
      pointer(fan, "pointerup", { x: 40, y: 20, pointerType: "mouse" });
    });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(region(dialog, "photo-spread").getByText("2 / 7")).toBeTruthy();
  });

  it("adds a second arrow press to the walk in flight", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    // Two presses before the first walk lands are two photos, not one and a
    // stumble back to the first.
    fireEvent.keyDown(fan, { key: "ArrowRight" });
    fireEvent.keyDown(fan, { key: "ArrowRight" });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 3).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(region(dialog, "photo-spread").getByText("3 / 7")).toBeTruthy();
  });

  // Two photos wrap, so a second arrow the same way targets the photo the
  // first one is already leaving. The walk used to be taken anyway, and
  // committing the index the fan was already on re-seated nothing: React
  // bailed out of the identical update, the layout effect that puts the walk
  // away never ran, and both prints were left standing two seats out with
  // nothing at the front.
  it("keeps a two-photo fan on its seats through two quick arrows", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    fireEvent.keyDown(fan, { key: "ArrowRight" });
    fireEvent.keyDown(fan, { key: "ArrowRight" });

    // The walk in flight lands, and the press that would only have wrapped
    // back onto its own starting point is dropped.
    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(fan.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
    expect(region(dialog, "photo-spread").getByText("2 / 2")).toBeTruthy();
    // And the walk itself is put away: a print in front stands in the middle
    // of the stage, not two seats off it.
    await waitFor(() =>
      expect(translateX(photoButton(dialog, "photo-spread", 2)))
        .toBeCloseTo(-50, 3),
    );
  });

  // The drop above is only for a press that would land back on the photo the
  // walk in flight is leaving. One that nets to nothing is the visitor taking
  // the step back, and it still cancels.
  it("takes an arrow back when the one after it nets to nothing", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    fireEvent.keyDown(fan, { key: "ArrowRight" });
    fireEvent.keyDown(fan, { key: "ArrowLeft" });

    await waitFor(() =>
      expect(translateX(photoButton(dialog, "photo-spread", 1)))
        .toBeCloseTo(-50, 3),
    );
    expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
      .toBe("true");
    expect(region(dialog, "photo-spread").getByText("1 / 2")).toBeTruthy();
  });

  // A lone photo has nowhere to walk. The arrow used to be swallowed and the
  // fan walked a seat anyway, to commit the photo it was already on, which
  // left the one print sitting a seat off the middle for good.
  it("leaves the arrows alone on a lone photo", async () => {
    window.history.replaceState(null, "", "/?zival=sam");
    renderGrid([SOLO]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    const arrow = createEvent.keyDown(fan, { key: "ArrowRight" });
    fireEvent(fan, arrow);

    // Not preventDefault'd either: the page's own scroll is not the fan's to
    // take when the fan has nothing to do with the key.
    expect(arrow.defaultPrevented).toBe(false);
    expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
      .toBe("true");
    expect(translateX(photoButton(dialog, "photo-spread", 1)))
      .toBeCloseTo(-50, 6);
  });

  it("keeps a swipe to the finger that started it", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-fan");

    // Stamped, because velocity is read off the event clock and jsdom stamps
    // every event in the same millisecond: unstamped, this reads as a flick
    // hard enough to carry two photos.
    await act(async () => {
      pointer(fan, "pointerdown", {
        x: 300,
        y: 200,
        pointerType: "touch",
        time: 1000,
      });
      // A second finger lands and does a whole gesture of its own. Measured
      // from the first finger's origin it is a swipe left, and it used to walk
      // the fan and then commit a step for a gesture that was not its own.
      pointer(fan, "pointermove", {
        x: 100,
        y: 204,
        pointerType: "touch",
        pointerId: 2,
        time: 1100,
      });
      pointer(fan, "pointerup", {
        x: 100,
        y: 204,
        pointerType: "touch",
        pointerId: 2,
        time: 1150,
      });
    });

    expect(photoButton(dialog, "photo-fan", 1).getAttribute("aria-pressed"))
      .toBe("true");

    // The first finger still has the fan, and its own release is what counts.
    await act(async () => {
      pointer(fan, "pointermove", {
        x: 160,
        y: 204,
        pointerType: "touch",
        time: 1200,
      });
      pointer(fan, "pointerup", {
        x: 160,
        y: 204,
        pointerType: "touch",
        time: 1250,
      });
    });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-fan", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
  });

  // A right or middle press opens a menu or starts an autoscroll, and neither
  // ends with a pointerup the fan will see: the gesture it began would never
  // be put down.
  it("ignores a mouse drag that was not the primary button", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    await act(async () => {
      pointer(fan, "pointerdown", {
        x: 300,
        y: 200,
        pointerType: "mouse",
        button: 2,
      });
      pointer(fan, "pointermove", { x: 160, y: 204, pointerType: "mouse" });
      pointer(fan, "pointerup", { x: 160, y: 204, pointerType: "mouse" });
    });

    expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
      .toBe("true");
    expect(fan.dataset.dragging).toBeUndefined();
  });

  it("keeps a short mouse press on a photo a click, not a drag", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    // Under the 8px slop the gesture never declares an axis, so it never
    // suppresses the click the browser fires after it.
    await act(async () => {
      pointer(fan, "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
      pointer(fan, "pointermove", { x: 304, y: 202, pointerType: "mouse" });
      pointer(fan, "pointerup", { x: 304, y: 202, pointerType: "mouse" });
    });
    fireEvent.click(photoButton(dialog, "photo-spread", 2));

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
  });

  // The listener is native and non-passive, because React registers onWheel
  // passive and a passive listener may not preventDefault: without the
  // prevent, two fingers on a Mac trackpad are the browser's back gesture.
  // fireEvent.wheel dispatches a real event, so it reaches it either way.
  it("turns one photo per trackpad swipe and swallows the inertia after it", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    await act(async () => {
      fireEvent.wheel(fan, { deltaX: 300, deltaY: 0 });
      // The inertia the trackpad keeps sending after the fingers lift. Each of
      // these re-arms the settle window, so the whole tail stays the one
      // gesture and turns no further photos.
      for (let i = 0; i < 8; i++) {
        fireEvent.wheel(fan, { deltaX: 60, deltaY: 0 });
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(region(dialog, "photo-spread").getByText("2 / 7")).toBeTruthy();

    // And the window closes again rather than wedging: quiet for longer than
    // the settle, and the next swipe is a new gesture with a new photo.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
      fireEvent.wheel(fan, { deltaX: 300, deltaY: 0 });
    });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 3).getAttribute("aria-pressed"))
        .toBe("true"),
    );
  });

  it("leaves a vertical wheel to the dialog's own scroll", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.wheel(slot(dialog, "photo-spread"), { deltaX: 0, deltaY: 300 });
    });

    expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
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
    // The counter carries the total, so no second badge has to.
    expect(region(dialog, "photo-spread").getByText("1 / 7")).toBeTruthy();
  });

  it("caps the phone fan at five photos too", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    expect(
      region(dialog, "photo-fan").getAllByRole("button", {
        name: /fotografijo \d/,
      }),
    ).toHaveLength(5);
    expect(region(dialog, "photo-fan").getByText("1 / 7")).toBeTruthy();
  });

  // Empty paper frames used to stand behind the outermost prints for a set the
  // fan cannot show at once. They read as blank cards rather than as the rest
  // of a stack, so the count in the corner is what says there are more.
  it("draws nothing behind the desktop fan but the photos themselves", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);

    expectPhotosAndNothingElse(await screen.findByRole("dialog"), "photo-spread");
  });

  it("draws nothing behind the phone fan but the photos themselves", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);

    expectPhotosAndNothingElse(await screen.findByRole("dialog"), "photo-fan");
  });

  // Every print used to be forced into 4:3. A photo that is taller than that
  // is drawn as a narrower card of the same height instead, so the stage
  // geometry is unchanged and the picture keeps its own shape.
  it("draws a portrait print narrower rather than cropping it to 4:3", async () => {
    window.history.replaceState(null, "", "/?zival=tall");
    renderGrid([TALL]);
    const dialog = await screen.findByRole("dialog");

    const front = photoButton(dialog, "photo-spread", 1);
    expect(front.style.aspectRatio).toBe(String(4 / 3));
    // The classes state the standard 4:3 width; a 4:3 print takes all of it.
    expect(front.style.width).toBe("calc(var(--print-w) * 1)");

    const portrait = photoButton(dialog, "photo-spread", 2);
    expect(portrait.style.aspectRatio).toBe("0.75");
    // 0.75 over 4:3: as much narrower as it is taller.
    expect(portrait.style.width).toBe("calc(var(--print-w) * 0.5625)");
  });

  // Drawing a print narrower moved its edges without moving its seat, so two
  // portrait prints stood apart with stage showing between them. The seats are
  // overlaps now, so the neighbour is under the front whatever the shapes are.
  it("tucks a portrait print under a portrait front rather than beside it", async () => {
    window.history.replaceState(null, "", "/?zival=nina");
    renderGrid([PORTRAITS]);
    const dialog = await screen.findByRole("dialog");

    const seats: FanFactors = { [0]: PORTRAIT_FACTOR, [1]: PORTRAIT_FACTOR };
    const centre = seatCentre(1, 0, DESKTOP_DEPTHS, seats);
    expect(translateX(photoButton(dialog, "photo-spread", 2))).toBeCloseTo(
      -50 + (centre / PORTRAIT_FACTOR) * 100,
      6,
    );

    // Its inner edge is inside the front print's own edge, and by the share of
    // itself the tier's peek leaves hidden.
    const visible = PORTRAIT_FACTOR * DESKTOP_DEPTHS[0].scale;
    expect(PORTRAIT_FACTOR / 2 - (centre - visible / 2)).toBeCloseTo(
      (1 - DESKTOP_DEPTHS[0].peek) * visible,
      10,
    );
  });

  // "4 / 12" is the one thing on the stage that names the whole gallery, so on
  // a set the fan cannot show at once it is also the way into it.
  it("opens the contact sheet from the count on the front print", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    const count = region(dialog, "photo-spread").getByText("1 / 7");
    expect(count.getAttribute("title")).toBe("Vse fotografije");
    expect(count.className).toContain("cursor-pointer");

    fireEvent.click(count);

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
    const lightbox = slot(document.body, "photo-lightbox");
    // Straight onto the grid, not onto the photo the count was sitting on.
    expect(
      within(lightbox).getAllByRole("button", { name: /Pokaži fotografijo/ }),
    ).toHaveLength(7);
  });

  // The count used to be a Badge inside the front print's own button, with a
  // click handler on it: a control nested in a control, hidden from assistive
  // technology, and the only way to the contact sheet that a keyboard could
  // not reach at all. It is drawn over the print now, the way the chevrons
  // are, and it is named for what it does.
  it("makes the count a real way into a set past the fan's reach", async () => {
    window.history.replaceState(null, "", "/?zival=klopka");
    renderGrid([LONG]);
    const dialog = await screen.findByRole("dialog");

    const control = region(dialog, "photo-spread").getByRole("button", {
      name: "Vse fotografije (14)",
    });
    expect(control.textContent).toBe("1 / 14");
    expect(control.closest("button[aria-pressed]")).toBeNull();
    // The mark stays 20px and the hit area grows past it, because a bigger
    // chip on the photograph is the wrong answer on a phone.
    expect(control.className).toContain("after:-inset-2");

    fireEvent.click(control);

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
    expect(
      within(slot(document.body, "photo-lightbox")).getAllByRole("button", {
        name: /Pokaži fotografijo/,
      }),
    ).toHaveLength(14);
  });

  // Under SHEET_FROM there is no set behind the count to lead to, so it stays
  // a mark on the print: read as text, out of the accessibility tree, and the
  // live line under the stage says the same thing in words.
  it("keeps the count a mark on a set the fan shows at once", async () => {
    window.history.replaceState(null, "", "/?zival=trio");
    renderGrid([TRIO]);
    const dialog = await screen.findByRole("dialog");

    const mark = region(dialog, "photo-spread").getByText("1 / 3");
    expect(mark.tagName).toBe("SPAN");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.closest('button[aria-pressed="true"]')).toBeTruthy();
    expect(
      region(dialog, "photo-spread").queryByRole("button", {
        name: /Vse fotografije/,
      }),
    ).toBeNull();
  });

  // Five photos are exactly what the fan draws, so there is no set behind the
  // count for it to lead to.
  it("leaves the count a count where the fan shows every photo", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    const count = region(dialog, "photo-spread").getByText("1 / 2");
    expect(count.getAttribute("title")).toBeNull();
    expect(count.className).not.toContain("cursor-pointer");

    fireEvent.click(count);

    // The click reaches the photo button under it, which opens the one photo.
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
    expect(
      within(slot(document.body, "photo-lightbox")).queryAllByRole("button", {
        name: /Pokaži fotografijo/,
      }),
    ).toHaveLength(0);
  });

  // Only the five on stage are mounted, so a step past the edge used to pop a
  // blank frame in and fill it afterwards.
  it("warms the photos one step outside the fan, and not the ones in it", async () => {
    const preloads = capturePreloads();
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    // At photo 1 the fan holds 6, 7, 1, 2 and 3; 4 and 5 are what a step in
    // either direction brings in.
    await waitFor(() => expect(preloads.length).toBeGreaterThan(0));
    const asked = () => preloads.map((image) => image.src);
    expect(asked()).toContain("/media/animals/pika-4.webp");
    expect(asked()).toContain("/media/animals/pika-5.webp");
    for (const mounted of ["pika-1", "pika-2", "pika-3", "pika-6", "pika-7"]) {
      expect(asked()).not.toContain(`/media/animals/${mounted}.webp`);
    }
    // The same ladder and sizes the fan's own photos carry, so the fetch the
    // step then triggers is a cache hit rather than a second, different file.
    expect(preloads[0].sizes).toBe("(max-width: 639px) 80vw, 24rem");
    expect(preloads[0].srcset).toContain("-320.webp 320w");

    fireEvent.click(
      region(dialog, "photo-spread").getByRole("button", {
        name: "Naslednja fotografija",
      }),
    );

    // Front on photo 2, so the far edge has moved on to photo 6.
    await waitFor(() =>
      expect(asked()).toContain("/media/animals/pika-6.webp"),
    );
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

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(region(dialog, "photo-spread").getByText("Fotografija 2 od 2"))
      .toBeTruthy();
  });

  // The keys reach the stage by bubbling from the print that holds focus, and
  // a walk moves that print: three steps and it is more than two seats out,
  // dropped from the window, and unmounted with focus on it. Focus fell to the
  // dialog and the fan stopped answering the keyboard. It follows the front
  // now, so the next arrow lands and Enter opens the photo on show.
  it("carries the keyboard to the print that takes the front", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    photoButton(dialog, "photo-spread", 1).focus();
    fireEvent.keyDown(fan, { key: "ArrowRight" });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(document.activeElement).toBe(photoButton(dialog, "photo-spread", 2));

    fireEvent.keyDown(fan, { key: "ArrowRight" });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 3).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(document.activeElement).toBe(photoButton(dialog, "photo-spread", 3));
  });

  // Only focus that was on a print. A chevron walks the fan too, and it is
  // still there afterwards: taking the keyboard off it would be the fan
  // deciding where the visitor is.
  it("leaves focus on the chevron that walked the fan", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const next = region(dialog, "photo-spread").getByRole("button", {
      name: "Naslednja fotografija",
    });

    next.focus();
    fireEvent.click(next);

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 2).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(document.activeElement).toBe(next);
  });

  // Fourteen photos is a long walk one arrow at a time, so the fan answers the
  // two keys the card gallery already does. It walks to the ends rather than
  // jumping to them.
  it("walks to the last photo on End and back to the first on Home", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-spread");

    fireEvent.keyDown(fan, { key: "End" });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 7).getAttribute("aria-pressed"))
        .toBe("true"),
    );

    fireEvent.keyDown(fan, { key: "Home" });

    await waitFor(() =>
      expect(photoButton(dialog, "photo-spread", 1).getAttribute("aria-pressed"))
        .toBe("true"),
    );
    expect(region(dialog, "photo-spread").getByText("Fotografija 1 od 7"))
      .toBeTruthy();
  });

  // The fan is remounted per animal so its photos start over. A wash inside it
  // would go out with the old animal and come back from nothing, so it is
  // mounted above the fan and told the whole window of photos it is holding.
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

  // Every layer is a blurred image, which is the most expensive thing on the
  // stage. The window holds five prints and the wash holds three of them: the
  // outer two only ever showed their colour during a two-step walk, and there
  // it now arrives when the step lands.
  it("holds the wash to the front photo and its neighbours", async () => {
    window.history.replaceState(null, "", "/?zival=pika");
    renderGrid([MANY]);
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(washLayer(dialog, 0)).toBeTruthy());
    expect(
      slot(dialog, "photo-wash").querySelectorAll("[data-wash-offset]"),
    ).toHaveLength(3);
    for (const offset of [-1, 1]) {
      expect(washLayer(dialog, offset)).toBeTruthy();
    }
    // Five prints on stage, three washes behind them.
    expect(
      region(dialog, "photo-spread").getAllByRole("button", {
        name: /fotografijo \d/,
      }),
    ).toHaveLength(5);
  });

  // The layers are held together and blended off the fan's own walk, so a
  // commit has to leave the re-seated ones reading their new places rather
  // than the ones they had when the transform was first built.
  it("lands the wash on the new photo when a step commits", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(washLayer(dialog, 0)).toBeTruthy());
    expect(washLayer(dialog, 0).style.opacity).toBe("1");
    expect(washLayer(dialog, 1).style.opacity).toBe("0");

    fireEvent.click(photoButton(dialog, "photo-spread", 2));

    // Rex's two photos swap sides: the one that was next at +1 is now the
    // front at 0, and the one it replaced sits at -1.
    await waitFor(() =>
      expect(washImage(dialog).getAttribute("src")).toContain("rex-2"),
    );
    await waitFor(() => expect(washLayer(dialog, 0).style.opacity).toBe("1"));
    expect(washLayer(dialog, -1).style.opacity).toBe("0");
    expect(washImage(dialog, -1).getAttribute("src")).toContain("rex-1");
  });

  // Mid-gesture the colour is already changing: the next photo's layer comes
  // up as the print is pulled in, rather than switching when it lands.
  it("blends the next photo's wash in under the drag", async () => {
    fanLayout("phone");
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");
    const fan = slot(dialog, "photo-fan");

    await waitFor(() => expect(washLayer(dialog, 1).style.opacity).toBe("0"));

    // Held down, not released: the release would spring back or commit, and
    // what is being checked is the middle of the gesture.
    await act(async () => {
      pointer(fan, "pointerdown", { x: 300, y: 200, pointerType: "touch" });
      pointer(fan, "pointermove", { x: 260, y: 202, pointerType: "touch" });
    });

    await waitFor(() =>
      expect(Number(washLayer(dialog, 1).style.opacity)).toBeGreaterThan(0),
    );
    expect(Number(washLayer(dialog, 0).style.opacity)).toBeLessThan(1);
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

    fireEvent.click(edgeNav(dialog, "Naslednja žival"));

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

    fireEvent.click(edgeNav(dialog, "Naslednja žival"));
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

  // The edge arrows start at sm and the page keys they double for need a
  // keyboard, so a phone had one way to the next animal: close the dialog and
  // find the next card. The same two steps ride the title row below sm.
  //
  // jsdom draws no Tailwind, so which of the two pairs is on screen is pinned
  // in the browser suite (e2e/animal-dialog-mobile.spec.ts). What is pinned
  // here is that they are rendered, what they are labelled and where they go.
  it("puts both animal steps on the title row for a thumb", async () => {
    renderDialog(MURI, [REX.id, MURI.id, ADOPTED.id]);
    const dialog = await screen.findByRole("dialog");

    const previous = phoneNav(dialog, "previous");
    const next = phoneNav(dialog, "next");
    expect(previous?.getAttribute("aria-label")).toBe("Prejšnja žival");
    expect(next?.getAttribute("aria-label")).toBe("Naslednja žival");

    // Inside the title row's own group of controls and ahead of the share
    // button, so a row that wraps takes all of them to the next line together.
    const group = previous!.parentElement!;
    expect(group.contains(next)).toBe(true);
    const share = within(dialog).getByRole("button", { name: "Deli" });
    expect(group.contains(share)).toBe(true);
    const order = Array.from(group.children);
    expect(order.indexOf(previous!)).toBe(0);
    expect(order.indexOf(next!)).toBe(1);
    expect(group.parentElement?.contains(slot(dialog, "dialog-title"))).toBe(
      true,
    );
  });

  it("offers the first animal the next step and nothing before it", async () => {
    renderDialog(REX, [REX.id, MURI.id]);
    const dialog = await screen.findByRole("dialog");

    expect(phoneNav(dialog, "previous")).toBeNull();
    expect(phoneNav(dialog, "next")).toBeTruthy();
  });

  it("offers the last animal the previous step and nothing after it", async () => {
    renderDialog(MURI, [REX.id, MURI.id]);
    const dialog = await screen.findByRole("dialog");

    expect(phoneNav(dialog, "previous")).toBeTruthy();
    expect(phoneNav(dialog, "next")).toBeNull();
  });

  // A link to an animal the filters hide arrives with no list to step through,
  // the same as the edge arrows: no step is drawn rather than a dead one.
  it("drops both steps for an animal that is not on the list", async () => {
    renderDialog(MURI, [REX.id, ADOPTED.id]);
    const dialog = await screen.findByRole("dialog");

    expect(phoneNav(dialog, "previous")).toBeNull();
    expect(phoneNav(dialog, "next")).toBeNull();
  });

  it("steps to the neighbour the title row's button names", async () => {
    const onNavigate = renderDialog(MURI, [REX.id, MURI.id, ADOPTED.id]);
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(phoneNav(dialog, "next")!);
    expect(onNavigate).toHaveBeenLastCalledWith(ADOPTED.id);

    fireEvent.click(phoneNav(dialog, "previous")!);
    expect(onNavigate).toHaveBeenLastCalledWith(REX.id);
    expect(onNavigate).toHaveBeenCalledTimes(2);
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
    fanLayout("phone");
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
          phones={PHONES}
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

  // The box named a shelter and offered one way to it, and that way left the
  // site. The register holds a phone for fifteen of the seventeen and none of
  // it reached the animal anyone was reading about.
  it("offers the shelter's phone beside the listing", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterBlock
          animal={REX}
          logos={{}}
          phones={PHONES}
          reference={new Date(REFERENCE)}
        />
      </I18nProvider>,
    );

    // The visible label is the accessible name, channel word and all, which
    // is why the button carries no aria-label of its own.
    const call = screen.getByRole("link", { name: "Pokliči 03 749 06 00" });
    // E.164 rather than the printed grouping, so the number dials from a
    // foreign SIM as well. See telHref in lib/contact-links.ts.
    expect(call.getAttribute("href")).toBe("tel:+38637490600");
    // Secondary: the outline, beside the listing's filled button.
    expect(call.className).toContain("border-border");
    expect(call.className).not.toContain("bg-primary");
    expect(
      screen.getByRole("link", { name: /Odpri objavo pri zavetišču/ })
        .className,
    ).toContain("bg-primary");
  });

  it("draws no phone for a shelter the register holds none for", () => {
    const { container } = render(
      <I18nProvider locale="sl">
        <ShelterBlock
          animal={REX}
          logos={{}}
          phones={{}}
          reference={new Date(REFERENCE)}
        />
      </I18nProvider>,
    );

    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(
      screen.getByRole("link", { name: /Odpri objavo pri zavetišču/ }),
    ).toBeTruthy();
  });

  it("names the English button in English", () => {
    render(
      <I18nProvider locale="en">
        <ShelterBlock
          animal={REX}
          logos={{}}
          phones={PHONES}
          reference={new Date(REFERENCE)}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("link", { name: "Call 03 749 06 00" }),
    ).toBeTruthy();
  });

  // The shelter is named on every animal and, until the name became a link,
  // nothing on the page went to the page about it.
  it("sends the shelter's name to the shelter's own page", () => {
    render(
      <I18nProvider locale="en">
        <ShelterBlock
          animal={REX}
          logos={{}}
          phones={PHONES}
          reference={new Date(REFERENCE)}
        />
      </I18nProvider>,
    );

    expect(
      screen
        .getByRole("link", { name: "Zavetišče Test" })
        .getAttribute("href"),
    ).toBe("/en/shelters/test-shelter");
  });

  // The bar is the one action a phone must never scroll for, so it stays one
  // button. The number is in the box, which is where the two live together.
  it("keeps the phone out of the sticky bar", async () => {
    window.history.replaceState(null, "", "/?zival=rex");
    renderGrid();
    const dialog = await screen.findByRole("dialog");

    const bar = region(dialog, "sticky-cta");
    expect(bar.getAllByRole("link")).toHaveLength(1);
    expect(
      region(dialog, "shelter-block").getByRole("link", {
        name: "Pokliči 03 749 06 00",
      }),
    ).toBeTruthy();
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
        <ShelterBlock
          animal={REX}
          logos={{}}
          phones={PHONES}
          reference={new Date(REFERENCE)}
        />
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

// The seats are overlaps: a print shows a share of its own width past the
// print in front of it, rather than standing a fixed distance from the middle
// of the stage. What is pinned here is where a fan of 4:3 prints stands, that
// a fan of any other shape overlaps by the same share, and that the commit
// re-seats the window without anything jumping.
describe("fan seats", () => {
  // The fan the depth tables were read off: every print standard.
  const FLAT: FanFactors = { [-2]: 1, [-1]: 1, [0]: 1, [1]: 1, [2]: 1 };
  const PORTRAIT = 0.5625;

  // The first tier is still the old table read back as an overlap, so it has
  // not moved. The second tier has, on purpose: its peek was raised from the
  // derived 0.179 and 0.159 to 0.28 and 0.25, because the strip it showed was
  // too thin to read as a photograph.
  it("stands a fan of standard prints where the table says", () => {
    expect(seatCentre(1, 0, DESKTOP_DEPTHS, FLAT)).toBeCloseTo(0.58, 3);
    expect(seatCentre(2, 0, DESKTOP_DEPTHS, FLAT)).toBeCloseTo(0.7624, 3);
    expect(seatCentre(-1, 0, DESKTOP_DEPTHS, FLAT)).toBeCloseTo(-0.58, 3);
    expect(seatCentre(-2, 0, DESKTOP_DEPTHS, FLAT)).toBeCloseTo(-0.7624, 3);
    expect(seatCentre(1, 0, PHONE_DEPTHS, FLAT)).toBeCloseTo(0.56, 3);
    expect(seatCentre(2, 0, PHONE_DEPTHS, FLAT)).toBeCloseTo(0.7397, 3);
  });

  it("hides the same share of a print whatever shape the fan is", () => {
    // How much of the tier-one print the front covers, measured on the print.
    function hidden(factors: FanFactors) {
      const own = factors[1] ?? 1;
      const visible = own * DESKTOP_DEPTHS[0].scale;
      const inner = seatCentre(1, 0, DESKTOP_DEPTHS, factors) - visible / 2;
      return ((factors[0] ?? 1) / 2 - inner) / visible;
    }

    const portrait: FanFactors = { [0]: PORTRAIT, [1]: PORTRAIT };
    // Under the front, not beside it: the overlap is a positive share.
    expect(hidden(portrait)).toBeGreaterThan(0);
    // The share the peek leaves over, and the same one a 4:3 fan has always
    // had. A mixed pair is covered by exactly as much of itself too.
    expect(hidden(portrait)).toBeCloseTo(1 - DESKTOP_DEPTHS[0].peek, 10);
    expect(hidden(FLAT)).toBeCloseTo(hidden(portrait), 10);
    expect(hidden({ [0]: 1, [1]: PORTRAIT })).toBeCloseTo(hidden(portrait), 10);
  });

  // The walk commits by re-seating the window and zeroing the progress in the
  // same breath, so the seats either side of that have to agree. Mixed shapes,
  // because with one shape it would be true by symmetry.
  it("re-seats the window at the commit without moving a print", () => {
    const before: FanFactors = {
      [-2]: 1,
      [-1]: PORTRAIT,
      [0]: 1,
      [1]: PORTRAIT,
      [2]: 0.8,
    };
    // One photo forward: every print keeps its shape and takes the offset one
    // lower, and a new one arrives at the far edge.
    const after: FanFactors = {
      [-2]: PORTRAIT,
      [-1]: 1,
      [0]: PORTRAIT,
      [1]: 0.8,
      [2]: 1,
    };

    // The print at -2 is not in this: it wraps to the far side of the window,
    // which is a jump the fan has always made.
    for (const offset of [-1, 0, 1, 2]) {
      expect(seatCentre(offset, 1, DESKTOP_DEPTHS, before)).toBeCloseTo(
        seatCentre(offset - 1, 0, DESKTOP_DEPTHS, after),
        12,
      );
    }
  });

});

// The fan settles in the animal's own tempo, the same register the Energija
// filter reads in. The numbers themselves are a taste call; what is pinned
// here is the direction, because a table edited later must not quietly leave
// a calm animal snappier than a lively one.
describe("fan tempo", () => {
  it("keeps an unstated energy on the balanced numbers", () => {
    expect(fanTempo(undefined)).toEqual(fanTempo("balanced"));
  });

  it("settles a calm animal softer and a lively one sharper", () => {
    const balanced = fanTempo("balanced");

    expect(fanTempo("calm").spring.stiffness).toBeLessThan(
      balanced.spring.stiffness,
    );
    expect(fanTempo("calm").overshoot).toBeLessThan(balanced.overshoot);
    expect(fanTempo("lively").spring.stiffness).toBeGreaterThan(
      balanced.spring.stiffness,
    );
    expect(fanTempo("lively").overshoot).toBeGreaterThan(balanced.overshoot);
  });
});
