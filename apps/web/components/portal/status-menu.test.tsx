// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusMenu } from "@/components/portal/status-menu";
import { portalText } from "@/components/portal/portal-text";
import type { PortalAnimal } from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out, so it has neither of the two the menu reaches for
// while it positions and reveals itself.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

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

/** The pill, found by the control it is: its name starts with "Stanje". */
function pill(): HTMLElement {
  return screen.getByRole("button", {
    name: (name) => name.startsWith(portalText.statusLegend),
  });
}

function openMenu(): HTMLElement {
  // Radix opens on pointerdown or on Enter. jsdom's pointerdown arrives
  // without the button and pointerType fields the pointer path checks, so the
  // keyboard path is the one that works here.
  fireEvent.keyDown(pill(), { key: "Enter" });
  return screen.getByRole("menu");
}

describe("the pill", () => {
  it("says the status and whose answer it is", () => {
    render(<StatusMenu animal={animal()} busy={false} onSave={vi.fn()} />);

    // The visible word is the start of the name, so voice control can say the
    // pill (WCAG 2.5.3); the source rides along after it for a screen reader.
    const name = pill().textContent ?? "";
    expect(name).toContain("Na voljo");
    expect(name).toContain(portalText.statusSourceSite);
    expect(name).not.toContain(portalText.statusSourceOwn);
    // And it is drawn as inherited, not as an answer the shelter gave.
    expect(pill().className).toContain("border-dashed");
  });

  it("says the status is the shelter's own once they have set it", () => {
    render(
      <StatusMenu
        animal={animal({ status: "reserved", overrides: { status: "reserved" } })}
        busy={false}
        onSave={vi.fn()}
      />,
    );

    const name = pill().textContent ?? "";
    expect(name).toContain("Rezerviran");
    expect(name).toContain(portalText.statusSourceOwn);
    expect(pill().className).not.toContain("border-dashed");
  });

  it("says so when the crawl read no status at all", () => {
    render(
      <StatusMenu
        animal={animal({ status: null })}
        busy={false}
        onSave={vi.fn()}
      />,
    );

    expect(pill().textContent).toContain(portalText.statusUnknown);
    // Nothing was read, so there is no source to name.
    expect(pill().textContent).not.toContain(portalText.statusSourceSite);
  });

  it("cannot be opened while a save of this animal is in flight", () => {
    render(<StatusMenu animal={animal()} busy={true} onSave={vi.fn()} />);

    expect((pill() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("confirming what the site states", () => {
  it("offers the value the crawl read as the first thing in the menu", () => {
    const onSave = vi.fn();
    render(<StatusMenu animal={animal()} busy={false} onSave={onSave} />);
    openMenu();

    // menuitem, not menuitemradio: the four values are the radio group under
    // it, and confirming is the one save that settles an inherited value.
    const items = screen.getAllByRole("menuitem");
    expect(items[0]?.textContent).toContain("Potrdi: Na voljo");

    fireEvent.click(items[0]);
    expect(onSave).toHaveBeenCalledWith({ status: "available" });
  });

  it("is not offered once the status is the shelter's own", () => {
    render(
      <StatusMenu
        animal={animal({ overrides: { status: "available" } })}
        busy={false}
        onSave={vi.fn()}
      />,
    );
    openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /Potrdi/ }),
    ).toBeNull();
  });

  it("is not offered when the crawl read no status", () => {
    render(
      <StatusMenu
        animal={animal({ status: null })}
        busy={false}
        onSave={vi.fn()}
      />,
    );
    openMenu();

    expect(screen.queryByRole("menuitem", { name: /Potrdi/ })).toBeNull();
  });
});

describe("choosing a status", () => {
  it("saves the value the shelter picked", () => {
    const onSave = vi.fn();
    render(<StatusMenu animal={animal()} busy={false} onSave={onSave} />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Rezerviran" }));

    expect(onSave).toHaveBeenCalledWith({ status: "reserved" });
  });

  it("treats picking the crawled value as confirming it", () => {
    const onSave = vi.fn();
    render(<StatusMenu animal={animal()} busy={false} onSave={onSave} />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Na voljo" }));

    expect(onSave).toHaveBeenCalledWith({ status: "available" });
  });

  it("saves nothing when the value is already the shelter's answer", () => {
    const onSave = vi.fn();
    render(
      <StatusMenu
        animal={animal({ overrides: { status: "available" } })}
        busy={false}
        onSave={onSave}
      />,
    );
    openMenu();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Na voljo" }));

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("giving the status back to the crawl", () => {
  it("is offered once the shelter has answered, and clears the override", () => {
    const onSave = vi.fn();
    render(
      <StatusMenu
        animal={animal({ status: "adopted", overrides: { status: "adopted" } })}
        busy={false}
        onSave={onSave}
      />,
    );
    openMenu();

    const revert = screen.getByRole("menuitem", {
      name: portalText.statusRevertItem,
    });
    expect(revert.getAttribute("title")).toBe(portalText.revertHint);

    fireEvent.click(revert);
    expect(onSave).toHaveBeenCalledWith({ status: null });
  });

  it("is not offered while the status is still the crawl's reading", () => {
    render(<StatusMenu animal={animal()} busy={false} onSave={vi.fn()} />);
    openMenu();

    expect(
      screen.queryByRole("menuitem", { name: portalText.statusRevertItem }),
    ).toBeNull();
  });
});
