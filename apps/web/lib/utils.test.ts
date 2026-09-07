import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// The custom radius has to lose to a standard one and win over it, whichever
// the caller wrote last. Both directions are pinned, because a merge that
// simply dropped one of them would pass a test written only one way.
describe("cn", () => {
  it("lets a standard radius override the custom one", () => {
    expect(cn("rounded-ui", "rounded-full")).toBe("rounded-full");
  });

  it("lets the custom radius override a standard one", () => {
    expect(cn("rounded-full", "rounded-ui")).toBe("rounded-ui");
  });

  it("leaves a radius on another corner alone", () => {
    expect(cn("rounded-ui-top", "rounded-full")).toBe(
      "rounded-ui-top rounded-full",
    );
  });
});
