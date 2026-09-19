import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATE_PATHS, gateCookieHeader, isGatedView, readGateCookie } from "./demo-gate";

describe("readGateCookie", () => {
  it("finds the gate cookie among others and decodes it", () => {
    expect(readGateCookie("a=1; posvoji_demo=ma%C4%8Dka%3D1; b=2")).toBe("mačka=1");
  });

  it("is empty when the cookie is absent", () => {
    expect(readGateCookie("")).toBe("");
    expect(readGateCookie("posvoji_demo_other=x")).toBe("");
  });
});

describe("gateCookieHeader", () => {
  it("writes a site-wide, lax, secure cookie for a month", () => {
    expect(gateCookieHeader("geslo")).toBe(
      "posvoji_demo=geslo; Path=/; Max-Age=2592000; SameSite=Lax; Secure",
    );
  });

  it("drops Secure on plain http, and an empty value expires it", () => {
    expect(gateCookieHeader("x", false)).not.toContain("Secure");
    expect(gateCookieHeader("")).toBe(
      "posvoji_demo=; Path=/; Max-Age=0; SameSite=Lax; Secure",
    );
  });
});

describe("isGatedView", () => {
  it("is false only on the gate's own addresses", () => {
    expect(isGatedView(GATE_PATHS.sl)).toBe(false);
    expect(isGatedView(GATE_PATHS.en)).toBe(false);
    expect(isGatedView(`${GATE_PATHS.sl}.html`)).toBe(false);
    expect(isGatedView("/")).toBe(true);
    expect(isGatedView("/en")).toBe(true);
    expect(isGatedView("/zival/abc")).toBe(true);
  });
});

// Keep route names compatible with the minimal server contract fixture.
// Production configuration and its runbook are maintained outside Git.
describe("the Caddy contract allow-list", () => {
  it("names every gate route, clean and .html", () => {
    const fixture = readFileSync(new URL("../../../scripts/fixtures/demo-gate.caddy", import.meta.url), "utf8");
    const allowList = fixture.match(/^\s*not path (.+)$/mu)?.[1] ?? "";
    expect(allowList).not.toBe("");
    for (const path of Object.values(GATE_PATHS)) {
      expect(allowList.split(/\s+/u)).toContain(path);
      expect(allowList.split(/\s+/u)).toContain(`${path}.html`);
    }
  });
});
