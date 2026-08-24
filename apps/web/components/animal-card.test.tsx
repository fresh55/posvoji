// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalCard } from "@/components/animal-card";
import { I18nProvider } from "@/components/i18n-provider";
import { LONG_STAY_MONTHS } from "@/lib/labels";

afterEach(cleanup);

const NOW = new Date("2026-01-01T00:00:00.000Z");

function animal(rest: Partial<Animal> = {}): Animal {
  return {
    id: "rex",
    source: {
      providerId: "test-shelter",
      sourceAnimalId: "rex",
      sourceUrl: "https://example.test/animals/rex",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
    name: "Rex",
    species: "dog",
    status: "available",
    images: [],
    attribution: "Foto: Zavetišče Test",
    ...rest,
  };
}

// Anchored so `monthsInShelter(intakeDate, NOW)` lands exactly on the given
// month count, independent of calendar day-of-month quirks.
function intakeMonthsAgo(months: number): string {
  const date = new Date(NOW);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

describe("AnimalCard long-stay mark", () => {
  it("shows the wait for an available animal past the long-stay threshold", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // Two copies exist below/above the sm breakpoint (see the "name row on
    // narrow phones" tests below for which is which).
    expect(screen.getAllByText("Čaka že 3 leta").length).toBeGreaterThan(0);
  });

  it("shows nothing for an animal under the threshold", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({
            intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS - 1),
          })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(/Čaka/)).toBeNull();
  });

  it("shows the reserved tag and no mark for a reserved animal", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({
            status: "reserved",
            intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS),
          })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // Two copies (the photo overlay and the name-row one), same reason.
    expect(screen.getAllByText("rezerviran").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Čaka/)).toBeNull();
  });

  it("renders the English wording", () => {
    render(
      <I18nProvider locale="en">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText("Waiting 3 years").length).toBeGreaterThan(0);
  });
});

describe("AnimalCard name row on narrow phones", () => {
  it("moves the reserved badge onto the photo and off the name's row below sm", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ status: "reserved" })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // Two copies exist so each breakpoint gets its own: the photo overlay is
    // the one below sm, the row copy is sm and up. Below sm the row copy
    // used to fight the name and a reserved badge for the same line.
    const badges = screen.getAllByText("rezerviran");
    expect(badges).toHaveLength(2);
    const overlayBadge = badges.find((node) => node.className.includes("sm:hidden"));
    const rowBadge = badges.find((node) => node.className.includes("sm:inline"));
    expect(overlayBadge).toBeTruthy();
    expect(rowBadge).toBeTruthy();
    expect(rowBadge?.className).toContain("hidden");
  });

  it("gives the long-stay wait its own line below sm instead of sharing the name's row", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // The name's row keeps a copy hidden below sm (sm:inline-flex) and a
    // second copy below the meta line, visible only below sm, takes over
    // there instead.
    const name = screen.getByText("Rex");
    const nameRow = name.parentElement;
    const rowWait = nameRow?.querySelector(".sm\\:inline-flex");
    const ownLineWait = name
      .closest("a")
      ?.querySelector("p.sm\\:hidden");
    expect(rowWait?.className).toContain("hidden");
    expect(ownLineWait).toBeTruthy();
    expect(ownLineWait?.textContent).toContain("Čaka");
  });
});

describe("AnimalCard shelter line", () => {
  it("draws no shelter line at all unless asked for one", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard animal={animal()} reference={NOW} onOpen={() => undefined} />
      </I18nProvider>,
    );

    // A shelter's own page renders these cards. There the line would be the
    // page linking to itself once per animal on it.
    expect(screen.queryByText("Zavetišče Test")).toBeNull();
  });

  it("links to the shelter's own page without opening the animal", () => {
    const opened: string[] = [];
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal()}
          reference={NOW}
          onOpen={(id) => opened.push(id)}
          showShelter
        />
      </I18nProvider>,
    );

    // The link's own text is its accessible name, so this is also the check
    // that nothing wrapped it in a label that talks over the visible words.
    const link = screen.getByRole("link", { name: "Zavetišče Test" });
    expect(link.getAttribute("href")).toBe("/zavetisca/test-shelter");

    fireEvent.click(link);
    // The line sits beside the card's own link rather than inside it, so a
    // click here can never also be a click on the animal.
    expect(opened).toEqual([]);
  });

  it("keeps the link inside the English tree of pages", () => {
    render(
      <I18nProvider locale="en">
        <AnimalCard
          animal={animal()}
          reference={NOW}
          onOpen={() => undefined}
          showShelter
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("link", { name: "Zavetišče Test" }).getAttribute("href"),
    ).toBe("/en/shelters/test-shelter");
  });
});
