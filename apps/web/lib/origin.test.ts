import { describe, expect, it } from "vitest";
import { readTypedLocation, resolveOrigin } from "./origin";

const HERE = { lat: 46.5, lon: 15.6 };

describe("readTypedLocation", () => {
  it("treats an empty or whitespace input as nothing typed yet", () => {
    expect(readTypedLocation("").status).toBe("empty");
    expect(readTypedLocation("   ").status).toBe("empty");
  });

  it("stays quiet on a single letter", () => {
    expect(readTypedLocation("m").status).toBe("empty");
  });

  it("stays quiet on a partial postcode", () => {
    expect(readTypedLocation("1").status).toBe("empty");
    expect(readTypedLocation("10").status).toBe("empty");
    expect(readTypedLocation("100").status).toBe("empty");
  });

  it("resolves a full postcode", () => {
    const typed = readTypedLocation("1000");
    expect(typed.status).toBe("matched");
    if (typed.status !== "matched") return;
    expect(typed.label).toBe("Ljubljana");
    expect(typed.at.lat).toBeCloseTo(46.05, 1);
  });

  it("resolves a town name without diacritics", () => {
    const typed = readTypedLocation("ajdovscina");
    expect(typed.status).toBe("matched");
    if (typed.status !== "matched") return;
    expect(typed.label).toBe("Ajdovščina");
  });

  it("ignores surrounding whitespace", () => {
    const typed = readTypedLocation("  Maribor  ");
    expect(typed.status).toBe("matched");
    if (typed.status !== "matched") return;
    expect(typed.label).toBe("Maribor");
  });

  it("calls a finished input that matches nothing unknown", () => {
    expect(readTypedLocation("qqqq").status).toBe("unknown");
    expect(readTypedLocation("9999").status).toBe("unknown");
  });

  it("treats half of a real name as still being typed", () => {
    // Several Ljubljana districts and several Šmarje ones start this way, so
    // neither resolves yet, and neither is a mistake.
    expect(readTypedLocation("lju").status).toBe("empty");
    expect(readTypedLocation("smar").status).toBe("empty");
  });

  it("still calls an input no name continues unknown", () => {
    expect(readTypedLocation("qqqqq").status).toBe("unknown");
    // Two districts are named Šentrupert in full, so this resolves to neither
    // and is not on its way to anything longer.
    expect(readTypedLocation("sentrupert").status).toBe("unknown");
  });

  it("resolves a postcode pasted with its town", () => {
    const typed = readTypedLocation("1000 Ljubljana");
    expect(typed.status).toBe("matched");
    if (typed.status !== "matched") return;
    expect(typed.label).toBe("Ljubljana");
  });
});

describe("resolveOrigin", () => {
  it("has no origin when neither source offers one", () => {
    expect(resolveOrigin(undefined, { status: "empty" })).toEqual({
      source: "none",
    });
  });

  it("has no origin when the typed input matches nothing", () => {
    expect(resolveOrigin(undefined, { status: "unknown" })).toEqual({
      source: "none",
    });
  });

  it("uses the typed location when geolocation is off", () => {
    const resolved = resolveOrigin(undefined, readTypedLocation("1000"));

    expect(resolved.source).toBe("typed");
    expect(resolved.label).toBe("Ljubljana");
    expect(resolved.at?.lat).toBeCloseTo(46.05, 1);
  });

  it("lets a live fix win over a matched typed location", () => {
    const resolved = resolveOrigin(HERE, readTypedLocation("1000"));

    expect(resolved.source).toBe("geolocation");
    expect(resolved.at).toEqual(HERE);
    expect(resolved.label).toBeUndefined();
  });

  it("falls back to the typed location when geolocation is switched off", () => {
    const typed = readTypedLocation("Maribor");

    expect(resolveOrigin(HERE, typed).source).toBe("geolocation");
    expect(resolveOrigin(undefined, typed).source).toBe("typed");
  });

  it("falls back to nothing when the typed location is cleared", () => {
    expect(resolveOrigin(undefined, readTypedLocation("")).source).toBe("none");
  });

  it("uses a live fix even with nothing typed", () => {
    const resolved = resolveOrigin(HERE, { status: "empty" });

    expect(resolved.source).toBe("geolocation");
    expect(resolved.at).toEqual(HERE);
  });
});
