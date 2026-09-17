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
  pointer(surface, "lostpointercapture", { x: 100, y: 80, time: 1301 });
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
  fireEvent.click(surface);
  expect(onOpenPhoto).not.toHaveBeenCalled();

  pointer(surface, "pointerdown", { x: 150, y: 80, time: 1400 });
  pointer(surface, "pointerup", { x: 150, y: 80, time: 1460 });
  pointer(surface, "lostpointercapture", { x: 150, y: 80, time: 1461 });
  fireEvent.click(surface);
  expect(onOpenPhoto).toHaveBeenCalledOnce();
});
