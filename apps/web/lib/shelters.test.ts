import { afterEach, describe, expect, it, vi } from "vitest";
import { getShelterBySlug, loadShelters } from "./shelters";

/**
 * The loader against a registry file that is not the real one.
 *
 * node:fs rather than a fixture path, because the module resolves
 * data/shelters.yaml itself and is not asking anyone where it is. Modules are
 * reset per case so the registry's build-time cache does not carry one case's
 * file into the next, and the mock passes every other path through: the
 * module graph this pulls in reads more than one file.
 *
 * `null` means the file is not there at all.
 */
async function registryOf(yaml: string | null) {
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    const isRegistry = (path: unknown) =>
      String(path).endsWith("shelters.yaml");
    return {
      ...actual,
      default: actual,
      existsSync: (path: string) =>
        isRegistry(path) ? yaml !== null : actual.existsSync(path),
      // readFileSync is heavily overloaded, so the passthrough is typed as the
      // one shape this needs rather than reconstructed from the overloads.
      readFileSync: (path: string, ...rest: unknown[]) => {
        const read = actual.readFileSync as (
          ...args: unknown[]
        ) => string | Buffer;
        return isRegistry(path) ? yaml : read(path, ...rest);
      },
    };
  });
  return import("./shelters");
}

const GOOD = `shelters:
  - id: zonzani
    name: Zavetišče Zonzani
    city: Dramlje
    website: https://www.zonzani.si/
    email: info@zonzani.si
    phone: "03 749 06 00"
`;

describe("shelter registry loader", () => {
  it("loads every shelter from data/shelters.yaml", () => {
    const shelters = loadShelters();
    expect(shelters.length).toBeGreaterThan(10);
    expect(
      shelters.every((shelter) => shelter.id && shelter.name && shelter.city),
    ).toBe(true);
  });

  it("keeps shelter ids unique", () => {
    const ids = loadShelters().map((shelter) => shelter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("parses a known entry with every optional field present", () => {
    const zonzani = getShelterBySlug("zonzani");
    expect(zonzani).toMatchObject({
      id: "zonzani",
      name: "Zavetišče Zonzani",
      city: "Dramlje",
      website: "https://www.zonzani.si/",
      email: "info@zonzani.si",
      phone: "03 749 06 00",
    });
  });

  it("leaves missing optional fields undefined rather than guessing", () => {
    const johanca = getShelterBySlug("johanca");
    expect(johanca?.city).toBe("Tolmin");
    expect(johanca?.website).toBeUndefined();
    expect(johanca?.phone).toBeUndefined();
  });

  it("returns undefined for a slug that isn't in the registry", () => {
    expect(getShelterBySlug("does-not-exist")).toBeUndefined();
  });
});

/**
 * What the loader does with a file it cannot read, which until now was to
 * quietly return what was left.
 *
 * That is the failure mode this whole block exists for: the shelters index
 * never prints a zero, so a register that came back empty or short rendered a
 * page with a heading, a lede, an invite card and a provenance line on it and
 * nothing else, and the build passed. Every case here is a file that used to
 * produce that page.
 */
describe("a registry the loader cannot read", () => {
  afterEach(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  it("still loads a file that is fine", async () => {
    const { loadShelters: load } = await registryOf(GOOD);

    expect(load()).toHaveLength(1);
    expect(load()[0]).toMatchObject({ id: "zonzani", city: "Dramlje" });
  });

  it("throws when the file is not there", async () => {
    const { loadShelters: load } = await registryOf(null);

    expect(load).toThrow(/registry is missing/i);
  });

  it("throws when the YAML will not parse", async () => {
    const { loadShelters: load } = await registryOf("shelters: [unclosed\n");

    expect(load).toThrow(/will not parse/i);
  });

  it("throws when there is no shelters list", async () => {
    const { loadShelters: load } = await registryOf("meta:\n  register_date: 2026-02-23\n");

    expect(load).toThrow(/no shelters list/i);
  });

  it("throws when the list is empty", async () => {
    const { loadShelters: load } = await registryOf("shelters: []\n");

    expect(load).toThrow(/is empty/i);
  });

  // The one that matters most: a good entry beside a bad one used to load the
  // good one and say nothing about the other.
  it("throws rather than dropping an entry missing a required field", async () => {
    const { loadShelters: load } = await registryOf(
      `${GOOD}  - id: brez-kraja\n    name: Zavetišče brez kraja\n`,
    );

    expect(load).toThrow(/has no city/);
  });

  it("names every fault in the file, not just the first", async () => {
    const { loadShelters: load } = await registryOf(
      "shelters:\n" +
        "  - id: prvi\n    name: Prvi\n" +
        "  - id: drugi\n    name: Drugi\n    city: Kraj\n    email: ni-naslov\n",
    );

    expect(load).toThrow(/has no city/);
    expect(load).toThrow(/email is not an address/);
    expect(load).toThrow(/2 unusable entries/);
  });

  // The optional fields, which were typed and never checked. Each one goes
  // straight into an href on seventeen cards.
  it("refuses a website that is not http or https", async () => {
    const { loadShelters: load } = await registryOf(
      "shelters:\n  - id: x\n    name: X\n    city: Y\n" +
        '    website: "javascript:alert(1)"\n',
    );

    expect(load).toThrow(/website is not http or https/);
  });

  it("refuses a website that is not a URL at all", async () => {
    const { loadShelters: load } = await registryOf(
      "shelters:\n  - id: x\n    name: X\n    city: Y\n    website: zonzani.si\n",
    );

    expect(load).toThrow(/website is not a URL/);
  });

  // A comma or a newline in an address is a second recipient, or a header.
  it("refuses an email that could carry a second recipient", async () => {
    const { loadShelters: load } = await registryOf(
      "shelters:\n  - id: x\n    name: X\n    city: Y\n" +
        '    email: "info@x.si,kdo@drugam.si"\n',
    );

    expect(load).toThrow(/email is not an address/);
  });

  it("refuses a phone a dialler cannot take", async () => {
    const { loadShelters: load } = await registryOf(
      "shelters:\n  - id: x\n    name: X\n    city: Y\n" +
        '    phone: "03 749 06 00 ali doma"\n',
    );

    expect(load).toThrow(/phone has characters/);
  });

  // Two entries under one id: one wins every lookup and the other loses its
  // detail page without anything being reported.
  it("throws when two entries claim one id", async () => {
    const { loadShelters: load } = await registryOf(
      `${GOOD}  - id: zonzani\n    name: Drugi Zonzani\n    city: Celje\n`,
    );

    expect(load).toThrow(/id is used twice/);
  });
});
