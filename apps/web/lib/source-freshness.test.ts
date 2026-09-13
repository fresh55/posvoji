import { describe, expect, it } from "vitest";
import { sourceIsOld, verificationTime } from "./source-freshness";

describe("source verification", () => {
  it("does not confuse republication with a source check", () => {
    const published = Date.parse("2026-09-13T12:00:00Z");
    expect(sourceIsOld("2026-09-05T12:00:00Z", published)).toBe(true);
    expect(sourceIsOld("2026-09-13T06:00:00Z", published)).toBe(false);
    expect(sourceIsOld(undefined, published)).toBe(true);
    expect(sourceIsOld("bad", published)).toBe(true);
    expect(sourceIsOld("2026-09-14T06:00:00Z", published)).toBe(true);
  });
  it("shows time and the Ljubljana date across a UTC day boundary", () => {
    expect(verificationTime("2026-09-13T23:30:00Z", "en")).toContain("14 Sept 2026");
    expect(verificationTime("2026-09-13T23:30:00Z", "en")).toContain("01:30");
    expect(verificationTime("2026-09-13T23:30:00Z", "sl")).toContain("Ljubljana");
  });
});
