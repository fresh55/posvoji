import { describe, expect, it } from "vitest";
import { HttpUrl } from "./url";

describe("HttpUrl", () => {
  it.each(["http://example.com/resource", "https://example.com/resource"])(
    "accepts %s",
    (url) => {
      expect(HttpUrl.safeParse(url).success).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>not a web URL</h1>",
    "ftp://example.com/resource",
    "//example.com/resource",
    "https://user:secret@example.com/resource",
  ])("rejects the unsafe URL %s", (url) => {
    expect(HttpUrl.safeParse(url).success).toBe(false);
  });
});
