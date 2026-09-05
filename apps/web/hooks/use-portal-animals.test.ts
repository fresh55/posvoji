// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePortalAnimals } from "@/hooks/use-portal-animals";
import {
  PortalError,
  fetchAnimals,
  saveAnimal,
  type PortalAnimal,
} from "@/lib/portal-api";

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

async function load(list: PortalAnimal[], onUnauthorized = vi.fn()) {
  vi.mocked(fetchAnimals).mockResolvedValue(list);
  const view = renderHook(() => usePortalAnimals("testno", onUnauthorized));
  await waitFor(() => expect(view.result.current.state.status).toBe("ready"));
  return { ...view, onUnauthorized };
}

/**
 * saveAnimal held open, one entry per call, so a run can be stepped through
 * request by request. Concurrency is what is being measured here: how many
 * PUTs are in flight at once, and what the banner says between them.
 */
function heldSaves() {
  const queue: {
    resolve: (animal: PortalAnimal) => void;
    reject: (error: unknown) => void;
  }[] = [];
  vi.mocked(saveAnimal).mockImplementation(
    () =>
      new Promise<PortalAnimal>((resolve, reject) => {
        queue.push({ resolve, reject });
      }),
  );
  return queue;
}

/** What the PUT sent, as the pairs the assertions are written in. */
function sentPatches() {
  return vi.mocked(saveAnimal).mock.calls.map((call) => [call[1], call[2]]);
}

const CRAWLED = [
  animal({ id: "testno:1", status: "available" }),
  animal({ id: "testno:2", status: "reserved" }),
  animal({ id: "testno:3", status: "hold" }),
];

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

describe("confirming every status the crawl read", () => {
  it("sends each animal the status it already shows, and skips the answered one", async () => {
    const { result } = await load([
      ...CRAWLED,
      // Already the shelter's own answer. Re-sending it would be a write
      // nobody asked for, over a value they may have just changed.
      animal({
        id: "testno:4",
        status: "adopted",
        overrides: { status: "adopted" },
      }),
    ]);
    const queue = heldSaves();

    let run: Promise<void> = Promise.resolve();
    act(() => {
      run = result.current.confirmStatuses([
        "testno:1",
        "testno:2",
        "testno:3",
        "testno:4",
      ]);
    });

    // One at a time: the API writes to SQLite, which locks under parallel
    // writes, so the second PUT waits for the first to answer.
    expect(queue).toHaveLength(1);
    expect(sentPatches()).toEqual([["testno:1", { status: "available" }]]);
    expect(result.current.bulk).toEqual({
      status: "running",
      done: 0,
      total: 3,
    });

    await act(async () => {
      queue[0].resolve(
        animal({ id: "testno:1", overrides: { status: "available" } }),
      );
    });
    expect(result.current.bulk).toEqual({
      status: "running",
      done: 1,
      total: 3,
    });
    expect(queue).toHaveLength(2);
    expect(sentPatches()[1]).toEqual(["testno:2", { status: "reserved" }]);

    await act(async () => {
      queue[1].resolve(
        animal({
          id: "testno:2",
          status: "reserved",
          overrides: { status: "reserved" },
        }),
      );
    });
    expect(sentPatches()[2]).toEqual(["testno:3", { status: "hold" }]);
    await act(async () => {
      queue[2].resolve(
        animal({
          id: "testno:3",
          status: "hold",
          overrides: { status: "hold" },
        }),
      );
      await run;
    });

    expect(result.current.bulk).toEqual({ status: "done", total: 3 });
    // Replaced in place from each answer, so the list is what the server
    // stored and every row says it saved.
    expect(result.current.animals[1].overrides).toEqual({ status: "reserved" });
    expect(result.current.saveStates["testno:2"]).toEqual({ status: "saved" });
    expect(result.current.saveStates["testno:4"]).toBeUndefined();
  });

  it("counts what would not go through and leaves the rest saved", async () => {
    const { result } = await load(CRAWLED);
    const queue = heldSaves();

    let run: Promise<void> = Promise.resolve();
    act(() => {
      run = result.current.confirmStatuses([
        "testno:1",
        "testno:2",
        "testno:3",
      ]);
    });

    await act(async () => {
      queue[0].resolve(
        animal({ id: "testno:1", overrides: { status: "available" } }),
      );
    });
    await act(async () => {
      queue[1].reject(new PortalError(500));
    });
    await act(async () => {
      queue[2].resolve(
        animal({
          id: "testno:3",
          status: "hold",
          overrides: { status: "hold" },
        }),
      );
      await run;
    });

    expect(result.current.bulk).toEqual({
      status: "failed",
      failed: 1,
      total: 3,
    });
    expect(result.current.saveStates["testno:1"]).toEqual({ status: "saved" });
    expect(result.current.saveStates["testno:2"]?.status).toBe("error");
    expect(result.current.saveStates["testno:3"]).toEqual({ status: "saved" });
  });

  it("stops on a session that is over, and says so once", async () => {
    const onUnauthorized = vi.fn();
    const { result } = await load(
      [...CRAWLED, animal({ id: "testno:5" }), animal({ id: "testno:6" })],
      onUnauthorized,
    );
    const queue = heldSaves();

    let run: Promise<void> = Promise.resolve();
    act(() => {
      run = result.current.confirmStatuses([
        "testno:1",
        "testno:2",
        "testno:3",
        "testno:5",
        "testno:6",
      ]);
    });

    await act(async () => {
      queue[0].reject(new PortalError(401));
      await run;
    });

    // The one that was in flight, and not one of the four still queued.
    expect(queue).toHaveLength(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.bulk).toEqual({ status: "idle" });
  });
});
