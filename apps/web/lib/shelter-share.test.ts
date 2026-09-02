import { describe, expect, it } from "vitest";
import { shelterMetadata, shelterPath, shelterPlateUrl } from "@/lib/shelter-share";
import { loadShelters, type ShelterRegistryEntry } from "@/lib/shelters";

// Next's Twitter metadata is a union keyed on `card`, so the field is not
// readable off the union itself. The card is exactly what these assertions are
// about, so they read it through the one shape that has it.
function twitterCard(meta: ReturnType<typeof shelterMetadata>): string | undefined {
  return (meta.twitter as { card?: string } | null | undefined)?.card;
}

const shelter: ShelterRegistryEntry = {
  id: "muri",
  name: "Zavod Muri",
  city: "Vransko",
};

describe("shelterPath", () => {
  it("reads as an address in each language", () => {
    expect(shelterPath("muri", "sl")).toBe("/zavetisca/muri");
    expect(shelterPath("muri", "en")).toBe("/en/shelters/muri");
  });
});

describe("shelterPlateUrl", () => {
  it("finds the plate the build script drew for a registered shelter", () => {
    // Reads the real public dir, on purpose: the plates are committed assets,
    // so a registry entry without one is a run of the script that never
    // happened, and this is the test that says so.
    const missing = loadShelters().filter(
      (entry) => shelterPlateUrl(entry.id) === undefined,
    );
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it("has nothing for a shelter that is not in the registry", () => {
    expect(shelterPlateUrl("not-a-shelter")).toBeUndefined();
  });
});

describe("shelterMetadata", () => {
  it("says who and where, in the reader's language", () => {
    const sl = shelterMetadata(shelter, "sl", true);
    expect(sl.title).toBe("Zavod Muri | Posvoji.si");
    expect(sl.description).toContain("Zavod Muri, Vransko.");
    expect(sl.alternates?.canonical).toBe("/zavetisca/muri");
    expect(sl.alternates?.languages).toEqual({
      sl: "/zavetisca/muri",
      en: "/en/shelters/muri",
    });

    const en = shelterMetadata(shelter, "en", true);
    expect(en.description).toContain("Contact details and animals");
    expect(en.alternates?.canonical).toBe("/en/shelters/muri");
  });

  it("promises no animals for a shelter that shares none", () => {
    // Six of the seventeen registered shelters are in this state today. The
    // page says so in the body; the description used to advertise a list that
    // was not there.
    const sl = shelterMetadata(shelter, "sl", false);
    expect(sl.description).toBe(
      "Zavod Muri, Vransko. Kontaktni podatki zavetišča na Posvoji.si.",
    );
    expect(sl.openGraph?.description).toBe(sl.description);

    const en = shelterMetadata(shelter, "en", false);
    expect(en.description).toBe(
      "Zavod Muri, Vransko. Shelter contact details on Posvoji.si.",
    );
  });

  it("hands the plate to both languages as a large card", () => {
    for (const locale of ["sl", "en"] as const) {
      const meta = shelterMetadata(shelter, locale, true);
      const images = meta.openGraph?.images;
      expect(images).toEqual([
        {
          url: "/map-plates/muri.jpg",
          width: 1200,
          height: 630,
          alt: expect.stringContaining("Zavod Muri"),
        },
      ]);
      expect(twitterCard(meta)).toBe("summary_large_image");
    }
  });

  it("falls back to a plain summary when no plate was drawn", () => {
    const meta = shelterMetadata({ ...shelter, id: "not-a-shelter" }, "sl", true);
    expect(meta.openGraph?.images).toBeUndefined();
    expect(twitterCard(meta)).toBe("summary");
  });
});
