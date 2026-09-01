import { describe, expect, it } from "vitest";
import type { LoadedPolicy } from "./policies";
import { validateProviderRegistry } from "./registry-validation";

function loaded(
  providerId: string,
  enabled = true,
  ingestion: LoadedPolicy["policy"]["ingestion"] = "scrape",
): LoadedPolicy {
  return {
    dir: `providers/${providerId}`,
    policy: { providerId, enabled, ingestion } as LoadedPolicy["policy"],
  };
}

describe("validateProviderRegistry", () => {
  it("accepts an enabled policy with one registered adapter", () => {
    expect(validateProviderRegistry([loaded("muri")], [{ id: "muri" }])).toEqual(
      [],
    );
  });

  it("reports an enabled policy without a registered adapter", () => {
    expect(validateProviderRegistry([loaded("muri")], [])[0]?.message).toMatch(
      /enabled provider "muri" is missing/,
    );
  });

  it("allows a disabled policy without an adapter", () => {
    expect(
      validateProviderRegistry([loaded("future", false)], []),
    ).toEqual([]);
  });

  it("reports a registered adapter without a policy", () => {
    expect(validateProviderRegistry([], [{ id: "muri" }])[0]?.message).toMatch(
      /registered provider "muri" has no policy/,
    );
  });

  // A manual provider is crawled by the portal. Its animals come from the
  // listings feed and the crawl loop skips it, so an adapter is not missing.
  it("allows an enabled manual policy without an adapter", () => {
    expect(
      validateProviderRegistry([loaded("johanca", true, "manual")], []),
    ).toEqual([]);
  });

  it("reports a manual policy that has an adapter", () => {
    const errors = validateProviderRegistry(
      [loaded("johanca", true, "manual")],
      [{ id: "johanca" }],
    );

    expect(errors[0]?.message).toMatch(
      /"johanca" is ingestion: manual but has an adapter/,
    );
  });

  it("reports duplicate adapter registrations", () => {
    const errors = validateProviderRegistry(
      [loaded("muri")],
      [{ id: "muri" }, { id: "muri" }],
    );

    expect(errors.some((error) => /registered 2 times/.test(error.message))).toBe(
      true,
    );
  });
});
