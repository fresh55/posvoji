import { describe, expect, it } from "vitest";
import {
  birthDateFault,
  draftFrom,
  sanitizeListingDraft,
  shapeOf,
} from "@/components/portal/listing-form";
import type { PortalListing } from "@/lib/portal-api";

const NOW = new Date(2026, 8, 6, 12, 0);

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

describe("sanitizeListingDraft", () => {
  const base = draftFrom(listing());

  it("keeps a stored text box and a stored answer", () => {
    expect(
      sanitizeListingDraft(
        { name: "Lunica", ageMonths: "3", sex: "male" },
        base,
      ),
    ).toEqual({ name: "Lunica", ageMonths: "3", sex: "male" });
  });

  it("keeps a stored null on a choice row: the answer was taken back", () => {
    expect(sanitizeListingDraft({ energy: null }, base)).toEqual({
      energy: null,
    });
  });

  it("keeps the species and the status, which a listing has and an animal does not", () => {
    expect(
      sanitizeListingDraft({ species: "dog", status: "reserved" }, base),
    ).toEqual({ species: "dog", status: "reserved" });
    // A new listing's draft has the same keys as an existing one's.
    expect(
      sanitizeListingDraft({ species: "dog" }, draftFrom(null)),
    ).toEqual({ species: "dog" });
  });

  it("drops a null where a text box has to hold a string", () => {
    // A missing string would turn the box into an uncontrolled input.
    expect(sanitizeListingDraft({ name: null }, base)).toEqual({});
  });

  it("drops a null status: a listing always has one", () => {
    expect(sanitizeListingDraft({ status: null }, base)).toEqual({});
  });

  it("drops a number, an object and an array", () => {
    expect(
      sanitizeListingDraft(
        { ageYears: 2, breed: { text: "x" }, size: ["small"] },
        base,
      ),
    ).toEqual({});
  });

  it("drops a key this form does not have", () => {
    // Photos are never in the draft: a File is not JSON, and the stored
    // ones belong to the record.
    expect(
      sanitizeListingDraft(
        { photos: [], pending: [{ key: 1 }], overrides: {}, id: "x" },
        base,
      ),
    ).toEqual({});
  });

  it("drops an answer the row does not offer", () => {
    // It would reach the wire as a body the API refuses.
    expect(
      sanitizeListingDraft(
        {
          sex: "banana",
          specialNeeds: "unknown",
          species: "dragon",
          status: "gone",
        },
        base,
      ),
    ).toEqual({});
  });

  it("takes nothing from a stored value that is not an object", () => {
    expect(sanitizeListingDraft(null, base)).toEqual({});
    expect(sanitizeListingDraft("Luna", base)).toEqual({});
    expect(sanitizeListingDraft(["name"], base)).toEqual({});
    expect(sanitizeListingDraft(undefined, base)).toEqual({});
    expect(sanitizeListingDraft(3, base)).toEqual({});
  });
});

describe("shapeOf", () => {
  it("cuts the text to what the API takes", () => {
    // The inputs carry the same limits as maxLength, but a draft read back
    // from storage never went through them.
    const { shape } = shapeOf({
      ...draftFrom(listing()),
      name: "L".repeat(201),
      breed: "m".repeat(201),
      shortDescription: "o".repeat(2001),
    });

    expect(shape.name).toHaveLength(200);
    expect(shape.breed).toHaveLength(200);
    expect(shape.shortDescription).toHaveLength(2000);
  });

  it("refuses an age past a hundred years at the years box", () => {
    expect(
      shapeOf({ ...draftFrom(listing()), ageYears: "150", ageMonths: "" })
        .ageError,
    ).toBe("years");
    expect(
      shapeOf({ ...draftFrom(listing()), ageYears: "99", ageMonths: "13" })
        .ageError,
    ).toBe("months");
  });
});

describe("birthDateFault", () => {
  it("is no fault for an empty box", () => {
    expect(birthDateFault(draftFrom(listing()), NOW)).toBe(false);
  });

  it("is no fault for a day the animal could have been born on", () => {
    expect(
      birthDateFault(
        { ...draftFrom(listing()), birthDate: "2020-05-01" },
        NOW,
      ),
    ).toBe(false);
  });

  it("refuses a day after today and one before 1900", () => {
    expect(
      birthDateFault({ ...draftFrom(listing()), birthDate: "2026-09-07" }, NOW),
    ).toBe(true);
    expect(
      birthDateFault({ ...draftFrom(listing()), birthDate: "1899-12-31" }, NOW),
    ).toBe(true);
  });

  it("refuses a stored value that is not a date at all", () => {
    expect(
      birthDateFault({ ...draftFrom(listing()), birthDate: "včeraj" }, NOW),
    ).toBe(true);
  });
});
