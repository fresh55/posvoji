import { describe, expect, it } from "vitest";
import { flagList, flagValue, hasFlag } from "./cli";

describe("flagValue", () => {
  it("takes the value after the flag", () => {
    expect(flagValue(["--provider", "muri"], "--provider")).toBe("muri");
  });

  it("is undefined when the flag is absent", () => {
    expect(flagValue(["--other", "x"], "--provider")).toBeUndefined();
  });

  it("refuses a flag left without its value", () => {
    expect(() => flagValue(["--provider"], "--provider")).toThrow(
      /requires a value/,
    );
    expect(() =>
      flagValue(["--provider", "--discard-previous"], "--provider"),
    ).toThrow(/requires a value/);
  });
});

describe("flagList", () => {
  it("collects every occurrence", () => {
    expect(
      flagList(
        ["--accept-removals", "muri", "--accept-removals", "turk"],
        "--accept-removals",
      ),
    ).toEqual(["muri", "turk"]);
  });

  it("splits a comma-separated list", () => {
    expect(
      flagList(["--accept-removals", "muri, turk"], "--accept-removals"),
    ).toEqual(["muri", "turk"]);
  });

  it("is empty when the flag is absent", () => {
    expect(flagList([], "--accept-removals")).toEqual([]);
  });
});

describe("hasFlag", () => {
  it("finds a bare flag", () => {
    expect(hasFlag(["--discard-previous"], "--discard-previous")).toBe(true);
    expect(hasFlag([], "--discard-previous")).toBe(false);
  });
});
