import { describe, expect, it } from "vitest";
import { fieldLabel } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { invalidMessage, message } from "@/hooks/portal-list";
import { PortalError } from "@/lib/portal-api";

describe("what a refused value tells the shelter", () => {
  it("names one field under the label the form shows it as", () => {
    const text = message(new PortalError(422, "x", { fields: ["name"] }), "fallback");

    expect(text).toBe("Podatek v polju Ime ni v pravi obliki. Preverite vnos.");
  });

  it("uses the dual for two fields", () => {
    expect(invalidMessage(["breed", "birthDate"])).toBe(
      "Podatka v poljih Pasma in Datum rojstva nista v pravi obliki. Preverite vnos.",
    );
  });

  it("lists three or more with commas and one 'in'", () => {
    expect(invalidMessage(["name", "sex", "shortDescription"])).toBe(
      "Podatki v poljih Ime, Spol in Kratek opis niso v pravi obliki. Preverite vnos.",
    );
  });

  it("falls back to the raw key for a field the form has no name for", () => {
    expect(fieldLabel("thumbnailUrl")).toBe("thumbnailUrl");
    expect(invalidMessage(["thumbnailUrl"])).toContain("thumbnailUrl");
    expect(invalidMessage(["thumbnailUrl"])).not.toContain("[object Object]");
  });

  it("says only that a value was refused when no field was named", () => {
    expect(message(new PortalError(422, "no"), "fallback")).toBe(
      portalText.invalidError,
    );
    expect(message(new PortalError(400), "fallback")).toBe(
      portalText.invalidError,
    );
  });

  it("maps every editable field to a label the form uses", () => {
    const labels = [
      "name",
      "status",
      "sex",
      "breed",
      "birthDate",
      "approximateAgeMonths",
      "size",
      "energy",
      "goodWithKids",
      "goodWithDogs",
      "goodWithCats",
      "apartmentOk",
      "specialNeeds",
      "shortDescription",
    ].map(fieldLabel);

    expect(labels).toEqual([
      portalText.fieldName,
      portalText.statusLegend,
      portalText.fieldSex,
      portalText.fieldBreed,
      portalText.fieldBirthDate,
      portalText.fieldAgeMonths,
      portalText.fieldSize,
      portalText.fieldEnergy,
      portalText.fieldGoodWithKids,
      portalText.fieldGoodWithDogs,
      portalText.fieldGoodWithCats,
      portalText.fieldApartmentOk,
      portalText.fieldSpecialNeeds,
      portalText.fieldDescription,
    ]);
  });
});

describe("the other failures", () => {
  it("keeps their one sentence each", () => {
    expect(message(new PortalError(403), "fallback")).toBe(
      portalText.forbidden,
    );
    expect(message(new PortalError(0), "fallback")).toBe(
      portalText.networkError,
    );
  });

  it("says only what the caller was doing for a server fault", () => {
    expect(message(new PortalError(500, "boom"), "fallback")).toBe("fallback");
    expect(message(new Error("not ours"), "fallback")).toBe("fallback");
  });
});
