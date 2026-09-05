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
import { animalPath } from "@/lib/animal-path";
import { animalsForClient } from "@/lib/dataset";
import { SITE_URL } from "@/lib/site";

// The dismiss gesture and the filter dock both read the viewport before they
// render, and jsdom reports 1024px. Copied from animal-dialog.test.tsx rather
// than shared: these two files are edited by different hands.
//
// Two answers that contradict each other on purpose: the dismiss gesture asks
// for the phone and gets it, and the fan asks for the desktop and gets that,
// because every assertion here reads the desktop stage. The fan mounts one
// layout only, chosen by this query, so a stub that answered "phone" to both
// would leave nothing at "photo-spread" to read.
const PHONE_LAYOUT = "(max-width: 639px)";
const FAN_LAYOUT = "(min-width: 640px)";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === PHONE_LAYOUT || media === FAN_LAYOUT,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function photos(id: string, count: number): Animal["images"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
    cachedUrl: `/media/animals/${id}-${index + 1}.webp`,
    width: 640,
    height: 480,
    widths: [320, 480, 640],
    blurDataURL: "data:image/webp;base64,UklGRg==",
    rights: "cache-permitted" as const,
  }));
}

// More photos than the fan shows at once, so a link can name one well past the
// first.
const MANY: Animal = {
  id: "pika",
  source: {
    providerId: "test-shelter",
    sourceAnimalId: "pika",
    sourceUrl: "https://example.test/animals/pika",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  },
  shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
  name: "Pika",
  species: "cat",
  status: "available",
  images: photos("pika", 7),
  attribution: "Foto: Zavetišče Test",
};

const REFERENCE = "2026-08-18T00:00:00.000Z";

function renderGrid() {
  return render(
    <I18nProvider locale="sl">
      <AnimalGrid
        animals={animalsForClient([MANY])}
        logos={{}}
        referenceDate={REFERENCE}
      />
    </I18nProvider>,
  );
}

function slot(root: HTMLElement, name: string) {
  const found = root.querySelector(`[data-slot="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${name}`);
  return found;
}

// The photo in front is labelled as the way into the lightbox, the rest as the
// way to the front, so both are matched on their number.
function photoButton(dialog: HTMLElement, n: number) {
  return within(slot(dialog, "photo-spread")).getByRole("button", {
    name: new RegExp(`fotografijo ${n}\\b`),
  });
}

async function openAt(location: string) {
  window.history.replaceState(null, "", location);
  renderGrid();
  return await screen.findByRole("dialog");
}

describe("a link that names a photo", () => {
  it("opens the fan on the photo it names", async () => {
    const dialog = await openAt("/?zival=pika&foto=3");

    await waitFor(() =>
      expect(photoButton(dialog, 3).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(photoButton(dialog, 1).getAttribute("aria-pressed")).toBe("false");
    // The parameter is the animal's own, so it survives the rewrite to the
    // page's address rather than being dropped with ?zival=.
    await waitFor(() =>
      expect(window.location.pathname).toBe(animalPath(MANY, "sl")),
    );
    expect(window.location.search).toBe("?foto=3");
  });

  it("falls back to the first photo when it names one that is not there", async () => {
    const dialog = await openAt("/?zival=pika&foto=99");

    // Seven photos, and nobody's ninety-ninth. A link that has outlived a
    // photo still opens the animal it was written for.
    expect(photoButton(dialog, 1).getAttribute("aria-pressed")).toBe("true");
  });

  it("hands out the photo the visitor stepped to", async () => {
    const dialog = await openAt("/?zival=pika");

    fireEvent.click(
      within(slot(dialog, "photo-spread")).getByRole("button", {
        name: "Naslednja fotografija",
      }),
    );
    await waitFor(() =>
      expect(photoButton(dialog, 2).getAttribute("aria-pressed")).toBe("true"),
    );

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Deli" }));
    });
    const heading = await screen.findByText("Deli to žival");
    const panel = heading.closest("[data-slot=popover-content]") as HTMLElement;

    // The address bar still says nothing about the photo: the share sheet is
    // the only place the parameter is written.
    expect(window.location.search).toBe("");
    expect(within(panel).getByLabelText("Povezava")).toHaveProperty(
      "value",
      `${SITE_URL}${animalPath(MANY, "sl")}?foto=2`,
    );
  });
});
