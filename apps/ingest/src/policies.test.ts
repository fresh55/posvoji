import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPolicies } from "./policies";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "posvoji-policies-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writePolicy(
  folder: string,
  fields: {
    providerId: string;
    enabled: boolean;
    allowedFields?: string[];
  },
): void {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "policy.yaml"),
    [
      `providerId: ${fields.providerId}`,
      `source: https://example-shelter.si/zivali`,
      `enabled: ${fields.enabled}`,
      `ingestion: scrape`,
      `images: none`,
      `descriptions: facts-only`,
      `permission:`,
      `  status: ${fields.enabled ? "granted" : "none"}`,
      ...(fields.enabled ? ["  date: 2026-08-18"] : []),
      ...(fields.allowedFields
        ? [
            "allowedFields:",
            ...fields.allowedFields.map((field) => `  - ${field}`),
          ]
        : []),
      `attribution: "Vir: Example zavetišče"`,
      `crawl:`,
      `  intervalHours: 12`,
      `  excludePaths:`,
      `    - /privat-oddaja`,
      "",
    ].join("\n"),
  );
}

describe("loadPolicies", () => {
  it("loads a valid tree without complaint", () => {
    writePolicy("muri", { providerId: "muri", enabled: true });
    writePolicy("_template", { providerId: "template", enabled: false });

    const { policies, errors } = loadPolicies(root);

    expect(errors).toEqual([]);
    expect(policies.map((p) => p.policy.providerId).sort()).toEqual([
      "muri",
      "template",
    ]);
  });

  it("reports two directories claiming one providerId", () => {
    writePolicy("muri", { providerId: "muri", enabled: true });
    // The folder-name check exempts templates, so a copied template is how a
    // second directory ends up crawling somebody else's shelter.
    writePolicy("_muri-copy", { providerId: "muri", enabled: false });

    const { errors } = loadPolicies(root);

    expect(errors).toHaveLength(2);
    for (const error of errors) {
      expect(error.message).toMatch(/providerId "muri" is also declared by/);
    }
  });

  it("reports a template directory that is enabled", () => {
    writePolicy("_template", { providerId: "template", enabled: true });

    const { policies, errors } = loadPolicies(root);

    expect(policies).toEqual([]);
    expect(errors[0]?.message).toMatch(/template folder .* must not be enabled/);
  });

  it("accepts an allowedFields list of known Animal fields", () => {
    writePolicy("muri", {
      providerId: "muri",
      enabled: true,
      allowedFields: ["name", "sex", "images", "shortDescription"],
    });

    const { policies, errors } = loadPolicies(root);

    expect(errors).toEqual([]);
    expect(policies[0]?.policy.allowedFields).toEqual([
      "name",
      "sex",
      "images",
      "shortDescription",
    ]);
  });

  it("reports an allowedFields entry that is not an Animal field", () => {
    // Enforcement strips what allowedFields does not name, so a typo would
    // read as a withheld grant and drop the field from every animal.
    writePolicy("muri", {
      providerId: "muri",
      enabled: true,
      allowedFields: ["name", "shortDesc", "photos"],
    });

    const { policies, errors } = loadPolicies(root);

    expect(policies).toEqual([]);
    expect(errors[0]?.message).toBe(
      "allowedFields: not an Animal field: shortDesc, photos",
    );
  });

  it("still reports a folder that does not match its providerId", () => {
    writePolicy("muri", { providerId: "turk", enabled: false });
    expect(loadPolicies(root).errors[0]?.message).toMatch(
      /does not match providerId/,
    );
  });
});
