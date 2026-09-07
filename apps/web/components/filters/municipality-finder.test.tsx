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
        onActiveShelters={() => undefined}
        onActiveMunicipality={() => undefined}
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
        <MunicipalityFinder entries={ENTRIES} onActiveShelters={() => undefined} />
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
        <MunicipalityFinder entries={ENTRIES} onActiveShelters={() => undefined} />
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
          onActiveShelters={() => undefined}
          onActiveMunicipality={() => undefined}
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
    render(<I18nProvider locale="en"><MunicipalityFinder entries={ENTRIES} onActiveShelters={() => undefined} /></I18nProvider>);
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
        onActiveShelters={() => undefined}
        onActiveMunicipality={() => undefined}
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
