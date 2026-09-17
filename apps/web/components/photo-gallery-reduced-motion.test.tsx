// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { pointer } from "@/test/pointer";

vi.mock("motion/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("motion/react")>(),
  useReducedMotion: () => true,
}));

afterEach(cleanup);

it("commits a reduced-motion touch swipe without moving the image or opening its link", () => {
  const onNavigate = vi.fn();
  const { container } = render(
    <I18nProvider locale="sl">
      <PhotoGallery images={[{ src: "/one.webp" }, { src: "/two.webp" }]}
        sizes="100vw" href="/animal" onNavigate={onNavigate} />
    </I18nProvider>,
  );
  const surface = container.querySelector("a")!;
  Object.defineProperty(surface, "clientWidth", { value: 300 });
  pointer(surface, "pointerdown", { x: 250, y: 80, time: 1000 });
  pointer(surface, "pointermove", { x: 100, y: 80, time: 1200 });
  expect(surface.style.transform).toBe("");
  pointer(surface, "pointerup", { x: 100, y: 80, time: 1300 });
  expect(container.querySelector('[data-slot="photo-position"]')?.textContent).toBe("Fotografija 2 od 2");
  fireEvent.click(surface);
  expect(onNavigate).not.toHaveBeenCalled();
});

it("blocks a swipe's compatibility click after capture release but accepts the next photo tap", () => {
  const onOpenPhoto = vi.fn();
  const { getByRole } = render(
    <I18nProvider locale="sl">
      <PhotoGallery
        images={[{ src: "/one.webp" }, { src: "/two.webp" }]}
        sizes="100vw"
        onOpenPhoto={onOpenPhoto}
      />
    </I18nProvider>,
  );
  const surface = getByRole("button", { name: "Odpri fotografijo 1 čez cel zaslon" });
  Object.defineProperty(surface, "clientWidth", { value: 300 });
  pointer(surface, "pointerdown", { x: 250, y: 80, time: 1000 });
  pointer(surface, "pointermove", { x: 100, y: 80, time: 1200 });
  pointer(surface, "pointerup", { x: 100, y: 80, time: 1300 });
  pointer(surface, "lostpointercapture", { x: 100, y: 80, time: 1301 });
  fireEvent.click(surface, { detail: 1 });
  expect(onOpenPhoto).not.toHaveBeenCalled();

  pointer(surface, "pointerdown", { x: 150, y: 80, time: 1400 });
  pointer(surface, "pointerup", { x: 150, y: 80, time: 1460 });
  pointer(surface, "lostpointercapture", { x: 150, y: 80, time: 1461 });
  fireEvent.click(surface, { detail: 1 });
  expect(onOpenPhoto).toHaveBeenCalledOnce();
});

it("opens on the first keyboard activation after a touch swipe with no compatibility click", () => {
  const onOpenPhoto = vi.fn();
  const { getByRole } = render(
    <I18nProvider locale="sl">
      <PhotoGallery
        images={[{ src: "/one.webp" }, { src: "/two.webp" }]}
        name="Pika"
        sizes="100vw"
        onOpenPhoto={onOpenPhoto}
        showCount
      />
    </I18nProvider>,
  );
  const group = getByRole("group", { name: "Fotografije: Pika" });
  expect(group.querySelector('[data-slot="photo-dots"]')).not.toBeNull();
  expect(group.querySelector('[data-slot="photo-count"]')?.textContent).toBe("1 / 2");
  const surface = getByRole("button", { name: "Odpri fotografijo 1 čez cel zaslon" });
  expect(surface.getAttribute("aria-keyshortcuts")).toBe("ArrowLeft ArrowRight Home End");
  Object.defineProperty(surface, "clientWidth", { value: 300 });
  pointer(surface, "pointerdown", { x: 250, y: 80, time: 1000 });
  pointer(surface, "pointermove", { x: 100, y: 80, time: 1200 });
  pointer(surface, "pointerup", { x: 100, y: 80, time: 1300 });
  pointer(surface, "lostpointercapture", { x: 100, y: 80, time: 1301 });
  // Enter-generated clicks have detail 0 and must not consume a touch guard.
  fireEvent.click(surface, { detail: 0 });
  expect(onOpenPhoto).toHaveBeenCalledOnce();
});
