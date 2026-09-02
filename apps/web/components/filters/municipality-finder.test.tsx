// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { MunicipalityFinder } from "./municipality-finder";

afterEach(cleanup);

// Same three names as the component's own EXAMPLE_MUNICIPALITIES, with real
// coverage, so the fixture matches what the tap-to-try chips promise: a
// working lookup, not just an entry that resolves to nothing.
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
        selectableIds={new Set()}
        selected={[]}
        onToggle={() => undefined}
        onActiveShelters={() => undefined}
        onActiveMunicipality={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("MunicipalityFinder example chips", () => {
  it("renders the three example municipalities in the empty state", () => {
    renderFinder();

    expect(screen.getByText("Npr.:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ljubljana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maribor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Koper" })).toBeTruthy();
  });

  it("tapping a chip runs the same lookup as typing the name", () => {
    renderFinder();

    fireEvent.click(screen.getByRole("button", { name: "Koper" }));

    // The search box now holds the tapped name, same as if it had been typed.
    const search = screen.getByRole("searchbox") as HTMLInputElement;
    expect(search.value).toBe("Koper");
    // And the same single-match result the typed path resolves to: the
    // responsible shelter's card, with its name and call button.
    expect(screen.getByText("Zavetišče Obala")).toBeTruthy();
  });

  it("typing a name by hand resolves to the identical result the chip gives", () => {
    renderFinder();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Maribor" },
    });

    expect(screen.getByText("Zavetišče Maribor")).toBeTruthy();
  });

  it("hides the examples once a lookup result is showing", () => {
    renderFinder();

    expect(screen.getByRole("button", { name: "Ljubljana" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ljubljana" }));

    // The teaching aid's job is done: the result card is up, and the chips
    // (including the one that was just tapped) leave the space to it.
    expect(screen.queryByRole("button", { name: "Ljubljana" })).toBeNull();
    expect(screen.queryByText("Npr.:")).toBeNull();
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
          selectableIds={new Set()}
          selected={[]}
          onToggle={() => undefined}
          onActiveShelters={() => undefined}
          onActiveMunicipality={() => undefined}
        />
      </I18nProvider>,
    );
    return screen.getByRole("searchbox");
  }

  it("does nothing destructive while several municipalities still match", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljub" } });

    // All three are on the list and none of them is the answer yet.
    expect(screen.getByRole("button", { name: /Ljubljana - Vič/ })).toBeTruthy();

    fireEvent.keyDown(search, { key: "Enter" });

    // Nothing has been named as the responsible shelter: the answer block,
    // which is the only thing that carries "Kaj zdaj" and a reset beside it,
    // is not on screen. The shelter names themselves are no test of that,
    // because every row in the list already carries the one it would name.
    expect(screen.queryByText("Kaj zdaj")).toBeNull();
    // And the list is still there to pick from, which is the whole of what
    // the visitor has to act on.
    expect(screen.getByRole("button", { name: /Ljubno/ })).toBeTruthy();
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
        selectableIds={new Set()}
        selected={[]}
        onToggle={() => undefined}
        onActiveShelters={() => undefined}
        onActiveMunicipality={() => undefined}
      />
    </I18nProvider>,
  );
  return screen.getByRole("searchbox");
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
  });
});

describe("MunicipalityFinder postal guess beside the občina name", () => {
  it("offers the občina that is spelled, not only the postcode's own", () => {
    // "Križevci" is postal district 9206 in Goričko, whose three občine are
    // Gornji Petrovci, Šalovci and Moravske Toplice, and it is also Občina
    // Križevci near Ljutomer. The guess used to win outright, so the reader
    // was asked "which of these three" and the one they had spelled was not
    // among them.
    const search = renderReal();
    fireEvent.change(search, { target: { value: "Križevci" } });

    expect(screen.getByRole("button", { name: /Križevci/ })).toBeTruthy();
    // The postal district's own občine are still offered: the guess is kept,
    // not swapped for the name.
    expect(screen.getByRole("button", { name: /Gornji Petrovci/ })).toBeTruthy();

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
