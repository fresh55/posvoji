import { describe, expect, it } from "vitest";
import { ChangeEntry } from "./dataset";

const validEntry = {
  id: "macja-hisa:luna",
  providerId: "macja-hisa",
  sourceUrl: "https://www.macjahisa.si/posvojitev/muce/luna",
  species: "cat",
};

describe("ChangeEntry", () => {
  it("accepts an HTTP(S) source URL", () => {
    expect(ChangeEntry.safeParse(validEntry).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "data:text/html,unsafe", "ftp://example.com"])(
    "rejects the non-HTTP(S) source URL %s",
    (sourceUrl) => {
      expect(
        ChangeEntry.safeParse({ ...validEntry, sourceUrl }).success,
      ).toBe(false);
    },
  );
});
