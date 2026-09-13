// @vitest-environment jsdom

import { resetNearbyStore } from "@/hooks/use-nearby";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { MunicipalityFinder } from "./municipality-finder";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  resetNearbyStore();
});

// The location button carries a tooltip, and Radix positions one with an
// observer jsdom does not ship.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;

// Three občine from different corners of the country, each with real coverage,
// so a lookup that resolves has a card to show.
const ENTRIES: LookupEntry[] = [
  {
    name: "Ljubljana",
    nearest: [],
    coverage: [
      {
        shelterId: "ljubljana",
        shelterName: "Zavetišče Ljubljana",
        city: "Ljubljana",
        detailHref: "/zavetisca/ljubljana",
        animals: 0,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
  {
    name: "Maribor",
    nearest: [],
    coverage: [
      {
        shelterId: "maribor",
        shelterName: "Zavetišče Maribor",
        city: "Maribor",
        detailHref: "/zavetisca/maribor",
        animals: 0,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
  {
    name: "Koper",
    nearest: [],
    coverage: [
      {
        shelterId: "obalno",
        shelterName: "Zavetišče Obala",
        city: "Koper",
        detailHref: "/zavetisca/obalno",
        animals: 0,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
];

function renderFinder() {
  return render(
    <I18nProvider locale="sl">
      <MunicipalityFinder
        entries={ENTRIES}
        onAnswer={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("MunicipalityFinder deep link", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("opens the občina the URL names", () => {
    window.history.replaceState({}, "", "/najdena-zival?kraj=Koper");
    renderFinder();

    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "Koper",
    );
    expect(screen.getByText("Zavetišče Obala")).toBeTruthy();
  });

  it("takes a postcode too, and folds the spelling", () => {
    window.history.replaceState({}, "", "/najdena-zival?posta=koper");
    renderFinder();

    expect(screen.getByText("Zavetišče Obala")).toBeTruthy();
  });

  it("leaves the box empty when the URL names nothing", () => {
    window.history.replaceState({}, "", "/najdena-zival");
    renderFinder();

    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Zavetišče Obala")).toBeNull();
  });

  // The seed is derived from the URL rather than written into state on mount,
  // so the one thing worth pinning is that it gives way: what the visitor
  // types is the question, and the link is only where they started.
  it("gives way to what the visitor types over it", () => {
    window.history.replaceState({}, "", "/najdena-zival?kraj=Koper");
    renderFinder();

    expect(screen.getByText("Zavetišče Obala")).toBeTruthy();

    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "Maribor" } });

    expect((search as HTMLInputElement).value).toBe("Maribor");
    expect(screen.getByText("Zavetišče Maribor")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Obala")).toBeNull();
  });

  it("stays empty after the link is cleared, rather than seeding again", () => {
    window.history.replaceState({}, "", "/najdena-zival?kraj=Koper");
    renderFinder();

    fireEvent.click(screen.getByRole("button", { name: "Počisti iskanje" }));

    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Zavetišče Obala")).toBeNull();
    expect(window.location.search).toBe("");
    cleanup();
    renderFinder();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });

  it("carries an edited municipality into the other language and reloads", () => {
    window.history.replaceState({}, "", "/najdena-zival?kraj=Koper&posta=6000&source=a%20b");
    const view = render(
      <I18nProvider locale="sl">
        <LanguageSwitcher paths={FOUND_ANIMAL_PATHS} />
        <MunicipalityFinder entries={ENTRIES} onAnswer={() => undefined} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Maribor" } });
    expect(window.location.search).toBe("?source=a%20b&kraj=Maribor");

    const english = screen.getByRole("link", { name: "English" });
    const preventNavigation = (event: Event) => event.preventDefault();
    english.addEventListener("click", preventNavigation);
    fireEvent.click(english);
    const destination = english.getAttribute("href")!;
    expect(destination).toBe("/en/found-animal?source=a%20b&kraj=Maribor");
    view.unmount();
    window.history.replaceState({}, "", destination);
    render(
      <I18nProvider locale="en">
        <MunicipalityFinder entries={ENTRIES} onAnswer={() => undefined} />
      </I18nProvider>,
    );
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Maribor");
    expect(screen.getByText("Zavetišče Maribor")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Obala")).toBeNull();
  });

  it("restores the location from history after an edited search", () => {
    renderFinder();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Maribor" } });
    act(() => {
      window.history.replaceState({}, "", "/najdena-zival?kraj=Koper");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText("Zavetišče Obala")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Maribor")).toBeNull();
    expect(window.location.search).toBe("?kraj=Koper");
  });

  it("saves the resolved municipality from a postcode", () => {
    renderFinder();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1000" } });
    expect(new URLSearchParams(window.location.search).get("kraj")).toBe("Ljubljana");
    cleanup();
    renderFinder();
    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();
  });
});

describe("MunicipalityFinder empty state", () => {
  it("puts the box first and the guidance under it, with no example towns", () => {
    renderFinder();

    // Finding a contact does not require choosing from example towns.
    const search = screen.getByRole("combobox");
    expect(search).toBeTruthy();
    expect(screen.queryByText("Npr.:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ljubljana" })).toBeNull();
    // The guidance and the two emergency numbers stand under the search, not
    // above it: the box is the one control this page exists for.
    const guidance = screen.getByText(/Poškodovane živali ne premikaj/);
    expect(
      search.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // No emergency numbers: a found animal is a call to the shelter.
    expect(screen.queryByRole("link", { name: "112" })).toBeNull();
    expect(screen.queryByRole("link", { name: "113" })).toBeNull();
    expect(screen.getByText(/Odlov in oskrbo plača občina/)).toBeTruthy();
    // No label over the box: the page's h1 has asked the question.
    expect(screen.queryByText("Kje si našel žival?")).toBeNull();
  });

  it("keeps the hint short inside the box and the name on the field", () => {
    renderFinder();
    const search = screen.getByRole("combobox");

    // The box is 196px wide inside its padding on a 360px phone, which the
    // full name of the field does not fit in; it is spoken instead.
    expect(search.getAttribute("placeholder")).toBe("Občina ali pošta");
    expect(search.getAttribute("aria-label")).toBe(
      "Občina ali poštna številka …",
    );
  });

  it("names the location button in the field while the box is empty", () => {
    renderFinder();

    // A tooltip opens on hover and on focus, and a thumb does neither.
    const locate = screen.getByRole("button", { name: "Uporabi mojo lokacijo" });
    expect(locate.textContent).toContain("Moja lokacija");

    // Once something is typed the clear X is beside it and the two together
    // would leave the field no room for what was typed.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Kop" } });

    expect(
      screen.getByRole("button", { name: "Uporabi mojo lokacijo" }).textContent,
    ).not.toContain("Moja lokacija");
    expect(screen.getByRole("button", { name: "Počisti iskanje" })).toBeTruthy();
  });

  it("announces the answer through a live region that was already mounted", () => {
    renderFinder();

    const live = document.querySelectorAll('[aria-live="polite"]');
    // The status line for the fix, and the answer's heading, both empty.
    expect(live.length).toBe(2);
    expect(live[1].textContent).toBe("");

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Koper" },
    });

    expect(live[1].textContent).toBe("Koper · pristojno zavetišče");
  });

  // Bled's coverage comes from an unconfirmed 2023 list, and the answer used
  // to name its shelter as responsible in exactly the words Ptuj's checked
  // record gets. Only the card's 12px source line said otherwise.
  it("says in the same line when the record is an older source", () => {
    const onAnswer = vi.fn();
    render(
      <I18nProvider locale="sl">
        <MunicipalityFinder
          entries={[
            {
              name: "Bled",
              nearest: [],
              coverage: [
                {
                  shelterId: "horjul",
                  shelterName: "Zavetišče Horjul",
                  city: "Horjul",
                  detailHref: "/zavetisca/horjul",
                  animals: 0,
                  sourceLabel: "Test 2023",
                  sourceDate: "2023-01-01",
                  confirmed: false,
                },
              ],
            },
          ]}
          onAnswer={onAnswer}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Bled" },
    });

    expect(
      document.querySelectorAll('[aria-live="polite"]')[1]?.textContent,
    ).toBe("Bled · pristojno zavetišče · starejši vir");
    // And the map hears it, so its callout can say the same thing.
    expect(onAnswer).toHaveBeenLastCalledWith({
      municipality: "Bled",
      shelters: ["horjul"],
      spotlight: ["horjul"],
      verified: true,
      confirmed: false,
    });
  });

  it("names the shelter once a single občina is typed", () => {
    renderFinder();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Maribor" },
    });

    expect(screen.getByText("Zavetišče Maribor")).toBeTruthy();
    // The answer carries the občina's name in one line with what the card
    // under it is. Read off the live region rather than by text: the card
    // below names the shelter's town as well, and both are "Maribor".
    expect(
      document.querySelectorAll('[aria-live="polite"]')[1]?.textContent,
    ).toBe("Maribor · pristojno zavetišče");
    // No second "clear" beside it, because the X in the box already is one.
    expect(screen.queryByRole("button", { name: "Počisti" })).toBeNull();
  });
});

// Enter used to take matches[0] whenever the list held anything, which on an
// ambiguous query answered a question about one občina with another one's
// shelter. What it takes now is an answer only where there is one.
describe("MunicipalityFinder enter key", () => {
  // Three entries a prefix cannot tell apart, one of which is also an exact
  // name. Ljubljana is first in the table, so a rule that takes the head of
  // the list looks right on the exact-name case and wrong on every other one.
  const AMBIGUOUS: LookupEntry[] = ["Ljubljana", "Ljubljana - Vič", "Ljubno"].map(
    (name, index) => ({
      name,
      nearest: [],
      coverage: [
        {
          shelterId: `shelter-${index}`,
          shelterName: `Zavetišče ${name}`,
          city: name,
          detailHref: `/zavetisca/shelter-${index}`,
          animals: 0,
          sourceLabel: "Test",
          sourceDate: "2026-01-01",
          confirmed: true,
        },
      ],
    }),
  );

  function renderAmbiguous() {
    render(
      <I18nProvider locale="sl">
        <MunicipalityFinder
          entries={AMBIGUOUS}
          onAnswer={() => undefined}
        />
      </I18nProvider>,
    );
    return screen.getByRole("combobox");
  }

  it("does nothing destructive while several municipalities still match", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljub" } });

    // All three are on the list and none of them is the answer yet.
    expect(screen.getByRole("option", { name: /Ljubljana - Vič/ })).toBeTruthy();

    fireEvent.keyDown(search, { key: "Enter" });

    // Nothing has been named as the responsible shelter: the answer block,
    // which is the only thing that says "pristojno zavetišče" over a named
    // občina, is not on screen. The shelter names themselves are no test of
    // that, because every row in the list already carries the one it would
    // name.
    expect(screen.queryByText(/pristojno zavetišč/)).toBeNull();
    // And the list is still there to pick from, which is the whole of what
    // the visitor has to act on.
    expect(screen.getByRole("option", { name: /Ljubno/ })).toBeTruthy();
  });

  it("takes an exact name over the ones that merely contain it", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljubljana" } });

    fireEvent.keyDown(search, { key: "Enter" });

    // Somebody spelling their own občina out in full has named it, even
    // though "Ljubljana - Vič" matches the same string.
    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Ljubljana - Vič")).toBeNull();
  });

  it("folds diacritics on both sides of that comparison", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "ljubljana - vic" } });

    fireEvent.keyDown(search, { key: "Enter" });

    // The same folding the filter above the list uses, so a keyboard without
    // č is not a keyboard that cannot answer.
    expect(screen.getByText("Zavetišče Ljubljana - Vič")).toBeTruthy();
  });

  it("still takes the only match there is", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljubno" } });

    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByText("Zavetišče Ljubno")).toBeTruthy();
  });

  it("announces suggestions and lets the arrows choose an explicit answer", () => {
    const search = renderAmbiguous();
    search.focus();
    const status = document.querySelectorAll('[aria-live="polite"]')[1];
    fireEvent.change(search, { target: { value: "Ljub" } });
    expect(status.textContent).toBe("Najdene občine: 3. Izberi pravo.");
    expect(search.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const option = screen.getByRole("option", { name: /Ljubljana - Vič/, selected: true });
    expect(search.getAttribute("aria-activedescendant")).toBe(option.id);
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByText("Zavetišče Ljubljana - Vič")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(search.getAttribute("aria-activedescendant")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("kraj")).toBe("Ljubljana - Vič");
  });

  it("wraps suggestions and closes with Escape without clearing the text", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljub" } });
    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: /Ljubno/, selected: true })).toBeTruthy();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Ljubljana Zavetišče Ljubljana", selected: true })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((search as HTMLInputElement).value).toBe("Ljub");
    expect(search.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("discards a highlighted option when the query changes and ignores IME Enter", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljub" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.change(search, { target: { value: "Ljubl" } });
    expect(search.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.blur(search);
    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(search.getAttribute("aria-activedescendant")).toBeNull();
  });
});

describe("MunicipalityFinder search feedback", () => {
  it.each(["9999", "999", "10000", "SI-9999"])("announces an invalid postcode: %s", (query) => {
    renderFinder();
    const status = document.querySelectorAll('[aria-live="polite"]')[1];
    fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
    expect(status.textContent).toBe("Te poštne številke ne najdem. Preveri vnos.");
    expect(screen.queryByText(/Ni občine z imenom/)).toBeNull();
  });

  it("announces an unknown name and removes the error after correction", () => {
    renderFinder();
    const status = document.querySelectorAll('[aria-live="polite"]')[1];
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(status.textContent).toBe("Ni občine z imenom »zzzz«");
    fireEvent.change(search, { target: { value: "1000" } });
    expect(status.textContent).toBe("Ljubljana · pristojno zavetišče");
  });

  it("uses English postcode feedback on the English page", () => {
    render(<I18nProvider locale="en"><MunicipalityFinder entries={ENTRIES} onAnswer={() => undefined} /></I18nProvider>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "9999" } });
    expect(screen.getByText("No such postcode. Check the number.")).toBeTruthy();
  });
});

// Real občina names, so the postal table these tests lean on answers the way
// it does in production. One shelter each, named after the občina, so the card
// on screen says which občina was answered with.
const REAL: LookupEntry[] = [
  "Ljubljana",
  "Kungota",
  "Maribor",
  "Križevci",
  "Ljutomer",
  "Gornji Petrovci",
  "Šalovci",
  "Moravske Toplice",
  "Videm",
  "Dobrepolje",
  "Grosuplje",
].map((name, index) => ({
  name,
  nearest: [],
  coverage: [
    {
      shelterId: `shelter-${index}`,
      shelterName: `Zavetišče ${name}`,
      city: name,
      detailHref: `/zavetisca/shelter-${index}`,
      animals: 0,
      sourceLabel: "Test",
      sourceDate: "2026-01-01",
      confirmed: true,
    },
  ],
}));

function renderReal() {
  render(
    <I18nProvider locale="sl">
      <MunicipalityFinder
        entries={REAL}
        onAnswer={() => undefined}
      />
    </I18nProvider>,
  );
  return screen.getByRole("combobox");
}

// A fix that arrives the moment the button is pressed, so the finder is in the
// state this test is about without any waiting.
function stubGeolocationAt(lat: number, lon: number) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: { latitude: lat, longitude: lon },
        } as GeolocationPosition);
      }),
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("MunicipalityFinder typed text against the device position", () => {
  it("stops answering with the fix as soon as something is typed", () => {
    // Somebody in Ljubljana presses the location button, then types the občina
    // the animal was actually found in. 26 občine, Kungota among them, have no
    // postal district of their own name, so the typed lookup comes back empty
    // and the fix used to answer in its place: Ljubljana's shelter, named as
    // the answer to a question about Kungota, with nothing on screen saying to
    // look again.
    stubGeolocationAt(46.0569, 14.5058);
    const search = renderReal();

    fireEvent.click(
      screen.getByRole("button", { name: "Uporabi mojo lokacijo" }),
    );
    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Kungota" } });

    expect(screen.getByText("Zavetišče Kungota")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Ljubljana")).toBeNull();
    // And the "from postcode 1000" line the fix drew is gone with it: nothing
    // on screen is still speaking for the device.
    expect(screen.queryByText(/Pošta 1000/)).toBeNull();
  });

  it("keeps using the fix while the box is empty", () => {
    stubGeolocationAt(46.0569, 14.5058);
    renderReal();

    fireEvent.click(
      screen.getByRole("button", { name: "Uporabi mojo lokacijo" }),
    );

    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("kraj")).toBe("Ljubljana");
  });

  it("does not resurrect a device result after typing and clearing", () => {
    stubGeolocationAt(46.0569, 14.5058);
    const search = renderReal();
    fireEvent.click(screen.getByRole("button", { name: "Uporabi mojo lokacijo" }));
    fireEvent.change(search, { target: { value: "Maribor" } });
    fireEvent.click(screen.getByRole("button", { name: "Počisti iskanje" }));
    expect(screen.queryByText("Zavetišče Ljubljana")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("names the location button on focus, not on hover alone", () => {
    renderReal();

    // The arrow is the only thing drawn in the button, and the name used to
    // appear in a title, which is a pointer and nothing else. It says the same
    // words as the accessible name, so the two cannot drift apart.
    const locate = screen.getByRole("button", { name: "Uporabi mojo lokacijo" });
    expect(locate.getAttribute("title")).toBeNull();

    fireEvent.focus(locate);

    expect(screen.getByRole("tooltip").textContent).toBe(
      "Uporabi mojo lokacijo",
    );
  });

  it("turns off an active fix with a second press of the location button", () => {
    stubGeolocationAt(46.0569, 14.5058);
    renderReal();
    const locate = screen.getByRole("button", { name: "Uporabi mojo lokacijo" });
    fireEvent.click(locate);
    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();
    fireEvent.click(locate);
    expect(locate.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("Zavetišče Ljubljana")).toBeNull();
    expect(window.location.search).toBe("");
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe("MunicipalityFinder postal guess beside the občina name", () => {
  it("keeps an ambiguous postal name unresolved across reloads", () => {
    const search = renderReal();
    fireEvent.change(search, { target: { value: "Križevci" } });
    expect(new URLSearchParams(window.location.search).get("kraj")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("posta")).toBe("Križevci");
    cleanup();
    renderReal();
    expect(screen.getByRole("option", { name: /Križevci/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Gornji Petrovci/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Gornji Petrovci/ }));
    expect(new URLSearchParams(window.location.search).get("kraj")).toBe("Gornji Petrovci");
    cleanup();
    renderReal();
    expect(screen.getByText("Zavetišče Gornji Petrovci")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers the občina that is spelled, not only the postcode's own", () => {
    // "Križevci" is postal district 9206 in Goričko, whose three občine are
    // Gornji Petrovci, Šalovci and Moravske Toplice, and it is also Občina
    // Križevci near Ljutomer. The guess used to win outright, so the reader
    // was asked "which of these three" and the one they had spelled was not
    // among them.
    const search = renderReal();
    fireEvent.change(search, { target: { value: "Križevci" } });

    expect(screen.getByRole("option", { name: /Križevci/ })).toBeTruthy();
    // The postal district's own občine are still offered: the guess is kept,
    // not swapped for the name.
    expect(screen.getByRole("option", { name: /Gornji Petrovci/ })).toBeTruthy();

    // And spelling it out in full is enough to take it.
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByText("Zavetišče Križevci")).toBeTruthy();
  });

  it("still resolves without a pick when the guess and the name agree", () => {
    // The ordinary case: 1000 Ljubljana resolves to Občina Ljubljana, which is
    // also the exact name typed, and the dedupe leaves one answer.
    const search = renderReal();
    fireEvent.change(search, { target: { value: "Ljubljana" } });

    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();
  });

  it("names Občina Videm rather than the občine of Videm - Dobrepolje", () => {
    // The postal table used to read "Videm" as half of 1312 Videm -
    // Dobrepolje and answer with Dobrepolje and Grosuplje.
    const search = renderReal();
    fireEvent.change(search, { target: { value: "Videm" } });

    expect(screen.getByText("Zavetišče Videm")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Dobrepolje")).toBeNull();
    expect(screen.queryByText("Zavetišče Grosuplje")).toBeNull();
  });
});

// An občina the registry cannot answer for. Real data holds 42 of them, and
// every one has a centroid, so the nearest list is only ever empty here.
// Mala hiša has no number on purpose: two of the register's shelters have
// none, and the card's one call must skip such a shelter.
const CIRKULANE: LookupEntry = {
  name: "Cirkulane",
  coverage: [],
  nearest: [
    {
      shelterId: "maribor",
      shelterName: "Zavetišče Maribor (Snaga)",
      city: "Maribor",
      phone: "02 480 16 60",
      detailHref: "/zavetisca/maribor",
      km: 36,
    },
    {
      shelterId: "mala-hisa",
      shelterName: "Zavetišče Mala hiša",
      city: "Moravske Toplice",
      detailHref: "/zavetisca/mala-hisa",
      km: 42,
    },
    {
      shelterId: "zonzani",
      shelterName: "Zavetišče Zonzani",
      city: "Dramlje",
      phone: "03 749 06 00",
      detailHref: "/zavetisca/zonzani",
      km: 48,
    },
  ],
};

describe("MunicipalityFinder without a verified shelter", () => {
  function renderCirkulane(nearest = CIRKULANE.nearest) {
    const onAnswer = vi.fn();
    render(
      <I18nProvider locale="sl">
        <MunicipalityFinder
          entries={[...ENTRIES, { ...CIRKULANE, nearest }]}
          onAnswer={onAnswer}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Cirkulane" },
    });
    return onAnswer;
  }

  const follows = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("leads with one call to the nearest shelter, then the fallbacks, then the občina", () => {
    const onAnswer = renderCirkulane();

    expect(
      document.querySelectorAll('[aria-live="polite"]')[1]?.textContent,
    ).toBe("Cirkulane · pristojnost ni preverjena");

    // The heading is the action, the note is the script for it and says
    // nothing the line above the card already said, and the nearest
    // shelter's number is the card's one primary call, in the coverage
    // card's own words. The distance says what kind of distance it is.
    const heading = screen.getByText("Najprej pokliči");
    const note = screen.getByText("Vprašaj, kdo prevzame žival.");
    expect(heading.closest('[data-slot="card"]')?.textContent).not.toMatch(
      /ni potrjeno|ni preverjen/,
    );
    const call = screen.getByRole("link", { name: "Pokliči 02 480 16 60" });
    expect(call.getAttribute("href")).toMatch(/^tel:/);
    expect(screen.getByText("Maribor · 36 km zračno")).toBeTruthy();

    // The rest of the shortlist under a label that says when it is for,
    // each number a control of its own. The label is an instruction, so
    // only the shelters that answer a phone stand under it; the one without
    // a number comes after them, keeping its name and its page and saying
    // in the button's place why there is none.
    const label = screen.getByText("Če se ne oglasijo");
    const fallback = screen.getByRole("link", { name: "03 749 06 00" });
    const unlisted = screen.getByRole("link", { name: "Zavetišče Mala hiša" });
    expect(unlisted.getAttribute("href")).toBe("/zavetisca/mala-hisa");
    expect(screen.getByText("brez objavljene številke")).toBeTruthy();
    expect(follows(fallback, unlisted)).toBe(true);
    expect(screen.getAllByRole("link", { name: /^\d/ })).toHaveLength(1);

    // The občina is the last resort, under the list, and the general
    // guidance stays under the answer.
    const obcina = screen.getByText(/lahko pove tudi občina/);
    const guidance = screen.getByText(/Poškodovane živali ne premikaj/);
    expect(follows(heading, note)).toBe(true);
    expect(follows(note, call)).toBe(true);
    expect(follows(call, label)).toBe(true);
    expect(follows(label, fallback)).toBe(true);
    expect(follows(fallback, obcina)).toBe(true);
    expect(follows(obcina, guidance)).toBe(true);

    // Nothing that cannot be acted on: the office that keeps the register
    // publishes no list, so its link is gone.
    expect(screen.queryByRole("link", { name: /gov\.si/ })).toBeNull();

    // The map hears the same answer: the shortlist to keep bright, the one
    // call to ring, and that none of it is on record.
    expect(onAnswer).toHaveBeenLastCalledWith({
      municipality: "Cirkulane",
      shelters: ["maribor", "mala-hisa", "zonzani"],
      spotlight: ["maribor"],
      verified: false,
      confirmed: true,
    });
  });

  it("skips a nearer shelter without a number when choosing the call", () => {
    const [maribor, malaHisa, zonzani] = CIRKULANE.nearest;
    const onAnswer = renderCirkulane([malaHisa, maribor, zonzani]);

    expect(
      screen.getByRole("link", { name: "Pokliči 02 480 16 60" }),
    ).toBeTruthy();
    // The nearer shelter is still on the list, as a row without a button,
    // and it sits after the one number the fallback group does hold.
    const unlisted = screen.getByRole("link", { name: "Zavetišče Mala hiša" });
    expect(unlisted).toBeTruthy();
    expect(
      follows(screen.getByRole("link", { name: "03 749 06 00" }), unlisted),
    ).toBe(true);
    expect(onAnswer).toHaveBeenLastCalledWith({
      municipality: "Cirkulane",
      shelters: ["mala-hisa", "maribor", "zonzani"],
      spotlight: ["maribor"],
      verified: false,
      confirmed: true,
    });
  });

  it("offers the first call's dežurna number as a second button", () => {
    const [maribor, malaHisa, zonzani] = CIRKULANE.nearest;
    renderCirkulane([
      { ...maribor, onCallPhone: "031 788 822" },
      malaHisa,
      zonzani,
    ]);

    const call = screen.getByRole("link", { name: "Pokliči 02 480 16 60" });
    const onCall = screen.getByRole("link", { name: "Dežurna 031 788 822" });
    expect(onCall.getAttribute("href")).toMatch(/^tel:/);
    // The same pair the coverage card draws: one call, then the quieter one
    // for the hours the first is not answered.
    expect(onCall.getAttribute("data-variant")).toBe("outline");
    expect(follows(call, onCall)).toBe(true);
  });

  it("rings a fallback shelter on its dežurna number when it has no other", () => {
    const [maribor, malaHisa, zonzani] = CIRKULANE.nearest;
    renderCirkulane([
      maribor,
      { ...malaHisa, onCallPhone: "041 609 240" },
      zonzani,
    ]);

    // A row with a number to dial draws a button whatever kind of number it
    // is, and says which kind, because it is not the one to try first.
    const row = screen.getByRole("link", { name: "Dežurna 041 609 240" });
    expect(row.getAttribute("href")).toMatch(/^tel:/);
    expect(screen.queryByText("brez objavljene številke")).toBeNull();
  });

  // Bovec, from the real register: Johanca is the nearest shelter and has no
  // published number, and the nearest one that has is 28 km further on. The
  // heading used to say "call the nearest shelter" over the far one while the
  // near one sat under "if there is no answer" with nothing to press.
  it("puts the first call on the nearest shelter that has a number", () => {
    const onAnswer = vi.fn();
    render(
      <I18nProvider locale="sl">
        <MunicipalityFinder
          entries={[
            ...ENTRIES,
            {
              name: "Bovec",
              coverage: [],
              nearest: [
                {
                  shelterId: "johanca",
                  shelterName: "Zavetišče Johanca",
                  city: "Tolmin",
                  detailHref: "/zavetisca/johanca",
                  km: 21,
                },
                {
                  shelterId: "oskar",
                  shelterName: "Zavetišče Oskar Vitovlje",
                  city: "Vitovlje",
                  phone: "05 307 85 70",
                  detailHref: "/zavetisca/oskar",
                  km: 49,
                },
              ],
            },
          ]}
          onAnswer={onAnswer}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Bovec" },
    });

    // The call is the far shelter's, and the heading over it does not call
    // that shelter the nearest one.
    const heading = screen.getByText("Najprej pokliči");
    const call = screen.getByRole("link", { name: "Pokliči 05 307 85 70" });
    expect(call.getAttribute("href")).toMatch(/^tel:/);
    expect(screen.getByText("Vitovlje · 49 km zračno")).toBeTruthy();

    // Nothing else on the shortlist answers a phone, so the label that says
    // when to try the next number is not drawn at all.
    expect(screen.queryByText("Če se ne oglasijo")).toBeNull();

    // The nearer shelter is named after the call, with its page and the
    // reason it carries no button, and it is not a second tel: link.
    const johanca = screen.getByRole("link", { name: "Zavetišče Johanca" });
    expect(johanca.getAttribute("href")).toBe("/zavetisca/johanca");
    expect(screen.getByText("Tolmin · 21 km zračno")).toBeTruthy();
    expect(screen.getByText("brez objavljene številke")).toBeTruthy();
    expect(follows(heading, johanca)).toBe(true);
    expect(follows(call, johanca)).toBe(true);
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(1);

    // And the map rings the shelter the card says to call, not the nearest.
    expect(onAnswer).toHaveBeenLastCalledWith({
      municipality: "Bovec",
      shelters: ["johanca", "oskar"],
      spotlight: ["oskar"],
      verified: false,
      confirmed: true,
    });
  });

  it("falls back to the občina alone when there is nothing near to call", () => {
    const onAnswer = renderCirkulane([]);

    expect(screen.queryByText("Najprej pokliči")).toBeNull();
    expect(screen.queryByText("Najbližja zavetišča")).toBeNull();
    expect(
      screen.getByText(/^Pokliči občino, kjer je bila žival najdena/),
    ).toBeTruthy();
    expect(onAnswer).toHaveBeenLastCalledWith({
      municipality: "Cirkulane",
      shelters: [],
      spotlight: [],
      verified: false,
      confirmed: true,
    });
  });
});
