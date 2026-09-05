import { describe, expect, it } from "vitest";
import { brandMarkPaths, BRAND_MARK_VIEWBOX } from "./brand-mark";

describe("brandMarkPaths", () => {
  it("hands back the drawing and nothing that decides its colour", () => {
    const markup = brandMarkPaths();

    expect(markup).toContain("<path");
    // The file's own <style> block is what paints the mark, and half of it is
    // a prefers-color-scheme rule. Carried onto a sheet it would print a
    // near-white mark onto white paper in a dark-mode preview.
    expect(markup).not.toContain("<style");
    expect(markup).not.toContain("prefers-color-scheme");
    // No fill of its own either, so the one the poster sets is the one that
    // prints.
    expect(markup).not.toMatch(/fill="#/);
    // The wrapper is the caller's, so the viewBox constant above is the only
    // copy of the coordinate system.
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain("</svg>");
    // And the comment about the header's dependency on the silhouette is a
    // note to whoever opens the file, not markup.
    expect(markup).not.toContain("<!--");
  });

  it("reads the same file the favicon and the header do", () => {
    // 128 x 120.8 is app/icon.svg's own viewBox. If the drawing is ever
    // redrawn at another size, the mark on the sheet would be stretched and
    // nothing else would say so.
    expect(BRAND_MARK_VIEWBOX).toBe("0 0 128 120.8");
  });

  it("caches, so a thousand poster pages read the file once", () => {
    expect(brandMarkPaths()).toBe(brandMarkPaths());
  });
});
