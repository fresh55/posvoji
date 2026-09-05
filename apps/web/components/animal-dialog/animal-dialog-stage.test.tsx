// @vitest-environment jsdom

import type { ComponentProps } from "react";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";

// What a photo step costs the rest of the dialog.
//
// The fan is the only thing that moves when a picture is turned, and this file
// is here to keep it that way: the walk, the wash's window and the photo the
// share link names all used to be dialog state, so every step re-rendered the
// title row, the facts and the shelter block along with the photos. The render
// probe below is the assertion that says it no longer does.
//
// The helpers are copied from animal-dialog.test.tsx rather than shared: that
// file is the fan's own suite and this one is about what the fan does not
// touch.

// Bumped by every render of the card's subtree. The dialog renders ShelterBlock
// with no memo boundary between them, so one render of the dialog is one render
// of this.
const probe = vi.hoisted(() => ({ card: 0 }));

vi.mock("@/components/animal-dialog/shelter-block", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/animal-dialog/shelter-block")
    >();
  return {
    ...actual,
    ShelterBlock(props: ComponentProps<typeof actual.ShelterBlock>) {
      probe.card += 1;
      return <actual.ShelterBlock {...props} />;
    },
  };
});

// The fan reads the viewport to pick which geometry to mount, MotionConfig
// reads it again to resolve reducedMotion="user", and jsdom ships no
// matchMedia at all. jsdom reports 1024px wide, so the wide answer is the
// honest one and the fan mounts its desktop geometry.
const DESKTOP_FAN = "(min-width: 640px)";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === DESKTOP_FAN,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

beforeEach(() => {
  probe.card = 0;
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const REFERENCE = "2026-08-18T00:00:00.000Z";

function animal(id: string, name: string, count: number): Animal {
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
    species: "dog",
    status: "available",
    images: Array.from({ length: count }, (_, index) => ({
      sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
      cachedUrl: `/media/animals/${id}-${index + 1}.webp`,
      width: 640,
      height: 480,
      widths: [320, 480, 640],
      blurDataURL: "data:image/webp;base64,UklGRg==",
      rights: "cache-permitted" as const,
    })),
    attribution: "Foto: Zavetišče Test",
  };
}

const REX = animal("rex", "Rex", 3);
const MURI = animal("muri", "Muri", 3);

function dialogFor(subject: Animal) {
  const [client] = animalsForClient([subject]);
  return (
    <I18nProvider locale="sl">
      <AnimalDialog
        animal={client}
        logos={{}}
        phones={{}}
        siblingIds={[]}
        reference={new Date(REFERENCE)}
        onNavigate={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>
  );
}

function slot(root: HTMLElement, name: string) {
  const found = root.querySelector(`[data-slot="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${name}`);
  return found;
}

/** The fan on stage, whichever geometry the viewport asked for. */
function stage(dialog: HTMLElement) {
  const found = dialog.querySelector(
    '[data-slot="photo-spread"], [data-slot="photo-fan"]',
  );
  if (!(found instanceof HTMLElement)) throw new Error("no fan on stage");
  return found;
}

/** The print in front, which is the only one with aria-pressed="true". */
function frontLabel(dialog: HTMLElement) {
  const front = stage(dialog).querySelector('button[aria-pressed="true"]');
  return front?.getAttribute("aria-label");
}

function photoLabel(n: number) {
  return `Odpri fotografijo ${n} čez cel zaslon`;
}

/** The wash layer for the photo on show, and the blurred thumb inside it. */
function washSource(dialog: HTMLElement) {
  const img = slot(dialog, "photo-wash").querySelector(
    '[data-wash-offset="0"] img',
  );
  if (!(img instanceof HTMLImageElement)) throw new Error("no wash image yet");
  return img.getAttribute("src");
}

async function openDialog(subject: Animal, on = 1) {
  const view = render(dialogFor(subject));
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(frontLabel(dialog)).toBe(photoLabel(on)));
  return { view, dialog };
}

// Picked off the stack rather than through a chevron: a print is there in
// every geometry, and picking one is the same walk the chevron starts.
async function stepPhoto(dialog: HTMLElement, to: number) {
  await act(async () => {
    fireEvent.click(
      within(stage(dialog)).getByRole("button", {
        name: `Pokaži fotografijo ${to}`,
      }),
    );
  });
  // The pick hands the fan to a spring, and the step commits when it lands.
  await waitFor(() => expect(frontLabel(dialog)).toBe(photoLabel(to)));
}

/** The share sheet's own address field, which is the same link every target in
 *  the sheet hands over. */
async function shareLink(dialog: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Deli" }));
  });
  const heading = await screen.findByText("Deli to žival");
  const panel = heading.closest("[data-slot=popover-content]");
  if (!(panel instanceof HTMLElement)) throw new Error("no share sheet");
  return within(panel).getByLabelText("Povezava").getAttribute("value");
}

describe("the dialog's photo stage", () => {
  it("turns a photo without re-rendering the card", async () => {
    const { dialog } = await openDialog(REX);
    const before = probe.card;
    expect(before).toBeGreaterThan(0);

    await stepPhoto(dialog, 2);

    // The whole point: the fan walked, and nothing outside it was asked to
    // render again for it.
    expect(probe.card).toBe(before);
    // And the share link still learned about it, through the one wrapper that
    // subscribes to the fan's own store.
    expect(await shareLink(dialog)).toMatch(/\?foto=2$/);
  });

  it("re-seats the wash on a step", async () => {
    const { dialog } = await openDialog(REX);
    await waitFor(() => expect(washSource(dialog)).toContain("rex-1"));

    await stepPhoto(dialog, 2);

    // The wash is held above the fan's own remount, so a step has to re-seat
    // its layers rather than mount a new set of them.
    await waitFor(() => expect(washSource(dialog)).toContain("rex-2"));
  });

  // The number is cleared as an animal leaves rather than as the next one
  // arrives, which is what leaves the fan mounting for this one free to report
  // the photo the link asked for.
  it("keeps the photo a shared link opened on", async () => {
    window.history.replaceState(null, "", "/?foto=3");

    const { dialog } = await openDialog(REX, 3);

    expect(await shareLink(dialog)).toMatch(/\?foto=3$/);
  });

  it("starts the next animal's share link at its first photo", async () => {
    const { view, dialog } = await openDialog(REX);
    await stepPhoto(dialog, 2);

    await act(async () => {
      view.rerender(dialogFor(MURI));
    });
    const next = await screen.findByRole("dialog");
    await waitFor(() => expect(frontLabel(next)).toBe(photoLabel(1)));

    // ?foto= names a photo of one animal, so it cannot travel with the visitor.
    const link = await shareLink(next);
    expect(link).not.toContain("foto");
    expect(link).toContain("/zival/");
  });
});
