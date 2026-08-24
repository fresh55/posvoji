// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { ShelterDetails } from "./shelter-details";

afterEach(() => cleanup());

function renderDetails(summary?: ShelterSummary) {
  // No Dialog and no Collapsible around it: this is content only, and it has
  // to render the same wherever the caller puts it. The collapsible that
  // wraps it in the list is shelter-rows.tsx's own business.
  return render(
    <I18nProvider locale="sl">
      <ShelterDetails summary={summary} />
    </I18nProvider>,
  );
}

// Every alt text a face thumb carries is the animal's own name, never blank,
// which is what tells a face image apart from any other image without leaning
// on next/image's own src rewriting.
function faceAltTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img"))
    .map((img) => img.getAttribute("alt") ?? "")
    .filter((alt) => alt !== "");
}

describe("ShelterDetails faces", () => {
  it("fans out the waiting animals' photos, longest wait first", () => {
    const { container } = renderDetails({
      species: [{ species: "dog", count: 4 }],
      longestWaiting: { name: "Mila", duration: "10 let" },
      faces: [
        { name: "Mila", src: "/media/animals/mila.webp" },
        { name: "Bine", src: "/media/animals/bine.webp" },
      ],
    });

    expect(faceAltTexts(container)).toEqual(["Mila", "Bine"]);
  });

  it("renders the rest for a shelter with no photographed animal", () => {
    const { container } = renderDetails({
      species: [{ species: "cat", count: 2 }],
      longestWaiting: { name: "Rex", duration: "2 leti" },
    });

    expect(faceAltTexts(container)).toEqual([]);
    expect(container.querySelector("[data-pick-species='cat']")).toBeTruthy();
    expect(screen.getByText(/Rex/)).toBeTruthy();
  });
});

describe("ShelterDetails species", () => {
  it("names every species it counts, so the icons are not the only label", () => {
    const { container } = renderDetails({
      species: [
        { species: "dog", count: 4 },
        { species: "cat", count: 1 },
      ],
    });

    const chips = Array.from(
      container.querySelectorAll("[data-pick-species]"),
    ).map((chip) => chip.getAttribute("aria-label"));
    expect(chips).toEqual(["Pes: 4", "Mačka: 1"]);
  });
});

// The panel opens under a row that already carries the shelter's name, city
// and count, so an empty panel would be a blank strip answering the info
// control rather than an answer. Absent beats empty.
describe("ShelterDetails with nothing to say", () => {
  it("renders nothing when the picker has no summaries at all", () => {
    const { container } = renderDetails(undefined);

    expect(container.querySelector("[data-shelter-details]")).toBeNull();
  });

  it("renders nothing for a summary with no species, no faces and no wait", () => {
    const { container } = renderDetails({ species: [] });

    expect(container.querySelector("[data-shelter-details]")).toBeNull();
  });
});

// The header this component used to carry (avatar, name, city, check) is the
// row's job now, and the X that closed the old floating card is gone with it:
// collapsing is what the row's own info control does, and un-picking is what
// the toggle and the map marker do.
describe("ShelterDetails chrome", () => {
  it("carries no control of its own", () => {
    renderDetails({
      species: [{ species: "dog", count: 4 }],
      longestWaiting: { name: "Mila", duration: "10 let" },
      faces: [{ name: "Mila", src: "/media/animals/mila.webp" }],
    });

    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
