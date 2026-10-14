// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnimalPhoto } from "@/components/animal-photo";
import { AnimalPhotoPreload } from "@/components/animal-photo-preload";
import type { PermittedPhoto } from "@/lib/animal-images";

const PHOTO: PermittedPhoto = {
  src: "/media/animals/0123456789abcdef.webp",
  widths: [320, 480, 640, 800],
  avif: true,
};
const SIZES = "(min-width: 1024px) 31rem, (min-width: 640px) 47vw, 100vw";

function rendered(photo: PermittedPhoto | undefined) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<>
    <AnimalPhotoPreload photo={photo} sizes={SIZES} />
    {photo && <AnimalPhoto photo={photo} alt="Mila" sizes={SIZES} avif eager />}
  </>);
  return root;
}

describe("the standalone photo's early request", () => {
  it("preloads the picture's AVIF without also downloading the WebP fallback", () => {
    const root = rendered(PHOTO);
    const links = root.querySelectorAll('link[rel="preload"][as="image"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(root.querySelector("source")?.getAttribute("srcset"));
    expect(links[0].getAttribute("type")).toBe("image/avif");
    expect(links[0].getAttribute("fetchpriority")).toBe("high");
    expect(links[0].getAttribute("imagesrcset")).toBeNull();
  });

  it("matches the responsive WebP choice when no AVIF was derived", () => {
    const root = rendered({ ...PHOTO, avif: undefined });
    const links = root.querySelectorAll('link[rel="preload"][as="image"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("imagesrcset")).toBe(root.querySelector("img")?.getAttribute("srcset"));
    expect(links[0].getAttribute("imagesizes")).toBe(SIZES);
    expect(links[0].getAttribute("fetchpriority")).toBe("high");
  });

  it("uses the actual permitted remote photo when it has no derived ladder", () => {
    const photo = { src: "https://shelter.example/mila.jpg" };
    const root = rendered(photo);
    const links = root.querySelectorAll('link[rel="preload"][as="image"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(photo.src);
    expect(links[0].getAttribute("imagesrcset")).toBeNull();
  });

  it("requests nothing when there is no permitted photo", () => {
    expect(rendered(undefined).querySelector("link")).toBeNull();
  });
});
