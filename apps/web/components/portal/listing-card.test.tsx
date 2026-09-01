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
import { PortalListingCard } from "@/components/portal/listing-card";
import { STATUS_META } from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalListingActions } from "@/hooks/use-portal-listings";
import type { PortalListing } from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out and has no Element.scrollTo. The form scrolls the
// dialog panel to the field it opens at and focuses it right after.
Element.prototype.scrollTo = vi.fn();

const IDLE = { status: "idle" } as const;

const PHOTO = {
  id: 7,
  url: "http://localhost:8000/media/listings/6d1c/3f2a9c.jpg",
  width: 1600,
  height: 1200,
};

function listing(overrides: Partial<PortalListing> = {}): PortalListing {
  return {
    providerId: "johanca",
    id: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
    species: "cat",
    status: "available",
    name: "Luna",
    sex: "female",
    breed: null,
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
    photos: [],
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

function fakeActions(): PortalListingActions {
  return {
    create: vi.fn().mockResolvedValue(listing()),
    update: vi.fn().mockResolvedValue(listing()),
    archive: vi.fn().mockResolvedValue(true),
    uploadPhoto: vi.fn().mockResolvedValue(PHOTO),
    deletePhoto: vi.fn().mockResolvedValue(true),
  };
}

function show(
  subject: PortalListing = listing(),
  saveState: Parameters<typeof PortalListingCard>[0]["saveState"] = IDLE,
) {
  const actions = fakeActions();
  render(
    <PortalListingCard
      listing={subject}
      saveState={saveState}
      actions={actions}
    />,
  );
  return { actions };
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

describe("what the card says about the listing", () => {
  it("names the breed between the species and the sex, then the age", () => {
    show(listing({ breed: "mešanec" }));

    expect(screen.getByText("Mačka · mešanec · samica · 2 leti")).toBeTruthy();
  });

  it("wears the status as a badge next to the name", () => {
    show(listing({ status: "reserved" }));

    const heading = screen.getByRole("heading", { name: "Luna" });
    const badge = heading.parentElement?.querySelector("span");
    expect(badge?.textContent).toBe(STATUS_META.reserved.label);
    expect(badge?.className).toContain("amber");
  });

  it("shows the first photo, sized by the stored copy", () => {
    show(listing({ photos: [PHOTO, { ...PHOTO, id: 8, url: "second" }] }));

    const image = document.querySelector("article img");
    expect(image?.getAttribute("src")).toBe(PHOTO.url);
    expect(image?.getAttribute("width")).toBe("1600");
  });

  it("carries no crawl provenance and no way back to one", () => {
    show();

    expect(screen.queryByText(portalText.statusFromSiteLine)).toBeNull();
    expect(screen.queryByText(portalText.statusOwnLine)).toBeNull();
    expect(screen.queryByRole("button", { name: /Povrni/ })).toBeNull();
    expect(statusButton("Na voljo").getAttribute("aria-pressed")).toBe("true");
    expect(statusButton("Na voljo").className).not.toContain("border-dashed");
  });
});

describe("changing the status from the card", () => {
  it("sends the whole listing with the status swapped", async () => {
    const { actions } = show(listing({ breed: "mešanec", goodWithKids: "yes" }));

    fireEvent.click(statusButton("Rezerviran"));

    await waitFor(() => {
      expect(actions.update).toHaveBeenCalledWith(listing().id, {
        species: "cat",
        name: "Luna",
        status: "reserved",
        sex: "female",
        breed: "mešanec",
        birthDate: null,
        approximateAgeMonths: 24,
        size: null,
        energy: null,
        goodWithKids: "yes",
        goodWithDogs: null,
        goodWithCats: null,
        apartmentOk: null,
        specialNeeds: null,
        shortDescription: null,
      });
    });
  });

  it("does nothing on the status the listing already has", () => {
    const { actions } = show();

    fireEvent.click(statusButton("Na voljo"));

    expect(actions.update).not.toHaveBeenCalled();
  });

  it("reports the outcome where the crawled card does", () => {
    show(listing(), { status: "error", message: portalText.saveError });

    expect(screen.getByRole("alert").textContent).toContain(
      portalText.saveError,
    );
  });
});

describe("fields the public filters need", () => {
  it("names every unanswered one", () => {
    show();

    const line = screen.getByText(portalText.missingTitle).parentElement;
    expect(line?.textContent).toContain("energija");
    expect(line?.textContent).toContain("otroci");
    expect(line?.textContent).toContain("psi");
    expect(line?.textContent).toContain("mačke");
    expect(line?.textContent).toContain("stanovanje");
  });

  it("says nothing when the shelter has answered all five", () => {
    show(
      listing({
        energy: "calm",
        goodWithKids: "yes",
        goodWithDogs: "no",
        goodWithCats: "unknown",
        apartmentOk: "yes",
      }),
    );

    expect(screen.queryByText(portalText.missingTitle)).toBeNull();
  });

  it("opens the form at the first field it names", async () => {
    show(listing({ energy: "calm" }));

    fireEvent.click(missingLine());

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(fill(portalText.editTitle, { name: "Luna" })),
    ).toBeTruthy();
    const row = dialog.querySelector('[data-field="goodWithKids"]');
    expect(row).toBeTruthy();
    await waitFor(() => {
      expect(row?.contains(document.activeElement)).toBe(true);
    });
  });

  it("names the line by what it says, not by a hidden label", () => {
    show();

    expect(missingLine().getAttribute("title")).toBe(
      fill(portalText.missingOpen, { name: "Luna" }),
    );
  });
});

describe("the way into the form", () => {
  it("opens the editor from Uredi podatke", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: portalText.edit }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(portalText.listingEditLead)).toBeTruthy();
  });
});
