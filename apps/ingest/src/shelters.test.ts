import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadShelters, shelterRegistryPath } from "./shelters";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "posvoji-shelters-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(body: string): string {
  const path = join(root, "shelters.yaml");
  writeFileSync(path, body, "utf8");
  return path;
}

describe("loadShelters", () => {
  it("indexes an entry by its id and keeps only the three dataset fields", () => {
    const path = write(
      [
        "shelters:",
        "  - id: johanca",
        "    name: Zavetišče Johanca (Veterina Tolmin)",
        "    city: Tolmin",
        "    email: zavetisce.johanca@gmail.com",
        "    notes: >-",
        "      Dovoljenje potrjeno 2026-08-20.",
      ].join("\n"),
    );

    expect(loadShelters(path).get("johanca")).toEqual({
      id: "johanca",
      name: "Zavetišče Johanca (Veterina Tolmin)",
      city: "Tolmin",
    });
  });

  it("leaves out an entry missing one of the three fields", () => {
    const path = write(
      ["shelters:", "  - id: brez", "    name: Zavetišče brez mesta"].join("\n"),
    );

    expect(loadShelters(path).has("brez")).toBe(false);
  });

  it("throws when the register is missing", () => {
    expect(() => loadShelters(join(root, "nikjer.yaml"))).toThrow(
      /shelter register is missing/,
    );
  });

  it("throws when the register has no shelters list", () => {
    expect(() => loadShelters(write("meta:\n  register_date: 2026-08-01"))).toThrow(
      /no shelters list/,
    );
  });

  // The register the pipeline actually reads. Both manual shelters need an
  // entry in it or their listings cannot be built into animals.
  it("has an entry for every manual shelter in the repository register", () => {
    const shelters = loadShelters(shelterRegistryPath);

    expect(shelters.get("johanca")?.city).toBe("Tolmin");
    expect(shelters.get("oskar")?.city).toBe("Vitovlje");
  });
});
