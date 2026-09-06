// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnimalForm,
  buildPatch,
  draftFrom,
  sanitizeDraft,
  type Draft,
} from "@/components/portal/animal-form";
import { SEX_META } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import type { PortalAnimal } from "@/lib/portal-api";

afterEach(cleanup);

const NOW = new Date(2026, 8, 6, 12, 0);

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

describe("sanitizeDraft", () => {
  const base = draftFrom(animal());

  it("keeps a stored text box and a stored answer", () => {
    expect(
      sanitizeDraft({ name: "Murka", ageMonths: "3", sex: "male" }, base),
    ).toEqual({ name: "Murka", ageMonths: "3", sex: "male" });
  });

  it("keeps a stored null on a choice row: the answer was taken back", () => {
    expect(sanitizeDraft({ energy: null }, base)).toEqual({ energy: null });
  });

  it("drops a null where a text box has to hold a string", () => {
    // A missing string would turn the box into an uncontrolled input.
    expect(sanitizeDraft({ name: null }, base)).toEqual({});
  });

  it("drops a number, an object and an array", () => {
    expect(
      sanitizeDraft(
        { ageYears: 2, breed: { text: "x" }, size: ["small"] },
        base,
      ),
    ).toEqual({});
  });

  it("drops a key this form does not have", () => {
    expect(sanitizeDraft({ status: "adopted", photos: [] }, base)).toEqual({});
  });

  it("drops an answer the row does not offer", () => {
    // It would reach the wire as a patch the API refuses.
    expect(sanitizeDraft({ sex: "banana", specialNeeds: "unknown" }, base)).toEqual(
      {},
    );
  });

  it("takes nothing from a stored value that is not an object", () => {
    expect(sanitizeDraft(null, base)).toEqual({});
    expect(sanitizeDraft("Murka", base)).toEqual({});
    expect(sanitizeDraft(["name"], base)).toEqual({});
    expect(sanitizeDraft(undefined, base)).toEqual({});
  });
});

describe("buildPatch", () => {
  function draft(changes: Partial<Draft>, subject = animal()): Draft {
    return { ...draftFrom(subject), ...changes };
  }

  it("never sends a text past the API's limit", () => {
    const { patch } = buildPatch(
      draft({
        name: "a".repeat(250),
        breed: "b".repeat(250),
        shortDescription: "c".repeat(2500),
      }),
      animal(),
      NOW,
    );
    expect(patch.name).toHaveLength(200);
    expect(patch.breed).toHaveLength(200);
    expect(patch.shortDescription).toHaveLength(2000);
  });

  it("sends a birth date the animal could have", () => {
    const { patch, dateError } = buildPatch(
      draft({ birthDate: "2020-05-01" }),
      animal(),
      NOW,
    );
    expect(dateError).toBe(false);
    expect(patch.birthDate).toBe("2020-05-01");
  });

  it("leaves a birth date in the future out and says so", () => {
    const { patch, dateError } = buildPatch(
      draft({ birthDate: "2030-01-01" }),
      animal(),
      NOW,
    );
    expect(dateError).toBe(true);
    expect("birthDate" in patch).toBe(false);
  });

  it("leaves a birth date before 1900 out and says so", () => {
    const { patch, dateError } = buildPatch(
      draft({ birthDate: "0001-01-01" }),
      animal(),
      NOW,
    );
    expect(dateError).toBe(true);
    expect("birthDate" in patch).toBe(false);
  });

  it("does not turn an unusable date into a revert", () => {
    // The override stands until the shelter types a date or empties the box.
    const subject = animal({
      birthDate: "2020-05-01",
      overrides: { birthDate: "2020-05-01" },
    });
    const { patch } = buildPatch(
      draft({ birthDate: "1850-01-01" }, subject),
      subject,
      NOW,
    );
    expect("birthDate" in patch).toBe(false);
  });

  it("leaves an age past the cap out and names the box", () => {
    const { patch, ageError } = buildPatch(
      draft({ ageYears: "150", ageMonths: "" }),
      animal(),
      NOW,
    );
    expect(ageError).toBe("years");
    expect("approximateAgeMonths" in patch).toBe(false);
  });
});

describe("AnimalForm", () => {
  function renderForm(
    subject: PortalAnimal = animal(),
    props: Partial<React.ComponentProps<typeof AnimalForm>> = {},
  ) {
    const handlers = {
      set: vi.fn(),
      setAge: vi.fn(),
      revertAge: vi.fn(),
      setBirthDate: vi.fn(),
      revertBirthDate: vi.fn(),
      markBox: vi.fn(),
    };
    render(
      <AnimalForm
        uid="t"
        animal={subject}
        draft={draftFrom(subject)}
        reverting={() => false}
        saving={false}
        ageError={null}
        ageErrorId="t-age-error"
        dateError={false}
        dateErrorId="t-date-error"
        {...handlers}
        {...props}
      />,
    );
    return handlers;
  }

  function box(id: string): HTMLInputElement {
    const control = document.getElementById(id);
    if (!control) throw new Error(`no control #${id}`);
    return control as HTMLInputElement;
  }

  /** What Chromium hands over for "2-1" in a number box: no value, badInput. */
  function makeUnreadable(control: HTMLInputElement, badInput = true) {
    Object.defineProperty(control, "validity", {
      configurable: true,
      value: { badInput },
    });
  }

  it("reports a number box the browser could not read", () => {
    const { setAge } = renderForm();
    const years = box("portal-age-years");
    makeUnreadable(years);

    // The value goes from "2" to "": that is the whole of what the browser
    // says about "2-1", apart from the flag.
    fireEvent.change(years, { target: { value: "" } });

    expect(setAge).toHaveBeenCalledWith("ageYears", "", true);
  });

  it("reports a readable value as readable", () => {
    const { setAge } = renderForm();
    const months = box("portal-age-months");
    makeUnreadable(months, false);

    fireEvent.change(months, { target: { value: "3" } });

    expect(setAge).toHaveBeenCalledWith("ageMonths", "3", false);
  });

  it("keeps the mark current from the input event when the value does not move", () => {
    // "e" typed into an empty months box: "" before, "" after, so React
    // fires no onChange. The input event still says the box is unreadable.
    const { setAge, markBox } = renderForm();
    const months = box("portal-age-months");
    makeUnreadable(months);

    fireEvent.input(months, { target: { value: "" } });

    expect(setAge).not.toHaveBeenCalled();
    expect(markBox).toHaveBeenCalledWith("ageMonths", true);
  });

  it("reports a date box the browser could not read", () => {
    // The case that cleared an override: a set date typed over with a year
    // the browser pads to 0001, which it hands over as no value at all.
    const { setBirthDate } = renderForm(animal({ birthDate: "2020-05-01" }));
    const date = box("portal-birth-date");
    makeUnreadable(date);

    fireEvent.change(date, { target: { value: "" } });

    expect(setBirthDate).toHaveBeenCalledWith("", true);
  });

  it("marks only the age box at fault", () => {
    renderForm(animal(), { ageError: "months" });

    expect(box("portal-age-years").getAttribute("aria-invalid")).toBeNull();
    expect(box("portal-age-months").getAttribute("aria-invalid")).toBe("true");
    expect(box("portal-age-months").getAttribute("aria-errormessage")).toBe(
      "t-age-error",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      portalText.invalidError,
    );
  });

  it("puts the date's message under the date box", () => {
    renderForm(animal(), { dateError: true });

    const date = box("portal-birth-date");
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(date.getAttribute("aria-errormessage")).toBe("t-date-error");
    const message = screen.getByRole("alert");
    expect(message.id).toBe("t-date-error");
    expect(message.textContent).toContain(portalText.birthDateError);
    expect(
      document
        .querySelector('[data-field="birthDate"]')
        ?.contains(message),
    ).toBe(true);
  });

  it("caps the text boxes at what the API takes", () => {
    renderForm();

    expect(box("portal-name").maxLength).toBe(200);
    expect(box("portal-breed").maxLength).toBe(200);
    expect(box("portal-description").maxLength).toBe(2000);
  });

  describe("tapping the chosen card off", () => {
    function chosen(label: string, name: string): HTMLElement {
      return within(screen.getByRole("radiogroup", { name: label })).getByRole(
        "radio",
        { name },
      );
    }

    it("is ignored on a row the crawl answered", () => {
      // The crawl read "samica" off the site and the shelter has not
      // overridden it. Tapping it off would empty the grid while the patch
      // dropped the null: a change shown and never sent.
      const { set } = renderForm(animal({ sex: "female" }));

      fireEvent.click(chosen(portalText.fieldSex, SEX_META.female.label));

      expect(set).not.toHaveBeenCalled();
    });

    it("clears a row the shelter overrode: that is the way back", () => {
      const { set } = renderForm(
        animal({ sex: "female", overrides: { sex: "female" } }),
      );

      fireEvent.click(chosen(portalText.fieldSex, SEX_META.female.label));

      expect(set).toHaveBeenCalledWith("sex", null);
    });

    it("clears a row the crawl left empty: nothing is lost", () => {
      const subject = animal({ sex: null });
      const { set } = renderForm(subject, {
        draft: { ...draftFrom(subject), sex: "male" },
      });

      fireEvent.click(chosen(portalText.fieldSex, SEX_META.male.label));

      expect(set).toHaveBeenCalledWith("sex", null);
    });
  });
});
