// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalAnimalCard } from "@/components/portal/animal-card";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalAnimal, PortalShelter } from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out and has no Element.scrollTo. The editor scrolls the
// dialog panel to the field it opens at and focuses it right after, so
// without this the scroll throws and the focus never happens.
Element.prototype.scrollTo = vi.fn();

const IDLE = { status: "idle" } as const;

const SHELTER: PortalShelter = {
  slug: "testno",
  name: "Zavetišče Testno",
  city: "Ljubljana",
};

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

function statusButton(name: string): HTMLElement {
  const group = screen.getByRole("group", { name: portalText.statusLegend });
  return within(group).getByRole("button", { name });
}

/** The "manjka" line, found by the text it shows: that is its whole name. */
function missingLine(): HTMLElement {
  return screen.getByRole("button", {
    name: (name) => name.startsWith(portalText.missingTitle),
  });
}

describe("status provenance", () => {
  it("shows a crawled status as read from the shelter's own site", () => {
    render(
      <PortalAnimalCard
        animal={animal()}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    // A sentence under the buttons, not a corner mark with a hover title: it
    // is the only form of this a touch user can read.
    expect(screen.getByText(portalText.statusFromSiteLine)).toBeTruthy();
    expect(screen.queryByText(portalText.statusOwnLine)).toBeNull();
    // Still the effective value, so the control reports what is true now.
    expect(statusButton("Na voljo").getAttribute("aria-pressed")).toBe("true");
    // But drawn as inherited, not as an answer the shelter gave.
    expect(statusButton("Na voljo").className).toContain("border-dashed");
  });

  it("lets the shelter confirm the value the site already states", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <PortalAnimalCard
        animal={animal()}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={onSave}
      />,
    );

    statusButton("Na voljo").click();

    expect(onSave).toHaveBeenCalledWith({ status: "available" });
  });

  it("drops the inherited mark once the shelter has set the status", () => {
    render(
      <PortalAnimalCard
        animal={animal({
          status: "reserved",
          overrides: { status: "reserved" },
        })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText(portalText.statusFromSiteLine)).toBeNull();
    expect(statusButton("Rezerviran").className).not.toContain("border-dashed");
    // The same row now says the value is theirs and that a later crawl will
    // not move it.
    expect(screen.getByText(portalText.statusOwnLine)).toBeTruthy();
    // A value the shelter set can be given back to the crawl.
    expect(screen.getByRole("button", { name: /Povrni/ })).toBeTruthy();
  });

  it("says nothing about a source when the crawl read no status", () => {
    render(
      <PortalAnimalCard
        animal={animal({ status: null })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(portalText.statusUnknown)).toBeTruthy();
    expect(screen.queryByText(portalText.statusFromSiteLine)).toBeNull();
    expect(screen.queryByText(portalText.statusOwnLine)).toBeNull();
  });
});

describe("fields the public filters need", () => {
  it("names every unanswered one", () => {
    render(
      <PortalAnimalCard
        animal={animal()}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    const line = screen.getByText(portalText.missingTitle).parentElement;
    expect(line?.textContent).toContain("energija");
    expect(line?.textContent).toContain("otroci");
    expect(line?.textContent).toContain("psi");
    expect(line?.textContent).toContain("mačke");
    expect(line?.textContent).toContain("stanovanje");
  });

  it('counts "unknown" as answered, the way the schema does', () => {
    render(
      <PortalAnimalCard
        animal={animal({ goodWithKids: "unknown", energy: "calm" })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    const line = screen.getByText(portalText.missingTitle).parentElement;
    expect(line?.textContent).not.toContain("otroci");
    expect(line?.textContent).not.toContain("energija");
    expect(line?.textContent).toContain("psi");
  });

  it("says nothing when the shelter has answered all five", () => {
    render(
      <PortalAnimalCard
        animal={animal({
          energy: "calm",
          goodWithKids: "yes",
          goodWithDogs: "no",
          goodWithCats: "unknown",
          apartmentOk: "yes",
        })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText(portalText.missingTitle)).toBeNull();
  });

  it("opens the editor at the first field it names", async () => {
    render(
      <PortalAnimalCard
        animal={animal({ energy: "calm" })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(missingLine());

    // The editor is the dialog behind the line, opened by the line itself.
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(fill(portalText.editTitle, { name: "Muri" })),
    ).toBeTruthy();

    // Opening it is only half the job: energy is answered here, so the first
    // field the line names is goodWithKids, and that is the row the dialog
    // has to hand the shelter. The editor focuses it one frame after the
    // open, so the assertion waits for that frame.
    const row = dialog.querySelector('[data-field="goodWithKids"]');
    expect(row).toBeTruthy();
    await waitFor(() => {
      expect(row?.contains(document.activeElement)).toBe(true);
    });
  });

  it("names the line by what it says, not by a hidden label", () => {
    render(
      <PortalAnimalCard
        animal={animal()}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    // WCAG 2.5.3: the visible text is the accessible name, so a voice
    // control user can say it. The explanation rides along as the title.
    expect(missingLine().getAttribute("title")).toBe(
      fill(portalText.missingOpen, { name: "Muri" }),
    );
  });
});

describe("confirming an inherited status", () => {
  function confirmButton(): HTMLElement | null {
    return screen.queryByRole("button", {
      name: portalText.statusConfirmLabel,
    });
  }

  it("pins the value the site states as the shelter's own", () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <PortalAnimalCard
        animal={animal()}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={onSave}
      />,
    );

    const confirm = confirmButton();
    expect(confirm?.textContent).toContain(portalText.statusConfirm);
    // WCAG 2.5.3: the label starts with the word on the button, so voice
    // control can say it. And it is drawn at 24px, so touch gets the layer.
    expect(
      portalText.statusConfirmLabel.startsWith(portalText.statusConfirm),
    ).toBe(true);
    expect(confirm?.className).toContain("max-lg:tap-target");
    confirm?.click();

    expect(onSave).toHaveBeenCalledWith({ status: "available" });
  });

  it("is not offered once the shelter has answered", () => {
    render(
      <PortalAnimalCard
        animal={animal({
          status: "reserved",
          overrides: { status: "reserved" },
        })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    expect(confirmButton()).toBeNull();
  });

  it("is not offered when the crawl read no status at all", () => {
    render(
      <PortalAnimalCard
        animal={animal({ status: null })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    expect(confirmButton()).toBeNull();
  });
});

describe("what the card says about the animal", () => {
  it("names the breed between the species and the sex", () => {
    render(
      <PortalAnimalCard
        animal={animal({ breed: "mešanec" })}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(/Mačka · mešanec · samica/)).toBeTruthy();
  });

  it("links to the animal's public page under the shelter's town", () => {
    render(
      <PortalAnimalCard
        animal={animal()}
        shelter={SHELTER}
        saveState={IDLE}
        onSave={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: portalText.publicListing });
    // animalPath()'s output: the name with the id's suffix, then the town and
    // the shelter, under the Slovenian prefix.
    expect(link.getAttribute("href")).toMatch(
      /^\/zival\/muri-[0-9a-f]{6}\/ljubljana\/testno$/,
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
