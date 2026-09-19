// @vitest-environment jsdom
//
// jsdom, not node: the header's controls are client components that read the
// i18n context, and the provider that carries it wraps its children in
// MotionConfig (motion/react), which reads window.matchMedia.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n-provider";
import { SiteHeader } from "./site-header";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(cleanup);

/** Every component and route source file under a directory, tests left out. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [path] : [];
  });
}

describe("the site header", () => {
  // The half of the view-transition contract that lives in the markup.
  // globals.css hangs view-transition-name: site-header on this class so the
  // band stands still while a navigation carries the page under it, and a
  // rename here would take the rule off without failing anything: the
  // stylesheet would still parse, the build would still pass, and the header
  // would quietly go back to cross-fading with itself.
  it("marks the band the page transition pins", () => {
    const { container } = render(
      <I18nProvider locale="sl">
        <SiteHeader locale="sl" />
      </I18nProvider>,
    );

    const pinned = container.querySelectorAll(".site-header");
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.tagName).toBe("HEADER");
  });

  // A view-transition-name has to be unique in the document or the browser
  // drops the whole transition, and rendering this component alone cannot
  // see a second band added on some page. The source tree can: the class is
  // written into one className in one file, and a second writer would be a
  // second element on whichever page rendered both. Imports and comments
  // spell the name too, which is why the match asks for the attribute.
  it("is the only source file that writes the pinned class", () => {
    // Relative to the process, which is apps/web, the vitest root; the same
    // reason shelter-map.test.tsx gives for not asking import.meta.url.
    const roots = ["components", "app"];
    const writers = roots
      .flatMap(sourceFiles)
      .filter((path) => /className=["'][^"']*\bsite-header\b/.test(readFileSync(path, "utf8")))
      .map((path) => path.replaceAll("\\", "/"));

    expect(writers).toEqual(["components/site-header.tsx"]);
  });
});
