// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalPhoto } from "@/components/animal-photo";
import type { PermittedPhoto } from "@/lib/animal-images";

afterEach(cleanup);

const SIZES = "(max-width: 639px) 50vw, 15rem";

// A cached photo with everything ingest derives, so each test can take the
// field it is about away rather than build a shape up from nothing.
const CACHED: PermittedPhoto = {
  src: "/media/animals/0123456789abcdef.webp",
  widths: [320, 480, 640, 800],
  avif: true,
  blurDataURL: "data:image/webp;base64,UklGRg==",
};

function draw(props: Partial<Parameters<typeof AnimalPhoto>[0]> = {}) {
  const { container } = render(
    <AnimalPhoto photo={CACHED} alt="" sizes={SIZES} {...props} />,
  );
  const img = container.querySelector("img");
  if (!img) throw new Error("no image drawn");
  return { container, img };
}

describe("AnimalPhoto candidates", () => {
  it("offers every rung on the ladder, largest under its plain name", () => {
    const { img } = draw();

    // A 375px phone reaching this srcset stops at the 480 rung. Before it
    // there was one candidate at every width, and that width was 800.
    expect(img.getAttribute("srcset")).toBe(
      "/media/animals/0123456789abcdef-320.webp 320w, " +
        "/media/animals/0123456789abcdef-480.webp 480w, " +
        "/media/animals/0123456789abcdef-640.webp 640w, " +
        "/media/animals/0123456789abcdef.webp 800w",
    );
    expect(img.getAttribute("sizes")).toBe(SIZES);
    // The src stays the largest rung: it is what a browser with no srcset
    // support downloads, and the only file guaranteed to exist.
    expect(img.getAttribute("src")).toBe("/media/animals/0123456789abcdef.webp");
  });

  it("names only rungs the ladder says were written", () => {
    const { img } = draw({ photo: { ...CACHED, widths: [320, 400] } });

    // 480 and 640 are skipped for a photo the shelter published at 400px, so
    // naming them would be a 404 on the phone that picked one.
    expect(img.getAttribute("srcset")).toBe(
      "/media/animals/0123456789abcdef-320.webp 320w, " +
        "/media/animals/0123456789abcdef.webp 400w",
    );
  });

  it("falls back to one file for a photo with none of the fields", () => {
    // The remote hotlink: a cache-permitted photo whose cache attempt failed,
    // served from the shelter, with no siblings of any kind.
    const { container, img } = draw({
      photo: { src: "https://shelter.example/luna.jpg" },
    });

    expect(img.getAttribute("src")).toBe("https://shelter.example/luna.jpg");
    expect(img.getAttribute("srcset")).toBeNull();
    // sizes describes a choice, and there is none to make.
    expect(img.getAttribute("sizes")).toBeNull();
    expect(container.querySelector("picture")).toBeNull();
    expect(container.querySelector("[style*='background-image']")).toBeNull();
  });
});

describe("AnimalPhoto avif", () => {
  it("offers the avif sibling ahead of the webp ladder when asked", () => {
    const { container } = draw({ avif: true });

    const source = container.querySelector("picture source");
    expect(source?.getAttribute("type")).toBe("image/avif");
    expect(source?.getAttribute("srcset")).toBe(
      "/media/animals/0123456789abcdef.avif",
    );
  });

  it("stays out of the way unless the surface asks for it", () => {
    // The AVIF only exists at the cached copy's full width, so a single
    // candidate <source> beats the whole ladder. Surfaces that want a smaller
    // rung must not get it.
    expect(draw().container.querySelector("picture")).toBeNull();
  });

  it("offers nothing where ingest derived no avif", () => {
    const { container } = draw({ avif: true, photo: { ...CACHED, avif: undefined } });
    expect(container.querySelector("picture")).toBeNull();
  });
});

describe("AnimalPhoto placeholder", () => {
  it("paints the inline placeholder under the photo", () => {
    const { container } = draw();

    const layer = container.querySelector("div[aria-hidden]");
    expect(layer?.getAttribute("style")).toContain(
      'background-image: url("data:image/webp;base64,UklGRg==")',
    );
    // Under the photo and out of the accessibility tree: the photograph paints
    // over it and nothing has to take it away again.
    expect(layer?.className).toContain("absolute inset-0");
  });

  it("leaves the ground alone for a photo that does not cover its box", () => {
    const { container } = draw({ blur: false });
    expect(container.querySelector("div[aria-hidden]")).toBeNull();
  });
});

describe("AnimalPhoto loading", () => {
  it("is lazy and unhurried by default", () => {
    const { img } = draw();
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("fetchpriority")).toBeNull();
  });

  it("loads the first row at once and at the front of the queue", () => {
    // What next/image's deprecated `priority` prop did, said in the two
    // attributes it stood for.
    const { img } = draw({ eager: true });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });
});
