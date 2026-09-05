// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalPageGallery } from "@/components/animal-page-gallery";
import { I18nProvider } from "@/components/i18n-provider";
import type { PermittedPhoto } from "@/lib/animal-images";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const IMAGES: PermittedPhoto[] = Array.from({ length: 3 }, (_, index) => ({
  src: `/media/animals/pika-${index + 1}.webp`,
  widths: [320, 480, 640],
}));

function gallery() {
  return (
    <I18nProvider locale="sl">
      <AnimalPageGallery
        images={IMAGES}
        name="Pika"
        sizes="100vw"
        className="relative aspect-[4/3]"
      />
    </I18nProvider>
  );
}

function position(root: HTMLElement) {
  return root.querySelector('[data-slot="photo-position"]')?.textContent;
}

// The parameter cannot be read while rendering. Under static export the HTML
// is written at build time with no query in it, so a first client render that
// read one would disagree with what it is hydrating.
describe("the animal page's gallery and the photo a link names", () => {
  it("hydrates the prerendered first photo before it moves to the named one", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // Built with no query, the way the export writes it.
    const container = document.createElement("div");
    container.innerHTML = renderToString(gallery());
    expect(position(container)).toBe("Fotografija 1 od 3");

    // And opened on a link that names the third photo.
    window.history.replaceState(null, "", "?foto=3");
    const root = hydrateRoot(container, gallery());
    await act(async () => undefined);

    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes("hydrat"),
      ),
    ).toBe(false);
    expect(position(container)).toBe("Fotografija 3 od 3");
    await act(async () => root.unmount());
  });
});
