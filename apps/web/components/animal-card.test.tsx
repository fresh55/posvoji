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

function photos(count: number): Animal["images"] {
  return Array.from({ length: count }, (_, i) => ({
    sourceUrl: `https://example.test/photo-${i}.jpg`,
    rights: "display-permitted" as const,
  }));
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

    expect(screen.getByText("Čaka 3 leta")).toBeTruthy();
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

    expect(screen.getByText("rezervirano")).toBeTruthy();
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

    expect(screen.getByText("Waiting 3 years")).toBeTruthy();
  });
});

describe("AnimalCard status", () => {
  // The whole point of the badge: these two used to be carried by a
  // desaturated photograph and nothing else, which is no signal at all to a
  // visitor who cannot see the difference or does not know to look for one.
  it.each([
    ["hold", "ni za posvojitev"],
    ["adopted", "posvojeno"],
  ] as const)("says in words that a %s animal is not available", (status, word) => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ status })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(word)).toBeTruthy();
  });

  it("leaves an available animal unbadged", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard animal={animal()} reference={NOW} onOpen={() => undefined} />
      </I18nProvider>,
    );

    expect(screen.queryByText("na voljo")).toBeNull();
  });

  it("leaves an unknown status reading as available", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ status: "unknown" })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("article")?.textContent).not.toContain("voljo");
  });
});

/** The card's fact line, found through the heading it sits under rather than
 *  by taking the document's first <p>. */
function metaLine() {
  return screen.getByRole("heading").parentElement?.querySelector("p")
    ?.textContent;
}

describe("AnimalCard meta line", () => {
  it("names the species when the grid is showing all of them", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ sex: "male", approximateAgeMonths: 36 })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // The middots are spans of their own now, so the sentence is read off the
    // element rather than matched as one text node. Found through the card's
    // heading, so it stays the meta line even if the card grows another <p>.
    expect(metaLine()).toBe("Pes · samec · 3 leta");
  });

  it("drops the species once a tab has already said it", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ sex: "male", approximateAgeMonths: 36 })}
          reference={NOW}
          species="dog"
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(metaLine()).toBe("samec · 3 leta");
  });
});

describe("AnimalCard element placement", () => {
  it("keeps the status on the photo and out of the name's row", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ status: "reserved" })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // One copy, at every width, on the thing it disqualifies. It used to be
    // two DOM copies swapped by a breakpoint, and the phone one sat between
    // the two links, inside neither.
    const badges = screen.getAllByText("rezervirano");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest('[data-slot="photo-frame"]')).toBeNull();
    expect(badges[0].parentElement?.querySelector("[data-slot=\"photo-frame\"]")).toBeTruthy();
    // And it is not inside the card's link, competing with the name.
    expect(badges[0].closest("a")).toBeNull();
  });

  it("puts the wait on the photo, not in the name's row", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // The name has its line to itself, and the wait sits on the photo: a fact
    // about the animal's circumstance rather than one of its own.
    const name = screen.getByText("Rex");
    const wait = screen.getByText(/Čaka/);
    expect(name.closest("a")).toBeTruthy();
    // On the photo, and outside the card's link rather than inside it.
    expect(wait.closest("a")).toBeNull();
    expect(name.parentElement?.contains(wait)).toBe(false);
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
    // page linking to itself once per animal on it. Both spellings, because
    // the line draws the name with its leading noun taken off.
    expect(screen.queryByText("Zavetišče Test")).toBeNull();
    expect(screen.queryByText("Test")).toBeNull();
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
    // That text is the shelter's name with the leading noun taken off, which
    // is what the line draws (see shelterChipLabel).
    const link = screen.getByRole("link", { name: "Test" });
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
      screen.getByRole("link", { name: "Test" }).getAttribute("href"),
    ).toBe("/en/shelters/test-shelter");
  });
});

describe("AnimalCard keyboard", () => {
  it("steps the gallery with the arrows on the card's own link", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ images: photos(3) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // The visible marker is a row of dots with no text, so where the gallery
    // is gets read from the sr-only line the same index drives.
    const spoken = () => document.querySelector('[data-slot="photo-position"]')?.textContent;
    const link = screen.getByText("Rex").closest("a")!;
    expect(spoken()).toContain("1 od 3");

    fireEvent.keyDown(link, { key: "ArrowRight" });
    expect(spoken()).toContain("2 od 3");

    // And it wraps backwards past the first photo.
    fireEvent.keyDown(link, { key: "ArrowLeft" });
    fireEvent.keyDown(link, { key: "ArrowLeft" });
    expect(spoken()).toContain("3 od 3");
  });

  it("leaves other keys to the browser", () => {
    const opened: string[] = [];
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ images: photos(3) })}
          reference={NOW}
          onOpen={(id) => opened.push(id)}
        />
      </I18nProvider>,
    );

    const link = screen.getByText("Rex").closest("a")!;
    fireEvent.keyDown(link, { key: "ArrowDown" });
    expect(document.querySelector('[data-slot="photo-position"]')?.textContent).toContain("1 od 3");
    expect(opened).toEqual([]);
  });

  it("keeps the photo out of the tab order and out of the a11y tree", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ images: photos(2) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    // One animal, one link. The photo is still an anchor so a held modifier
    // deep links, but it is not a second name for the same place.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const photoLink = document.querySelector('[data-slot="photo-frame"] a')!;
    expect(photoLink.getAttribute("tabindex")).toBe("-1");
    expect(photoLink.getAttribute("aria-hidden")).toBe("true");
  });
});
