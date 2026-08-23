// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { MapPickCard } from "./map-pick-card";
import type { ShelterRow } from "./shelter-rows";
import type { MapPick } from "./shelter-map";

afterEach(() => cleanup());

const rows: ShelterRow[] = [
  { value: "sever", label: "Zavetišče Sever", city: "Celje" },
  { value: "jug", label: "Zavetišče Jug", city: "Koper" },
];

const counts = new Map([
  ["sever", 4],
  ["jug", 2],
]);

function renderCard(
  props: Partial<Parameters<typeof MapPickCard>[0]> & { pick: MapPick },
) {
  const onToggle = vi.fn();
  const onDismiss = vi.fn();
  // No Dialog around it any more: the card used to end in a DialogClose
  // button and needed the context for it, and now the dialog's one primary
  // action lives in the footer where the count is.
  const view = render(
    <I18nProvider locale="sl">
      <MapPickCard
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={onToggle}
        onDismiss={onDismiss}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...view, onToggle, onDismiss };
}

// Every alt text a face thumb carries is the animal's own name, never blank,
// so this is what tells a face image apart from the avatar's logo image
// (alt="") without leaning on next/image's own src rewriting.
function faceAltTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img"))
    .map((img) => img.getAttribute("alt") ?? "")
    .filter((alt) => alt !== "");
}

describe("MapPickCard faces", () => {
  const summaries = new Map<string, ShelterSummary>([
    [
      "sever",
      {
        species: [{ species: "dog", count: 4 }],
        longestWaiting: { name: "Mila", duration: "10 let" },
        faces: [
          { name: "Mila", src: "/media/animals/mila.webp" },
          { name: "Bine", src: "/media/animals/bine.webp" },
        ],
      },
    ],
    [
      "jug",
      {
        species: [{ species: "cat", count: 2 }],
        longestWaiting: { name: "Rex", duration: "2 leti" },
        faces: [{ name: "Rex", src: "/media/animals/rex.webp" }],
      },
    ],
  ]);

  it("fans out the waiting animals' photos, longest wait first, for a single shelter", () => {
    const { container } = renderCard({
      pick: { kind: "shelter", value: "sever" },
      summaries,
    });

    expect(faceAltTexts(container)).toEqual(["Mila", "Bine"]);
  });

  it("shows no fan for a group pick, even though its shelters have faces of their own", () => {
    const { container } = renderCard({
      pick: { kind: "group", label: "Obala", values: ["sever", "jug"] },
      summaries,
    });

    expect(faceAltTexts(container)).toEqual([]);
    // The rows inside the group card each name their shelter as plain text,
    // not as a face, so the shelter names are on the page for another
    // reason entirely and the fan is still simply absent.
    expect(screen.getByText("Zavetišče Sever")).toBeTruthy();
  });

  it("renders nothing extra for a shelter with no photographed animal", () => {
    const { container } = renderCard({
      pick: { kind: "shelter", value: "jug" },
      summaries: new Map<string, ShelterSummary>([
        ["jug", { species: [{ species: "cat", count: 2 }] }],
      ]),
    });

    expect(faceAltTexts(container)).toEqual([]);
  });

  it("still renders the card with no fan when the picker has no summaries at all", () => {
    const { container } = renderCard({
      pick: { kind: "shelter", value: "sever" },
    });

    expect(screen.getByText("Zavetišče Sever")).toBeTruthy();
    expect(faceAltTexts(container)).toEqual([]);
  });
});

describe("MapPickCard avatar", () => {
  it("shows the shelter's own mark next to its name", () => {
    const summaries = new Map<string, ShelterSummary>([
      [
        "sever",
        {
          species: [],
          logo: {
            url: "/media/shelter-logos/sever.png",
            tone: "dark",
            width: 120,
            height: 40,
          },
        },
      ],
    ]);
    const { container } = renderCard({
      pick: { kind: "shelter", value: "sever" },
      summaries,
    });

    // The logo renders with an empty alt (see ShelterAvatar): decorative,
    // because the shelter's name is already the text right beside it.
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.some((img) => img.getAttribute("alt") === "")).toBe(true);
  });

  it("falls back to the shelter's initial letter when the logo fetch found nothing", () => {
    const summaries = new Map<string, ShelterSummary>([
      ["sever", { species: [] }],
    ]);
    const { container } = renderCard({
      pick: { kind: "shelter", value: "sever" },
      summaries,
    });

    expect(screen.getByText("Z")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("gives a group pick no avatar at all: there is no single shelter to put a face to", () => {
    const { container } = renderCard({
      pick: { kind: "group", label: "Obala", values: ["sever", "jug"] },
    });

    // No fallback letter and no logo image anywhere in the card.
    expect(container.querySelectorAll("img").length).toBe(0);
  });
});

// The X used to drop a selected shelter outright (see the onDrop prop this
// card no longer takes) and only close for a group. Every map activation is a
// plain toggle now, so the corner control has one job for both pick kinds:
// close the card, and never touch the selection. Un-picking a shelter is what
// clicking it again, or its row's own toggle, is for.
describe("MapPickCard corner control", () => {
  it("only closes the card for a shelter pick, leaving the selection alone", () => {
    const { onToggle, onDismiss } = renderCard({
      pick: { kind: "shelter", value: "sever" },
      selected: ["sever"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapri kartico" }));

    expect(onToggle).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("only closes the card for a group pick, the same as for a shelter", () => {
    const { onToggle, onDismiss } = renderCard({
      pick: { kind: "group", label: "Obala", values: ["sever", "jug"] },
      selected: ["sever", "jug"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapri kartico" }));

    expect(onToggle).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("carries no confirm button of its own", () => {
    renderCard({
      pick: { kind: "shelter", value: "sever" },
      selected: ["sever"],
    });

    // It used to end in "Prikaži živali", which sat under one shelter's own
    // count and applied every filter in the dialog.
    expect(screen.queryByRole("button", { name: /Prikaži/ })).toBeNull();
  });
});

// jsdom never evaluates a media query, so this checks the class that hides
// the card below lg rather than a computed layout. The real assertion that
// the card is actually invisible on a phone lives in e2e/shelter-map.spec.ts.
describe("MapPickCard breakpoint visibility", () => {
  it("carries the class that hides it below lg", () => {
    const { container } = renderCard({
      pick: { kind: "shelter", value: "sever" },
      selected: ["sever"],
    });

    const root = container.querySelector("[data-map-pick-card]")!;
    expect(root.className).toContain("max-lg:hidden");
  });
});
