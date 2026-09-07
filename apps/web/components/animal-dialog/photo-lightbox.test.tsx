// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { LazyMotion, domAnimation } from "motion/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import { I18nProvider } from "@/components/i18n-provider";
import type { PermittedPhoto } from "@/lib/animal-images";
import { GESTURE_T0, pointer, slot } from "@/test/pointer";

// The wash and the frame both ask whether motion is wanted before they render,
// and jsdom ships no matchMedia. Nothing here is reduced.
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

// What animalsForClient hands a client component: a cached WebP copy with a
// width ladder under it and an inline placeholder.
function photos(count: number): PermittedPhoto[] {
  return Array.from({ length: count }, (_, index) => ({
    src: `/media/animals/pika-${index + 1}.webp`,
    widths: [320, 480, 640],
    blurDataURL: "data:image/webp;base64,UklGRg==",
  }));
}

// The lightbox lives inside the dialog's LazyMotion on the site, and an m
// element with no features above it renders nothing.
function open(
  props: Partial<ComponentProps<typeof PhotoLightbox>> = {},
  count = 6,
) {
  const onIndexChange = vi.fn();
  const onOpenChange = vi.fn();
  const images = photos(count);
  function tree(overrides: Partial<ComponentProps<typeof PhotoLightbox>>) {
    return (
      <I18nProvider locale="sl">
        <LazyMotion features={domAnimation}>
          <PhotoLightbox
            open
            onOpenChange={onOpenChange}
            images={images}
            index={0}
            onIndexChange={onIndexChange}
            title="Pika"
            {...props}
            {...overrides}
          />
        </LazyMotion>
      </I18nProvider>
    );
  }
  const { rerender } = render(tree({}));
  return {
    onIndexChange,
    onOpenChange,
    lightbox: screen.getByRole("dialog"),
    // The index is the caller's, so a step is only ever a call. Showing
    // another photo is the caller coming back with a new one.
    show(index: number) {
      rerender(tree({ index }));
    },
    // The caller coming back with a shorter set, which is what a photo pulled
    // from under an open lightbox looks like from in here.
    shrink(count: number) {
      rerender(tree({ images: photos(count) }));
    },
  };
}

function tiles(lightbox: HTMLElement) {
  return within(lightbox).queryAllByRole("button", {
    name: /Pokaži fotografijo/,
  });
}

function toggle(lightbox: HTMLElement) {
  return within(lightbox).getByRole("button", { name: "Vse fotografije" });
}

/** The photograph on show. Read again after every step: the source is what
 *  keys the element, so a step to another photo is another <img>. */
function photoImage(lightbox: HTMLElement) {
  const img = slot(lightbox, "photo-lightbox-photo").querySelector("img");
  if (!img) throw new Error("no photograph drawn");
  return img;
}

function unavailable(lightbox: HTMLElement) {
  return lightbox.querySelector('[data-slot="photo-lightbox-unavailable"]');
}

/** One finger, in the order a phone delivers it. */
function touch(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { x: number; y: number; pointerId?: number; time: number },
) {
  pointer(element, type, {
    ...init,
    pointerType: "touch",
    time: GESTURE_T0 + init.time,
  });
}

/** Two fingers moving apart from a hundred pixels to four hundred, which is
 *  the whole of a pinch the lightbox reads. */
function pinch(photo: HTMLElement) {
  touch(photo, "pointerdown", { x: 100, y: 300, pointerId: 1, time: 0 });
  touch(photo, "pointerdown", { x: 200, y: 300, pointerId: 2, time: 10 });
  touch(photo, "pointermove", { x: 50, y: 300, pointerId: 1, time: 60 });
  touch(photo, "pointermove", { x: 450, y: 300, pointerId: 2, time: 80 });
}

/** A tap short enough in space and time to be one half of a double tap. */
function tap(photo: HTMLElement, at: { x: number; y: number; time: number }) {
  touch(photo, "pointerdown", { x: at.x, y: at.y, time: at.time });
  touch(photo, "pointerup", { x: at.x, y: at.y, time: at.time + 20 });
}

function zoomed(photo: HTMLElement) {
  return photo.getAttribute("data-zoomed");
}

/** The ground behind the photograph, which a pull fades on its way out. */
function scrim() {
  const found = document.querySelector('[data-slot="dialog-overlay"]');
  if (!(found instanceof HTMLElement)) throw new Error("no scrim");
  return found;
}

/** Where the gestures have left the photograph, as motion wrote it. */
function pose(photo: HTMLElement) {
  const box = photo.querySelector("div");
  if (!box) throw new Error("no photo box");
  return box.style.transform;
}

/** Motion writes its values on the next frame, and jsdom runs no frame until
 *  the test lets go of the thread. */
async function frame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/** A box for the photograph to be drawn in. jsdom lays nothing out, and the
 *  pan is clamped against the box and against the 4:3 photograph inside it. */
function sizePhoto(photo: HTMLElement, width: number, height: number) {
  Object.defineProperty(photo, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(photo, "clientHeight", { configurable: true, value: height });
  photo.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
  const img = photo.querySelector("img");
  if (!img) throw new Error("no photograph drawn");
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: 800 });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: 600 });
}

describe("PhotoLightbox contact sheet", () => {
  it("stays out of the way for a set the fan already shows at once", () => {
    // Five photos are exactly what the fan draws, so an overview of them would
    // only repeat the page behind the lightbox.
    const { lightbox } = open({}, 5);
    expect(
      within(lightbox).queryByRole("button", { name: "Vse fotografije" }),
    ).toBeNull();
  });

  it("offers the overview from six photos up", () => {
    const { lightbox } = open();
    expect(toggle(lightbox)).toBeTruthy();
  });

  it("draws every photo once and marks the one in front", () => {
    const { lightbox } = open();

    fireEvent.click(toggle(lightbox));

    const grid = tiles(lightbox);
    expect(grid).toHaveLength(6);
    expect(grid[0]?.getAttribute("aria-current")).toBe("true");
    expect(grid[1]?.getAttribute("aria-current")).toBeNull();
    // The toggle says which of the two views is showing, not just what it
    // leads to.
    expect(toggle(lightbox).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens the photo a tile names and leaves the sheet behind", () => {
    const { lightbox, onIndexChange } = open();

    fireEvent.click(toggle(lightbox));
    fireEvent.click(tiles(lightbox)[3]!);

    expect(onIndexChange).toHaveBeenCalledWith(3);
    // The index is the caller's, so the counter still reads the photo this
    // test opened on. What matters here is that the single view is back.
    expect(tiles(lightbox)).toHaveLength(0);
    expect(within(lightbox).getByText("1 / 6")).toBeTruthy();
  });

  it("opens straight onto the sheet when the caller asks for it", () => {
    const { lightbox } = open({ initialView: "sheet" });

    expect(tiles(lightbox)).toHaveLength(6);
    // The counter belongs to the single photo, and there is none in front.
    expect(within(lightbox).queryByText("1 / 6")).toBeNull();
    expect(
      within(lightbox).queryByRole("button", { name: "Naslednja fotografija" }),
    ).toBeNull();
  });

  it("closes on Escape from the sheet as from the photo", async () => {
    const { onOpenChange } = open({ initialView: "sheet" });

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// The arrows walk a long set one photo at a time. A number goes straight
// there, which is the shortcut every full-screen viewer has trained a keyboard
// to expect.
describe("PhotoLightbox number keys", () => {
  it("jumps to the photo a number names", () => {
    const { lightbox, onIndexChange } = open();

    fireEvent.keyDown(lightbox, { key: "3" });

    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("ignores a number no photo answers to", () => {
    const { lightbox, onIndexChange } = open({}, 5);

    fireEvent.keyDown(lightbox, { key: "9" });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("leaves the number alone in the contact sheet", () => {
    // The grid already shows every photo and each tile is a button of its own,
    // which is where the arrows are turned off for the same reason.
    const { lightbox, onIndexChange } = open({ initialView: "sheet" });

    fireEvent.keyDown(lightbox, { key: "3" });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("leaves a number with a modifier held to the browser", () => {
    const { lightbox, onIndexChange } = open();

    fireEvent.keyDown(lightbox, { key: "3", ctrlKey: true });

    expect(onIndexChange).not.toHaveBeenCalled();
  });
});

// The animal dialog the lightbox is mounted in walks animals on the page keys.
// React bubbles a portal's events up the component tree, so without a stop the
// key swapped the animal underneath, which unmounted the lightbox mid-visit.
describe("PhotoLightbox page keys", () => {
  it("keeps the page keys to itself, away from the dialog it is mounted in", () => {
    const seen = vi.fn();
    const onIndexChange = vi.fn();
    render(
      <I18nProvider locale="sl">
        <LazyMotion features={domAnimation}>
          <div onKeyDown={seen}>
            <PhotoLightbox
              open
              onOpenChange={vi.fn()}
              images={photos(6)}
              index={0}
              onIndexChange={onIndexChange}
              title="Pika"
            />
          </div>
        </LazyMotion>
      </I18nProvider>,
    );
    const lightbox = screen.getByRole("dialog");

    fireEvent.keyDown(lightbox, { key: "PageDown" });
    fireEvent.keyDown(lightbox, { key: "PageUp" });

    expect(seen).not.toHaveBeenCalled();
    expect(onIndexChange).not.toHaveBeenCalled();

    // Only the page keys. The arrows are still the photos' own.
    fireEvent.keyDown(lightbox, { key: "ArrowRight" });

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });
});

// Which photograph is drawn, and how hard the browser is asked to go and get
// it. The lightbox is the view somebody opened to look closely at one photo,
// and the set behind it is the caller's and can change under it.
describe("PhotoLightbox the photograph on show", () => {
  it("fetches the photograph at once and leaves the sheet's tiles lazy", () => {
    // The fan behind seats five prints, so a step past them opens on a photo
    // nothing has asked for yet.
    const { lightbox } = open();

    const img = photoImage(lightbox);
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");

    fireEvent.click(toggle(lightbox));

    // A grid of thumbnails, none of which is the photo being looked at.
    const tile = tiles(lightbox)[0]?.querySelector("img");
    expect(tile?.getAttribute("loading")).toBe("lazy");
    expect(tile?.getAttribute("fetchpriority")).toBeNull();
  });

  it("draws the last photo when the set shrinks under it", () => {
    // An open dialog that renders nothing takes the layer away with focus
    // still inside it, so the index is clamped rather than trusted.
    const { lightbox, shrink } = open({ index: 5 });
    expect(within(lightbox).getByText("6 / 6")).toBeTruthy();

    shrink(3);

    expect(within(lightbox).getByText("3 / 3")).toBeTruthy();
    expect(photoImage(lightbox).getAttribute("src")).toBe(
      "/media/animals/pika-3.webp",
    );
  });
});

// A finger could already swipe the photo and a cursor could not: the chevrons
// were all a mouse or a trackpad was offered, and the picture sat there looking
// draggable. Both gestures run the fan's own numbers.
describe("PhotoLightbox mouse and trackpad", () => {
  it("steps the photo on a mouse drag", () => {
    const { lightbox, onIndexChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    pointer(photo, "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
    pointer(photo, "pointermove", { x: 200, y: 204, pointerType: "mouse" });
    pointer(photo, "pointerup", { x: 200, y: 204, pointerType: "mouse" });

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("keeps a short mouse press a click rather than a drag", () => {
    const { lightbox, onIndexChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    // Under the 8px slop the gesture never declares an axis, so it is still a
    // click and the double tap is left with its own events.
    pointer(photo, "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
    pointer(photo, "pointermove", { x: 304, y: 202, pointerType: "mouse" });
    pointer(photo, "pointerup", { x: 304, y: 202, pointerType: "mouse" });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("leaves a mostly vertical mouse drag alone", () => {
    const { lightbox, onIndexChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    pointer(photo, "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
    pointer(photo, "pointermove", { x: 304, y: 300, pointerType: "mouse" });
    pointer(photo, "pointerup", { x: 304, y: 300, pointerType: "mouse" });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  // The listener is native and non-passive, because React registers onWheel
  // passive and a passive listener may not preventDefault: without the
  // prevent, two fingers on a Mac trackpad are the browser's back gesture.
  it("turns one photo per trackpad swipe and swallows the inertia after it", () => {
    const { lightbox, onIndexChange } = open();
    const frame = slot(lightbox, "photo-lightbox-frame");

    fireEvent.wheel(frame, { deltaX: 300, deltaY: 0 });
    // The tail the trackpad keeps sending after the fingers lift.
    for (let i = 0; i < 4; i++) {
      fireEvent.wheel(frame, { deltaX: 60, deltaY: 0 });
    }

    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("leaves a vertical wheel to whatever scrolls around it", () => {
    const { lightbox, onIndexChange } = open();

    fireEvent.wheel(slot(lightbox, "photo-lightbox-frame"), {
      deltaX: 0,
      deltaY: 300,
    });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  // The sheet scrolls, and there is no single photo to step.
  it("keeps the trackpad gesture away from the contact sheet", () => {
    const { lightbox, onIndexChange } = open({ initialView: "sheet" });

    fireEvent.wheel(slot(lightbox, "photo-lightbox-frame"), {
      deltaX: 300,
      deltaY: 0,
    });

    expect(onIndexChange).not.toHaveBeenCalled();
  });
});

// A phone had a swipe and a double tap and nothing else: a pinch zoomed the
// whole page rather than the photograph, a zoomed photo could not be moved
// under the finger, and the one gesture every full-screen viewer answers to,
// pulling the picture down to throw it away, did nothing at all.
//
// The photo is moved by motion values rather than by state, so jsdom has no
// transform to read: it runs no frame loop. data-zoomed is the fact the view
// itself branches on, and the callbacks are the rest of the contract.
describe("PhotoLightbox touch", () => {
  it("zooms the photo on a pinch and keeps it there when the fingers lift", () => {
    const { lightbox } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");
    expect(zoomed(photo)).toBe("false");

    pinch(photo);
    touch(photo, "pointerup", { x: 450, y: 300, pointerId: 2, time: 100 });

    expect(zoomed(photo)).toBe("true");

    // The second finger is the end of the pinch; the first one leaving is not
    // a gesture of its own and takes nothing back with it.
    touch(photo, "pointerup", { x: 50, y: 300, pointerId: 1, time: 120 });

    expect(zoomed(photo)).toBe("true");
  });

  it("moves the photograph rather than the set while it is zoomed", () => {
    const { lightbox, onIndexChange, onOpenChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    pinch(photo);
    touch(photo, "pointerup", { x: 450, y: 300, pointerId: 2, time: 100 });
    touch(photo, "pointerup", { x: 50, y: 300, pointerId: 1, time: 120 });

    // Far enough and quick enough to be a swipe at the normal size.
    touch(photo, "pointerdown", { x: 300, y: 200, time: 200 });
    touch(photo, "pointermove", { x: 200, y: 220, time: 250 });
    touch(photo, "pointerup", { x: 100, y: 240, time: 300 });

    expect(onIndexChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(zoomed(photo)).toBe("true");
  });

  it("closes on a pull down past the threshold", () => {
    const { lightbox, onOpenChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    touch(photo, "pointerdown", { x: 200, y: 100, time: 0 });
    touch(photo, "pointermove", { x: 200, y: 140, time: 60 });
    touch(photo, "pointermove", { x: 200, y: 260, time: 200 });
    touch(photo, "pointerup", { x: 200, y: 260, time: 220 });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps its pointer to itself, away from the dialog it is mounted in", () => {
    // The site mounts the lightbox inside the animal dialog, whose body reads
    // the same pointer for its own pull-to-close. Portal or not, React bubbles
    // the events up the component tree, so a wrapper here stands in for that
    // body: a pull past the dialog's own 140px must not reach it.
    const seen = vi.fn();
    render(
      <I18nProvider locale="sl">
        <LazyMotion features={domAnimation}>
          <div
            onPointerDown={seen}
            onPointerMove={seen}
            onPointerUp={seen}
            onPointerCancel={seen}
          >
            <PhotoLightbox
              open
              onOpenChange={vi.fn()}
              images={photos(6)}
              index={0}
              onIndexChange={vi.fn()}
              title="Pika"
            />
          </div>
        </LazyMotion>
      </I18nProvider>,
    );
    const photo = slot(screen.getByRole("dialog"), "photo-lightbox-photo");

    touch(photo, "pointerdown", { x: 100, y: 200, time: 0 });
    touch(photo, "pointermove", { x: 100, y: 300, time: 60 });
    touch(photo, "pointermove", { x: 100, y: 400, time: 120 });
    touch(photo, "pointerup", { x: 100, y: 400, time: 180 });

    expect(seen).not.toHaveBeenCalled();
  });

  it("puts a short slow pull back rather than closing or stepping", () => {
    const { lightbox, onOpenChange, onIndexChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    touch(photo, "pointerdown", { x: 200, y: 100, time: 0 });
    touch(photo, "pointermove", { x: 200, y: 140, time: 100 });
    touch(photo, "pointerup", { x: 200, y: 140, time: 300 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("still steps the photo on a sideways swipe", () => {
    const { lightbox, onIndexChange } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    touch(photo, "pointerdown", { x: 300, y: 200, time: 0 });
    touch(photo, "pointermove", { x: 250, y: 204, time: 50 });
    touch(photo, "pointerup", { x: 200, y: 204, time: 100 });

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("toggles the zoom on a double tap and back off on the next one", () => {
    const { lightbox } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    tap(photo, { x: 200, y: 200, time: 0 });
    expect(zoomed(photo)).toBe("false");
    tap(photo, { x: 202, y: 201, time: 100 });
    expect(zoomed(photo)).toBe("true");

    // Zoomed in, a finger that stays put is still a tap: the pan it starts is
    // what the release falls back from, or there would be no way out.
    tap(photo, { x: 202, y: 201, time: 400 });
    tap(photo, { x: 200, y: 200, time: 500 });

    expect(zoomed(photo)).toBe("false");
  });

  it("drops the zoom for good on a step away and back", () => {
    // The photo went back to its normal size on the step, so a zoom that came
    // back with the picture would say zoomed over a photograph at rest: the
    // pan would have the finger, and the swipe, the pull and the double tap
    // would all be dead.
    const { lightbox, onOpenChange, show } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    tap(photo, { x: 200, y: 200, time: 0 });
    tap(photo, { x: 202, y: 201, time: 100 });
    expect(zoomed(photo)).toBe("true");

    fireEvent.keyDown(lightbox, { key: "ArrowRight" });
    show(1);
    fireEvent.keyDown(lightbox, { key: "ArrowLeft" });
    show(0);

    const back = slot(lightbox, "photo-lightbox-photo");
    expect(zoomed(back)).toBe("false");

    // And the gestures the zoom turns off are the photo's again.
    touch(back, "pointerdown", { x: 200, y: 100, time: 400 });
    touch(back, "pointermove", { x: 200, y: 140, time: 460 });
    touch(back, "pointermove", { x: 200, y: 260, time: 600 });
    touch(back, "pointerup", { x: 200, y: 260, time: 620 });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("puts the pull back before a second finger turns it into a pinch", async () => {
    // The pull had the photo down the screen on a faded scrim, and the pinch
    // is seeded from wherever the photo is. Left there, a pinch that commits
    // keeps the fade with nothing pulling it.
    const { lightbox } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    touch(photo, "pointerdown", { x: 200, y: 100, pointerId: 1, time: 0 });
    touch(photo, "pointermove", { x: 200, y: 140, pointerId: 1, time: 60 });
    touch(photo, "pointermove", { x: 200, y: 300, pointerId: 1, time: 200 });
    await frame();
    expect(scrim().style.opacity).not.toBe("1");

    touch(photo, "pointerdown", { x: 100, y: 300, pointerId: 2, time: 240 });
    touch(photo, "pointermove", { x: 50, y: 300, pointerId: 1, time: 300 });
    touch(photo, "pointermove", { x: 450, y: 300, pointerId: 2, time: 320 });
    touch(photo, "pointerup", { x: 450, y: 300, pointerId: 2, time: 360 });
    touch(photo, "pointerup", { x: 50, y: 300, pointerId: 1, time: 380 });
    await frame();

    expect(zoomed(photo)).toBe("true");
    expect(scrim().style.opacity).toBe("1");
  });

  it("leaves the first tap behind when the photo changes under it", () => {
    // Two taps in the window and in the same place, one on each of two
    // photographs, are not a double tap on either of them.
    const { lightbox, show } = open();

    tap(slot(lightbox, "photo-lightbox-photo"), { x: 200, y: 200, time: 0 });
    show(1);
    tap(slot(lightbox, "photo-lightbox-photo"), { x: 200, y: 200, time: 100 });

    expect(zoomed(slot(lightbox, "photo-lightbox-photo"))).toBe("false");
  });

  it("keeps the zoomed photograph inside a window that changed shape", async () => {
    const { lightbox } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");
    sizePhoto(photo, 400, 300);

    // Four times the size, where the photograph overflows its box by 600
    // either side and 450 above and below.
    pinch(photo);
    touch(photo, "pointerup", { x: 450, y: 300, pointerId: 2, time: 100 });
    touch(photo, "pointerup", { x: 50, y: 300, pointerId: 1, time: 120 });
    expect(zoomed(photo)).toBe("true");

    // A pan into the corner, which stops at those limits.
    touch(photo, "pointerdown", { x: 200, y: 150, time: 200 });
    touch(photo, "pointermove", { x: 1400, y: 1150, time: 260 });
    touch(photo, "pointerup", { x: 1400, y: 1150, time: 280 });
    await frame();
    expect(pose(photo)).toContain("translateX(600px)");
    expect(pose(photo)).toContain("translateY(450px)");

    // The phone turns: a narrower, taller box, with less room to travel in.
    sizePhoto(photo, 300, 400);
    fireEvent(window, new Event("resize"));
    await frame();

    expect(pose(photo)).toContain("translateX(450px)");
    expect(pose(photo)).toContain("translateY(250px)");
  });

  it("measures the pinch again when a third finger leaves it another pair", () => {
    const { lightbox } = open();
    const photo = slot(lightbox, "photo-lightbox-photo");

    // Two fingers, four hundred pixels apart, at four times the size.
    pinch(photo);
    // A third finger lands and one of the pinching pair lifts, so the two on
    // the glass are a hundred apart rather than four hundred.
    touch(photo, "pointerdown", { x: 550, y: 300, pointerId: 3, time: 100 });
    touch(photo, "pointerup", { x: 50, y: 300, pointerId: 1, time: 120 });
    touch(photo, "pointermove", { x: 540, y: 300, pointerId: 3, time: 160 });
    touch(photo, "pointerup", { x: 540, y: 300, pointerId: 3, time: 200 });
    touch(photo, "pointerup", { x: 450, y: 300, pointerId: 2, time: 220 });

    // Read against the pair that has gone, those ten pixels are the photo
    // falling back to its normal size and the zoom being dropped.
    expect(zoomed(photo)).toBe("true");
  });
});

// A photo that never arrives takes itself out of its box, which everywhere
// else leaves the box's own ground showing. Here the photograph is the whole
// view, so what is left is the scrim, and the failure has to be said.
//
// The lightbox stays mounted and is handed one photo after another, so the
// failure is held by source: one that did not arrive must not answer for the
// next one, and stepping back to it must not have forgotten.
describe("PhotoLightbox missing photo", () => {
  it("says so when the photo on show never arrives", () => {
    const { lightbox } = open();

    fireEvent.error(photoImage(lightbox));

    expect(unavailable(lightbox)?.textContent).toBe(
      "Fotografije ni mogoče prikazati.",
    );
  });

  it("draws the next photo rather than the failure before it", () => {
    const { lightbox, show } = open();
    fireEvent.error(photoImage(lightbox));

    show(1);

    const next = photoImage(lightbox);
    expect(next.getAttribute("src")).toBe("/media/animals/pika-2.webp");
    expect(next.hidden).toBe(false);
    expect(next.dataset.broken).toBeUndefined();
    expect(unavailable(lightbox)).toBeNull();
  });

  it("says it again on the way back to the photo that failed", () => {
    const { lightbox, show } = open();
    fireEvent.error(photoImage(lightbox));

    show(1);
    show(0);

    expect(unavailable(lightbox)).not.toBeNull();
  });

  it("leaves the contact sheet's tiles to their own ground", () => {
    // Six boxes, five of them healthy: a line over the grid would name none of
    // them. The tile keeps the behaviour every other surface has.
    const { lightbox } = open({ initialView: "sheet" });
    const tile = within(lightbox).getAllByRole("button", {
      name: /Pokaži fotografijo/,
    })[0];
    const img = tile?.querySelector("img");
    if (!img) throw new Error("no tile drawn");

    fireEvent.error(img);

    expect(img.hidden).toBe(true);
    expect(unavailable(lightbox)).toBeNull();
  });
});

// Where focus goes on the way out. The index is shared with the fan behind, so
// stepping in here walks the fan too, and the print the lightbox was opened
// from can leave the fan's five-print window while it is open: focus handed
// back to it would land on a detached element, in silence, with the page's own
// keys dead.
describe("PhotoLightbox focus on the way out", () => {
  function opened(returnFocusFallback?: () => HTMLElement | null | undefined) {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    const images = photos(6);
    function tree(open: boolean) {
      return (
        <I18nProvider locale="sl">
          <LazyMotion features={domAnimation}>
            <PhotoLightbox
              open={open}
              onOpenChange={vi.fn()}
              images={images}
              index={0}
              onIndexChange={vi.fn()}
              title="Pika"
              returnFocusFallback={returnFocusFallback}
            />
          </LazyMotion>
        </I18nProvider>
      );
    }
    const { rerender } = render(tree(true));

    return {
      trigger,
      // Radix hands focus back a tick after the content leaves, around a React
      // bug it still guards against. The render that takes the content away
      // has to commit first, in its own act: nested inside one that is still
      // awaiting, the unmount waits for the outer act to settle and the timer
      // it schedules has not even been set when the await is over.
      async close() {
        rerender(tree(false));
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      },
    };
  }

  it("hands focus to the fallback when the print it came from is gone", async () => {
    const fallback = document.createElement("button");
    document.body.append(fallback);
    const { trigger, close } = opened(() => fallback);
    trigger.remove();

    await close();

    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it("hands focus back to the print while it is still in the document", async () => {
    const fallback = document.createElement("button");
    document.body.append(fallback);
    const { trigger, close } = opened(() => fallback);

    await close();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    fallback.remove();
  });

  it("leaves the default alone when there is nothing to go back to", async () => {
    const { trigger, close } = opened();
    trigger.remove();

    await close();

    // Nothing was prevented, so Radix's own answer stands: it focuses the
    // element it saved, which is no longer in the document, and the body keeps
    // focus. The point is that the way out does not throw.
    expect(document.activeElement).toBe(document.body);
  });
});
