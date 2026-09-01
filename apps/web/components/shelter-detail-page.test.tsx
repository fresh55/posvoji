// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelterDetailPage } from "./shelter-detail-page";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// A shelter whose town is the widest the register holds, because the town is
// half of what the line under the name has to fit.
const SHELTER = {
  id: "test-shelter",
  name: "Zavetišče Mala hiša",
  city: "Moravske Toplice",
};

const { ANIMALS } = vi.hoisted(() => ({
  ANIMALS: [1, 2, 3].map((n) => ({
    id: `test-shelter:${n}`,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: String(n),
      sourceUrl: "https://example.test/animals/1",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: {
      id: "test-shelter",
      name: "Zavetišče Mala hiša",
      city: "Moravske Toplice",
    },
    name: `Muri ${n}`,
    species: "cat" as const,
    status: "available" as const,
    medical: {},
    images: [],
    attribution: "Test fixture",
  })),
}));

// The register, the dataset and the logo manifest are all read off disk in
// production. Mocked so the hero under test is this shelter and these three
// animals rather than whatever data/dist happens to hold. animalsForClient
// stays the real one: the grid below the hero is handed its output.
vi.mock("@/lib/shelters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shelters")>()),
  getShelterBySlug: (slug: string) =>
    slug === SHELTER.id ? SHELTER : undefined,
  shelterRegisterDate: () => "2026-01-01",
}));
// shelterAnimals is mocked beside loadDataset rather than left to derive
// itself from it: it calls loadDataset within its own module, where this mock
// does not reach.
vi.mock("@/lib/dataset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dataset")>()),
  loadDataset: () => ({
    animals: ANIMALS,
    generatedAt: "2026-01-01T00:00:00.000Z",
  }),
  shelterAnimals: (shelterId: string) =>
    ANIMALS.filter((animal) => animal.shelter.id === shelterId),
}));
vi.mock("@/lib/shelter-logos", () => ({
  getShelterLogos: () => ({}),
}));

afterEach(cleanup);

function hero(container: HTMLElement) {
  const heading = container.querySelector("h1");
  if (!heading) throw new Error("hero heading not found");
  const column = heading.parentElement;
  const line = column?.querySelector("p");
  if (!column || !line) throw new Error("hero town line not found");
  return { heading, column, line };
}

// jsdom lays nothing out, so none of this can measure the overflow it is
// about. What it can hold is the mechanism: the classes that decide whether
// the line wraps or runs off the side of a 320px screen.
describe("the shelter page's hero", () => {
  it("wraps the town and count line rather than running it off the page", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    // Without flex-wrap the line's minimum width is the sum of its parts, and
    // beside a 170px logo at a 320px viewport that was 18px more than the
    // column had: the document scrolled sideways and the count was cut off.
    const { line } = hero(container);
    expect(line.className).toContain("flex-wrap");
    // Both facts are still printed. Wrapping, not truncation.
    expect(line.textContent).toContain("Moravske Toplice");
    expect(line.textContent).toContain("3 živali");
  });

  it("keeps the pin with the town and the middot with the count", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    // Each fact is one flex item, so a break falls between them rather than
    // leaving the pin or the separator alone at the end of a line.
    const { line } = hero(container);
    const groups = [...line.children].filter(
      (child) => child.tagName === "SPAN",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector("svg")).toBeTruthy();
    expect(groups[0].textContent).toBe("Moravske Toplice");
    expect(groups[1].textContent).toBe("·3 živali");
  });

  it("gives the name and town column a floor to wrap under the mark", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    // A shelter's mark draws up to 170px wide, which left this column about
    // 100px at 320px. min-w-0 let it be crushed to that; a floor makes the
    // row's flex-wrap move the column under the mark instead, where it has
    // the full width.
    const { column, heading } = hero(container);
    expect(column.className).toContain("min-w-40");
    expect(column.className).not.toContain("min-w-0");
    expect(column.parentElement?.className).toContain("flex-wrap");
    // And under the floor, a word wider than the column breaks rather than
    // the page.
    expect(heading.className).toContain("break-words");
  });

  it("wraps the same line on the English page", () => {
    const { container } = render(
      <ShelterDetailPage locale="en" slug={SHELTER.id} />,
    );

    // "3 animals" is wider than "3 živali", so the English hero was the worse
    // of the two overflows.
    const { line } = hero(container);
    expect(line.className).toContain("flex-wrap");
    expect(line.textContent).toContain("3 animals");
  });
});
