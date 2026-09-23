// @vitest-environment jsdom

import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalPageGallery } from "@/components/animal-page-gallery";
import { AnimalPagePhotoProvider, AnimalPageShareButton } from "@/components/animal-page-photo-state";
import { I18nProvider } from "@/components/i18n-provider";
import type { PermittedPhoto } from "@/lib/animal-images";
// The lightbox is a chunk the first tap fetches (animal-page-gallery.tsx).
// Imported here it loads while the file is collected, which has no time
// limit. Under the full suite, loading it inside the first test took longer
// than that test's five seconds.
import "@/components/animal-page-lightbox";

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
  cleanup();
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
      <AnimalPagePhotoProvider count={IMAGES.length}>
        <AnimalPageGallery
          images={IMAGES}
          name="Pika"
          sizes="100vw"
          className="relative aspect-[4/3]"
        />
        <AnimalPageShareButton path="/zival/pika/test/test" name="Pika" />
      </AnimalPagePhotoProvider>
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
  it("returns focus to the photo after a tap that did not focus the trigger", async () => {
    render(gallery());
    const trigger = screen.getByRole("button", { name: "Odpri fotografijo 1 čez cel zaslon" });
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(trigger);
    const lightbox = await screen.findByRole("dialog");
    fireEvent.click(within(lightbox).getByRole("button", { name: "Zapri" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("enlarges the chosen photo and shares subsequent lightbox selection", async () => {
    window.history.replaceState(null, "", "?foto=2");
    const { container } = render(gallery());
    expect(container.querySelector('[data-slot="photo-count"]')?.textContent).toBe("2 / 3");
    const trigger = screen.getByRole("button", { name: "Odpri fotografijo 2 čez cel zaslon" });
    trigger.focus();
    fireEvent.click(trigger);
    const lightbox = await screen.findByRole("dialog");
    expect(within(lightbox).getByRole("img").getAttribute("src")).toContain("pika-2");
    fireEvent.click(within(lightbox).getByRole("button", { name: "Naslednja fotografija" }));
    expect(within(lightbox).getByRole("img").getAttribute("src")).toContain("pika-3");
    fireEvent.click(within(lightbox).getByRole("button", { name: "Zapri" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(container.querySelector('[data-slot="photo-count"]')?.textContent).toBe("3 / 3");
    fireEvent.click(screen.getByRole("button", { name: "Deli" }));
    const link = await screen.findByRole("textbox", { name: "Povezava" });
    expect((link as HTMLInputElement).value).toContain("?foto=3");
    expect(window.location.search).toBe("?foto=2");
  });

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
