// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalDialog } from "@/hooks/use-animal-dialog";
import { animalFields } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";

// I18nProvider wraps everything in MotionConfig, which reads matchMedia when
// it resolves reducedMotion="user", and jsdom ships none.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function animal(id: string, name: string): Animal {
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
  };
}

const REX = animal("rex", "Rex");
const MURI = animal("muri", "Muri");
const ANIMALS = [REX, MURI].map(animalFields);

// The hook reads the address off the location store, so a test says where the
// visitor is by writing history before it renders.
function at(location: string) {
  window.history.replaceState(null, "", location);
  return renderHook(
    () => useAnimalDialog({ animals: ANIMALS, basePath: "/" }),
    {
      wrapper: ({ children }) => (
        <I18nProvider locale="sl">{children}</I18nProvider>
      ),
    },
  );
}

// ?foto= names a photo of one animal. Every way out of that animal has to drop
// it, or the next one opens on a picture nobody asked for, and a filter write
// on the way is not this hook's to touch.
describe("the photo a shared link named", () => {
  it("is left behind when the dialog steps to the next animal", async () => {
    const { result } = at(`${animalPath(REX, "sl")}?foto=3&vrsta=pes`);

    await act(async () => {
      result.current.swap("muri");
    });

    expect(window.location.pathname).toBe(animalPath(MURI, "sl"));
    expect(window.location.search).toBe("?vrsta=pes");
  });

  it("is left behind when another card is opened", async () => {
    const { result } = at(`${animalPath(REX, "sl")}?foto=3&vrsta=pes`);

    await act(async () => {
      result.current.open("muri");
    });

    expect(window.location.pathname).toBe(animalPath(MURI, "sl"));
    expect(window.location.search).toBe("?vrsta=pes");
  });

  it("goes back to the list with the dialog", async () => {
    // No pushed entry, so closing rewrites the address in place rather than
    // popping one: this is the deep-link path.
    const { result } = at(`${animalPath(REX, "sl")}?vrsta=pes&foto=3`);

    await act(async () => {
      result.current.close();
    });

    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?vrsta=pes");
  });

  it("survives the rewrite of an old ?zival= link", async () => {
    const { result } = at("/?zival=rex&foto=3");

    // Same animal, one address later: the photo it opens on is still its own.
    await waitFor(() =>
      expect(window.location.pathname).toBe(animalPath(REX, "sl")),
    );
    expect(window.location.search).toBe("?foto=3");
    expect(result.current.openId).toBe("rex");
  });
});
