import { describe, expect, it } from "vitest";
import type { LoadedPolicy } from "./policies";
import { validateProviderRegistry } from "./registry-validation";

function loaded(providerId: string, enabled = true): LoadedPolicy {
  return {
    dir: `providers/${providerId}`,
    policy: { providerId, enabled } as LoadedPolicy["policy"],
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
