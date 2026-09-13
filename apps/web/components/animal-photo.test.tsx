// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalPhoto } from "@/components/animal-photo";
import type { PermittedPhoto } from "@/lib/animal-images";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Whether the file is already in hand when the element is handed over. jsdom
// fetches nothing, so every image it makes is incomplete forever; this is the
// one fact the fade is decided on, so each test says which case it is about.
function arrivesLater(later: boolean) {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
    !later,
  );
}

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

  it("draws the blur where the photo will land", () => {
    // The same crop on both layers, or the head sits low in the blur and jumps
    // up the moment the file arrives. 140 of the register's lead photos are
    // portrait.
    const { container, img } = draw({ photo: { ...CACHED, aspect: 0.75 } });

    const layer = container.querySelector("div[aria-hidden]");
    expect(img.style.objectPosition).toBe("50% 20%");
    expect((layer as HTMLElement).style.backgroundPosition).toBe("50% 20%");
    // The blur covers the frame, the way the photo does.
    expect(layer?.className).toContain("bg-cover");
  });

  it("leaves the blur on the box's own middle where the photo is", () => {
    // Nothing is crossed out, so both layers keep their default: the photo's
    // 50% 50% and the placeholder's bg-center are the same place.
    const { container, img } = draw();

    const layer = container.querySelector("div[aria-hidden]");
    expect(img.style.objectPosition).toBe("");
    expect((layer as HTMLElement).style.backgroundPosition).toBe("");
    expect(layer?.className).toContain("bg-center");
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

  it("keeps the animal ingest found inside a box it is told the shape of", () => {
    // A 3:2 photo in the card's square, cat at the left end of the bench:
    // the window opens on the cat instead of the middle of the bench.
    const { img } = draw({
      photo: { ...CACHED, subject: [5, 10, 30, 80], ratio: 1.5 },
      frame: 1,
    });
    expect(img.style.objectPosition).toBe("0% 50%");
  });

  it("falls back to the portrait bias for a photo with no box", () => {
    const { img } = draw({ photo: { ...CACHED, aspect: 0.75 }, frame: 1 });
    expect(img.style.objectPosition).toBe("50% 20%");
  });

  it("can only bias a portrait when it is not told the frame", () => {
    // The box is there, but without the frame's shape there is no window to
    // put it in, so the crop does what it always did.
    const { img } = draw({
      photo: { ...CACHED, aspect: 0.75, subject: [10, 5, 80, 50], ratio: 0.75 },
    });
    expect(img.style.objectPosition).toBe("50% 20%");
  });

  it("does not move a contained photo for a box either", () => {
    const { img } = draw({
      photo: { ...CACHED, subject: [5, 10, 30, 80], ratio: 1.5 },
      frame: 1,
      crop: "center",
    });
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

describe("AnimalPhoto arrival", () => {
  it("marks a photo that is still on its way", () => {
    arrivesLater(true);
    const { img } = draw();

    // The mark is the opacity, and taking it off is the fade. Nothing here is
    // in the server's markup: the ref that writes it runs on the client.
    expect(img.dataset.arriving).toBe("true");
    expect(img.className).toContain("motion-safe:data-[arriving]:opacity-0");
    // Under a reduced-motion setting neither the mark nor the transition
    // applies, so the photo is simply there.
    expect(img.className).toContain("motion-safe:transition-opacity");
  });

  it("leaves a photo that is already in hand alone", () => {
    // The warm cache, which is most of them: a photo that is complete when the
    // element is handed over never waited, so there is nothing to fade in.
    arrivesLater(false);
    expect(draw().img.dataset.arriving).toBeUndefined();
  });

  it("takes the mark off when the photo lands", () => {
    arrivesLater(true);
    const { img } = draw();
    fireEvent.load(img);

    expect(img.dataset.arriving).toBeUndefined();
  });

  it("leaves the failure handling as it was", () => {
    // The fade rides on the same two handlers the failure does, so a photo
    // that errors still goes out of the box and still comes back.
    arrivesLater(true);
    const { img } = draw();
    fireEvent.error(img);
    expect(img.hidden).toBe(true);
    expect(img.dataset.broken).toBe("true");

    fireEvent.load(img);
    expect(img.hidden).toBe(false);
    expect(img.dataset.arriving).toBeUndefined();
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
