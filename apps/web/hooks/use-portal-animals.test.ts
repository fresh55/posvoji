// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePortalAnimals } from "@/hooks/use-portal-animals";
import { fetchAnimals, saveAnimal, type PortalAnimal } from "@/lib/portal-api";

// Only the two calls the hook makes are stubbed. PortalError and
// isUnauthorized stay the real ones, because the hook branches on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchAnimals: vi.fn(),
  saveAnimal: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(saveAnimal).mockReset();
});

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

async function load(list: PortalAnimal[]) {
  vi.mocked(fetchAnimals).mockResolvedValue(list);
  const view = renderHook(() => usePortalAnimals("testno", vi.fn()));
  await waitFor(() => expect(view.result.current.state.status).toBe("ready"));
  return view;
}

describe("the name the public site can already have a page for", () => {
  it("stays as the list loaded it when the shelter renames an animal", async () => {
    const { result } = await load([animal()]);
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({ name: "Murka", overrides: { name: "Murka" } }),
    );

    await act(async () => {
      await result.current.save("testno:1", { name: "Murka" });
    });

    // The card now says Murka, but the public page is still built under the
    // old name and will be until the next publication.
    expect(result.current.animals[0].name).toBe("Murka");
    expect(result.current.publicName(result.current.animals[0])).toBe("Muri");
  });

  it("catches up when the list is loaded again", async () => {
    const { result } = await load([animal()]);

    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ name: "Murka", overrides: { name: "Murka" } }),
    ]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.animals[0].name).toBe("Murka"));

    expect(result.current.publicName(result.current.animals[0])).toBe("Murka");
  });

  it("falls back to the animal's own name for one the list never carried", async () => {
    const { result } = await load([animal()]);

    expect(result.current.publicName(animal({ id: "testno:2" }))).toBe("Muri");
  });
});
