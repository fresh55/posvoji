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

  // The brand and warn families are registered as Tailwind colours in
  // globals.css, so the call sites spell them as plain utilities. The merge
  // has never heard of the names, and it does not need to: it groups by the
  // property, and an unknown colour name is still a colour. Pinned because
  // the site passes a caller's className over a variant's own background and
  // border at dozens of sites, and a merge that kept both would hand the last
  // word to stylesheet order instead of to the caller.
  it("lets a brand colour override a standard one", () => {
    expect(cn("bg-background", "bg-brand")).toBe("bg-brand");
    expect(cn("border-border", "border-brand-border")).toBe(
      "border-brand-border",
    );
  });
});
