// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LucideIcon } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalCard } from "@/components/animal-card";
import { cardPhoto } from "@/components/grid-rendering";
import { I18nProvider } from "@/components/i18n-provider";
import type { ClientAnimal } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { animalsForClient } from "@/lib/dataset";
import { LONG_STAY_MONTHS } from "@/lib/labels";
import { PHOTO_TRANSITION_NAME } from "@/lib/photo-morph";
import { stubViewTransition } from "@/test/view-transition";

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
    expect(metaLine()).toBe("Pes · starost 3\u00a0leta");
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

    expect(metaLine()).toBe("starost 3\u00a0leta · srednja");
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
    // Positioned against the article, which is the element that holds both the
    // frame and the text: the pill is laid on the photo without being inside
    // the photo's own box.
    const article = badges[0].closest("article");
    expect(article?.querySelector('[data-slot="photo-frame"]')).toBeTruthy();
    expect(article?.className).toContain("relative");
    expect(badges[0].className).toContain("absolute");
    // And it is not inside the card's link, competing with the name.
    expect(badges[0].closest("a")).toBeNull();
  });

  // A screen reader walks the card in DOM order, and with the two marks in the
  // photo's wrapper it heard "Čaka 8 let. Fotografija 1 od 6." before it heard
  // whose card this was. They are drawn last now and positioned against the
  // article, which puts them on the same pixels.
  //
  // One render each, because the two marks can never share a card: the wait is
  // only drawn for an animal still waiting, and a status badge is only drawn
  // for one that is not.
  for (const [what, rest, mark] of [
    ["the status", { status: "reserved" as const }, "rezervirano"],
    [
      "the wait",
      { intakeDate: intakeMonthsAgo(LONG_STAY_MONTHS) },
      /Čaka/,
    ],
  ] as const) {
    it(`names the animal before ${what} laid on its photo`, () => {
      render(
        <I18nProvider locale="sl">
          <AnimalCard
            animal={animal(rest)}
            reference={NOW}
            showShelter
            onOpen={() => undefined}
          />
        </I18nProvider>,
      );

      const drawn = screen.getByText(mark);
      for (const earlier of [
        screen.getByText("Rex"),
        screen.getByRole("link", { name: "Test" }),
      ]) {
        expect(
          earlier.compareDocumentPosition(drawn) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });
  }

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

  it("marks the direction on a coarse pointer, where hover never fires", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal()}
          reference={NOW}
          onOpen={() => undefined}
          showShelter
        />
      </I18nProvider>,
    );

    // jsdom resolves no media query, so this reads the class list: what is
    // asserted is that the card renders the rule. On a phone the chevron was
    // the only thing saying that this line leaves the page, and it was gated
    // on a hover that a thumb never fires.
    const chevron = screen
      .getByRole("link", { name: "Test" })
      .querySelector('[aria-hidden="true"]');
    expect(chevron?.getAttribute("class")).toContain("pointer-coarse:opacity-60");
    // The same 60% the hover draws, not a treatment of its own.
    expect(chevron?.getAttribute("class")).toContain(
      "group-hover/card:opacity-60",
    );
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

describe("AnimalCard focus ring", () => {
  // The class list again, for the reason the hover block above gives: jsdom
  // resolves no :focus-visible on an ancestor and paints nothing, so what can
  // be pinned is the shape of the rule. The e2e spec reads the computed shadow.
  it("gives the ring a dark inner edge in both themes", () => {
    render(
      <I18nProvider locale="sl">
        <AnimalCard animal={animal()} reference={NOW} onOpen={() => undefined} />
      </I18nProvider>,
    );

    const frame = document.querySelector('[data-slot="photo-frame"]');
    // Still three pixels of the ring token, drawn inside the picture.
    expect(frame?.className).toContain(
      "group-has-[a:focus-visible]/card:after:ring-3",
    );
    expect(frame?.className).toContain(
      "group-has-[a:focus-visible]/card:after:ring-inset",
    );
    // And under it 4px of black at 45%, so the ring's inner boundary is not a
    // light green edge on a white studio photo: that boundary measured under
    // 3:1 on 54 of 59 lead photos, and 3.4:1 with this layer.
    expect(frame?.className).toContain(
      "group-has-[a:focus-visible]/card:after:shadow-[inset_0_0_0_4px_rgba(0,0,0,0.45),inset_0_0_0_1px_var(--card-photo-edge)]",
    );
    // The hairline is still there at rest, which is what closes a white photo
    // against the white page.
    expect(frame?.className).toContain(
      "after:shadow-[inset_0_0_0_1px_var(--card-photo-edge)]",
    );
    // One string each and no dark twin. The hairline is the only thing the
    // theme changes about this frame and --card-photo-edge (globals.css) is
    // where it changes now, so a dark: shadow here would be the old pair
    // coming back.
    expect(frame?.className).not.toContain("dark:after:shadow-");
    expect(frame?.className).not.toContain(
      "dark:group-has-[a:focus-visible]/card:after:shadow-",
    );
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

describe("AnimalCard photo morph", () => {
  // The card's photograph is what travels into the dialog, and the browser is
  // what carries it: one name on this box and on the dialog's front print, and
  // the platform morphs the first into the second, the aspect included. What
  // these check is the contract around that name, because getting it wrong is
  // silent. A name left on this box when the dialog has mounted its own is two
  // elements wearing one name in the same state, which makes the browser skip
  // the morph and drop the visitor straight into the open dialog.
  // The name on the card's photo box, which is all these read: the box is
  // found the way both ends of the morph find it (cardPhoto), and the answer
  // is a plain string so the shared stub can sample it either side of the
  // update. Empty where nothing is named, which is what a card at rest says.
  function nameOnFrame() {
    return (
      cardPhoto(document.body)?.style.getPropertyValue(
        "view-transition-name",
      ) ?? ""
    );
  }

  function reduceMotion(reduced: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition");
  });

  function renderCard(
    opened: string[],
    { ready = true, images = 2 }: { ready?: boolean; images?: number } = {},
  ) {
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={animal({ images: photos(images) })}
          reference={NOW}
          onOpen={(id) => opened.push(id)}
          // The grid's answer, and true here for every test but the one that
          // asks what a press before the dialog arrives does.
          isDialogReady={() => ready}
        />
      </I18nProvider>,
    );
    return document.querySelector<HTMLElement>('[data-slot="card-link"]')!;
  }

  it("names the photo, opens inside the transition, and clears the name", async () => {
    reduceMotion(false);
    const started = stubViewTransition(nameOnFrame);
    const opened: string[] = [];
    const link = renderCard(opened);

    fireEvent.click(link);

    expect(started).toHaveLength(1);
    // Named for the old state, which is the box the morph leaves from.
    expect(started[0].before).toBe(PHOTO_TRANSITION_NAME);
    // The dialog is open by the time the callback returns, because the new
    // snapshot is taken then: a render React has not committed is a state the
    // morph never sees.
    expect(opened).toEqual(["rex"]);
    // And the name is off again, because the dialog's front print is wearing
    // it now.
    expect(started[0].after).toBe("");
    // The document says which way the photograph is going for as long as the
    // update runs, which is what the dialog's own zoom stands aside for.
    expect(started[0].mark).toBe("open");

    // The belt to that brace: a transition the browser skips rejects rather
    // than settling, and it still has to leave the card clean for the next
    // press.
    started[0].skip();
    await Promise.resolve();
    await Promise.resolve();
    expect(nameOnFrame()).toBe("");
  });

  it("opens plainly where the browser has no view transitions", () => {
    reduceMotion(false);
    // Stated here rather than inherited from whatever ran before this: the
    // afterEach above deletes the stub, so this test used to be asserting the
    // plain path only for as long as it stood after one that installed one.
    Reflect.deleteProperty(document, "startViewTransition");
    expect(document.startViewTransition).toBeUndefined();
    const opened: string[] = [];
    const link = renderCard(opened);

    fireEvent.click(link);

    expect(opened).toEqual(["rex"]);
    expect(nameOnFrame()).toBe("");
  });

  // The home grid mounts the dialog on idle, so a press can beat it there: a
  // morph started then would take the photograph out of the card and capture a
  // new state with no dialog in it, which is the photograph leaving and nothing
  // arriving. The grid says when there is somewhere to carry it to.
  it("opens plainly before the dialog is on the page", () => {
    reduceMotion(false);
    const started = stubViewTransition(nameOnFrame);
    const opened: string[] = [];
    const link = renderCard(opened, { ready: false });

    fireEvent.click(link);

    expect(started).toEqual([]);
    expect(opened).toEqual(["rex"]);
    expect(nameOnFrame()).toBe("");
  });

  it("opens plainly for a visitor who asked for less movement", () => {
    reduceMotion(true);
    const started = stubViewTransition(nameOnFrame);
    const opened: string[] = [];
    const link = renderCard(opened);

    fireEvent.click(link);

    expect(started).toEqual([]);
    expect(opened).toEqual(["rex"]);
  });

  it("opens plainly for an animal with no photograph", () => {
    reduceMotion(false);
    const started = stubViewTransition(nameOnFrame);
    const opened: string[] = [];
    const link = renderCard(opened, { images: 0 });

    fireEvent.click(link);

    expect(started).toEqual([]);
    expect(opened).toEqual(["rex"]);
  });
});


it("keeps the first photo while metadata loads, then honors the card's keyboard step", async () => {
  const projected = animalsForClient([schemaAnimal({ images: photos(3) })], {
    deferPhotos: true,
  })[0];
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  try {
    const { container } = render(
      <I18nProvider locale="sl">
        <AnimalCard animal={projected} reference={NOW} onOpen={() => {}} />
      </I18nProvider>,
    );
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.keyDown(container.querySelector('[data-slot="card-link"]')!, {
      key: "ArrowRight",
    });
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "photo-0",
    );
    await act(async () => {
      finish({
        ok: true,
        json: async () => animal({ images: photos(3) }).images,
      });
    });
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toContain(
        "photo-1",
      ),
    );
    expect(
      container.querySelector('[data-slot="photo-position"]')?.textContent,
    ).toContain("2 od 3");
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
