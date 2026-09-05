// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
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

// What a surface with something to say about a missing photo hands over. The
// lightbox's own line is the only one on the site; this stands in for it.
const UNAVAILABLE = <p data-slot="unavailable">Fotografije ni.</p>;

function fallback(container: HTMLElement) {
  return container.querySelector('[data-slot="unavailable"]');
}

type PhotoProps = Partial<Parameters<typeof AnimalPhoto>[0]>;

function draw(props: PhotoProps = {}) {
  const { container, rerender } = render(
    <AnimalPhoto photo={CACHED} alt="" sizes={SIZES} {...props} />,
  );
  function drawn() {
    const img = container.querySelector("img");
    if (!img) throw new Error("no image drawn");
    return img;
  }
  return {
    container,
    img: drawn(),
    // The element itself, read again: a surface that hands this component one
    // photo after another gets a new <img> per source, so the one a test holds
    // from before a step is not the one on screen after it.
    drawn,
    // The caller coming back with another photo, the way the lightbox does.
    show(next: PhotoProps) {
      rerender(
        <AnimalPhoto photo={CACHED} alt="" sizes={SIZES} {...props} {...next} />,
      );
    },
  };
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

describe("AnimalPhoto crop", () => {
  it("anchors a portrait photo above the middle of the box", () => {
    // 3:4, the tallest print the fan draws. Centred, the crop takes the head.
    const { img } = draw({ photo: { ...CACHED, aspect: 0.75 } });
    expect(img.style.objectPosition).toBe("50% 20%");
  });

  it("leaves a photo the box already fits alone", () => {
    // No aspect is the 4:3 every box assumes, so there is nothing to bias.
    const { img } = draw();
    expect(img.style.objectPosition).toBe("");
  });

  it("leaves a square photo alone", () => {
    // A square loses the same amount either side of centre, and the head is
    // not pushed out of it.
    const { img } = draw({ photo: { ...CACHED, aspect: 1 } });
    expect(img.style.objectPosition).toBe("");
  });

  it("stays centred where the caller does not crop", () => {
    // The lightbox contains the photo, where an object-position would only
    // shove a fully visible picture upward.
    const { img } = draw({ photo: { ...CACHED, aspect: 0.75 }, crop: "center" });
    expect(img.style.objectPosition).toBe("");
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

  it("loads at once without taking the front of the queue", () => {
    // The prints beside the front one in the dialog's fan: on screen from the
    // start, so waiting for them to scroll into view says nothing, but not the
    // photo being looked at either, so they must not be asked for ahead of it.
    const { img } = draw({ loading: "eager" });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBeNull();
  });

  it("lets eager win where a surface asks for both", () => {
    // Above the fold beats "on screen but not the subject", so the priority
    // survives a lazy default the caller also passed.
    const { img } = draw({ eager: true, loading: "lazy" });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });
});

describe("AnimalPhoto failure", () => {
  it("takes a photo that never arrived out of the box", () => {
    // A cached copy renamed under a stale page, or a shelter file gone. Left
    // alone it sits as a broken image over the box's own ground; hidden, the
    // ground shows instead, which is what the box shows while a photo is still
    // on its way. Written to the element rather than to state, so this is the
    // element itself that has to change.
    const { img } = draw();
    fireEvent.error(img);

    expect(img.hidden).toBe(true);
    expect(img.dataset.broken).toBe("true");
  });

  it("leaves a photo that arrived alone", () => {
    const { img } = draw();
    expect(img.hidden).toBe(false);
    expect(img.dataset.broken).toBeUndefined();
  });

  it("hides the photo that failed and not the one shown after it", () => {
    // The lightbox keeps one of these mounted and hands it photo after photo,
    // so the same element is reused with a new src. Written to the element,
    // the flag has to leave with the file it was about, or one photo that
    // never arrived would take every healthy one after it down with it.
    const { img, drawn, show } = draw();
    fireEvent.error(img);
    expect(img.hidden).toBe(true);

    const next = { ...CACHED, src: "/media/animals/fedcba9876543210.webp" };
    show({ photo: next });

    const after = drawn();
    expect(after.getAttribute("src")).toBe(next.src);
    expect(after.hidden).toBe(false);
    expect(after.dataset.broken).toBeUndefined();
  });

  it("puts a photo back when a later attempt at it arrives", () => {
    // A browser may pick another rung off the srcset and retry on this same
    // element. The load that lands is the failure being over.
    const { img } = draw();
    fireEvent.error(img);
    fireEvent.load(img);

    expect(img.hidden).toBe(false);
    expect(img.dataset.broken).toBeUndefined();
  });

  it("draws the caller's fallback over the ground the photo left", () => {
    // The surface where the photograph is the whole view has something to say
    // about a photo that never came; every other one keeps its own ground and
    // passes none of this.
    const { container, img } = draw({ fallback: UNAVAILABLE });
    expect(fallback(container)).toBeNull();

    fireEvent.error(img);

    expect(fallback(container)?.textContent).toBe("Fotografije ni.");
  });

  it("takes the fallback away when a later attempt at the photo arrives", () => {
    // The same retry the flag above comes off on. A line about a failure that
    // is over would outlive the thing it was about.
    const { container, img } = draw({ fallback: UNAVAILABLE });
    fireEvent.error(img);
    fireEvent.load(img);

    expect(fallback(container)).toBeNull();
  });

  it("keeps the fallback with the photo that failed and not the next one", () => {
    // The failure is held by source, not by the box: the index is the caller's
    // and moves under this component, the file does not. So the next photo is
    // drawn clean, and the way back to the one that failed says what it said.
    const { container, drawn, show } = draw({ fallback: UNAVAILABLE });
    fireEvent.error(drawn());

    show({ photo: { ...CACHED, src: "/media/animals/fedcba9876543210.webp" } });
    expect(fallback(container)).toBeNull();

    show({ photo: CACHED });
    expect(fallback(container)).not.toBeNull();
  });
});
