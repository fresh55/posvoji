// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LucideIcon } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalCard } from "@/components/animal-card";
import { I18nProvider } from "@/components/i18n-provider";
import type { ClientAnimal } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { animalsForClient } from "@/lib/dataset";
import { LONG_STAY_MONTHS } from "@/lib/labels";

afterEach(cleanup);

/** What one lucide icon draws, as the DOM serialises it. The card's empty
 *  frame is compared against this rather than against a class name, because
 *  the class is lucide's to rename and the paths are what identify the
 *  species. Round-tripped through a detached element so both sides of the
 *  comparison are jsdom's own serialisation: renderToStaticMarkup writes
 *  self-closing tags that innerHTML does not. */
function iconMarkup(Icon: LucideIcon) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(Icon));
  return host.firstElementChild!.innerHTML;
}

const NOW = new Date("2026-01-01T00:00:00.000Z");

// Written in the dataset's own shape and handed over through the projection
// the server runs, so these fixtures carry exactly what a card is given on the
// page: photos already resolved, and no rights left to read.
function animal(rest: Partial<Animal> = {}): ClientAnimal {
  return animalsForClient([schemaAnimal(rest)])[0]!;
}

function schemaAnimal(rest: Partial<Animal> = {}): Animal {
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

  // One tier, however long the wait. A reintroduced threshold would pass at
  // the mark itself, so this asks at a wait well past any of them.
  it("keeps the quiet pill at the longest waits", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS * 3) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Čaka/).dataset.variant).toBe("overlay-quiet");
  });

  // Off only where the list around the card is already ordered by the wait,
  // which both grids are under their default sort. Every test above renders
  // without an order, which is the other half of this: a caller that has no
  // order to declare gets the mark.
  it("drops the mark where the order already carries it", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) })}
          reference={NOW}
          order="longest-in-shelter"
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(/Čaka/)).toBeNull();
  });

  // Any other order leaves the mark on: the list is not saying it.
  it("draws the mark under an order that says nothing about the wait", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) })}
          reference={NOW}
          order="name"
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Čaka/)).toBeTruthy();
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
function metaEl() {
  return screen.getByRole("heading").parentElement?.querySelector("p");
}

function metaLine() {
  return metaEl()?.textContent;
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
    //
    // The fixture carries a sex, which is what makes the exact string prove
    // the line leaves it out. Two facts is all the card's width buys.
    expect(metaLine()).toBe("Pes · 3 leta");
  });

  it("drops the species once a tab has already said it", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({
            sex: "male",
            approximateAgeMonths: 36,
            size: "medium",
          })}
          reference={NOW}
          species="dog"
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(metaLine()).toBe("3 leta · srednja");
  });

  // An animal with no age used to leave the line reading "Pes" alone, which
  // looks unfinished next to a card that has two facts.
  it("falls through to the next fact when the age is missing", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ sex: "male", size: "large" })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    expect(metaLine()).toBe("Pes · velika");
  });

  // The facts are what a visitor scans; the shelter line under them is
  // provenance. Muted on both read as one grey block.
  it("carries the facts in ink and the shelter line in muted", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ approximateAgeMonths: 36 })}
          reference={NOW}
          showShelter
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    const line = metaEl();
    expect(line?.className).toContain("text-foreground");
    expect(line?.className).not.toContain("text-muted-foreground");
    expect(
      screen.getByRole("link", { name: /Test/ }).className,
    ).toContain("text-muted-foreground");
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

describe("AnimalCard hover", () => {
  // Asserted on the class list, because jsdom resolves neither :hover nor the
  // media query the can-hover variant compiles to: it lays nothing out and
  // never moves a pointer, so the rule can only be checked for being rendered,
  // not for firing. What that leaves worth pinning is the shape of the
  // selector, and the shape is the whole point of this rule.
  it("underlines the name on hover, and not from the shelter row", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal()}
          reference={NOW}
          showShelter
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    const card = screen.getByRole("article");
    expect(card.className).toContain(
      "can-hover:[&:hover:not(:has([data-press-exempt]:hover))_h3]:underline",
    );
    // The :not(:has()) above is only worth anything while the shelter row
    // really carries the attribute it holds out. This is the other half of
    // that rule, and it is the half that can silently stop being true.
    expect(
      screen.getByRole("link", { name: "Test" }).hasAttribute("data-press-exempt"),
    ).toBe(true);
    // Gated on the repo's own can-hover variant, so a tap on a phone cannot
    // leave the name underlined with nothing to clear it.
    expect(card.className).not.toContain("[&:hover:not(:has([data-press-exempt]:hover))_h3]:underline hover:");
    // The offset keeps the rule off the descenders of a name like "Srečko".
    expect(screen.getByRole("heading").className).toContain("underline-offset-4");
  });
});

describe("AnimalCard empty photo", () => {
  // An animal the shelter published with no photo at all. The frame is the
  // only picture in the grid with nothing in it, so it draws the species
  // rather than a grey sentence alone.
  it.each([
    ["dog", "cat"],
    ["cat", "rabbit"],
  ] as const)("marks a %s card with its own species, not a %s", (species, other) => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ species, images: [] })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    const frame = document.querySelector('[data-slot="photo-frame"]')!;
    // The caption is still there; the mark goes above it rather than instead
    // of it.
    expect(frame.textContent).toContain("Fotografija na strani zavetišča");
    const mark = frame.querySelector("svg");
    expect(mark).toBeTruthy();
    // Compared against the icon map itself rather than against a class name,
    // which is lucide's to rename. This is what proves the card passes the
    // ANIMAL's species and not the grid's active tab: the tab is left unset
    // here, so a card reading the prop would draw "all" and match neither.
    expect(mark!.innerHTML).toBe(iconMarkup(SPECIES_ICONS[species]));
    expect(mark!.innerHTML).not.toBe(iconMarkup(SPECIES_ICONS[other]));
  });

  it("leaves a card that has a photo unmarked", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ images: photos(1) })}
          reference={NOW}
          onOpen={() => undefined}
        />
      </I18nProvider>,
    );

    const frame = document.querySelector('[data-slot="photo-frame"]')!;
    expect(frame.textContent).not.toContain("Fotografija na strani zavetišča");
    expect(frame.querySelector("svg")).toBeNull();
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
    const position = () =>
      document.querySelector('[data-slot="photo-position"]');
    const spoken = () => position()?.textContent;
    const link = screen.getByText("Rex").closest("a")!;
    expect(spoken()).toContain("1 od 3");
    expect(position()?.getAttribute("aria-live")).toBeNull();

    fireEvent.keyDown(link, { key: "ArrowRight" });
    expect(spoken()).toContain("2 od 3");
    expect(position()?.getAttribute("aria-live")).toBe("polite");
    expect(position()?.getAttribute("aria-atomic")).toBe("true");

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
