// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { PHOTO_MORPH_MARK } from "@/lib/photo-morph";
import {
  morphInProgress,
  morphPhoto,
  PHOTO_TRANSITION_NAME,
} from "@/lib/view-transition";
import { stubViewTransition } from "@/test/view-transition";

// The contract around one name and one mark, which is the whole of what this
// module owns. Getting it wrong is silent: a name left on an element makes the
// browser skip the next morph, and a mark left on <html> leaves the stylesheet
// scoping a transition that is over.

function box() {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function named(element: HTMLElement) {
  return element.style.getPropertyValue("view-transition-name");
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  document.documentElement.removeAttribute(PHOTO_MORPH_MARK);
  document.body.replaceChildren();
});

describe("morphPhoto", () => {
  it("hands the name over inside the update on the way in", () => {
    const photo = box();
    const inside: string[] = [];
    const started = stubViewTransition(() => named(photo));

    morphPhoto({
      photo,
      direction: "open",
      update: () => inside.push(named(photo)),
    });

    // Named for the old state, which is the box the photograph leaves from.
    expect(started[0].before).toBe(PHOTO_TRANSITION_NAME);
    // And off before the update runs, not after it: the update is where the
    // dialog's own front print mounts wearing the same name, and two elements
    // wearing it at once is a morph the browser skips.
    expect(inside).toEqual([""]);
    expect(started[0].after).toBe("");
    expect(started[0].mark).toBe("open");
  });

  it("names the box the photograph lands in before the update runs", () => {
    const photo = box();
    const inside: string[] = [];
    const started = stubViewTransition(() => named(photo));

    morphPhoto({
      photo,
      direction: "close",
      update: () => inside.push(named(photo)),
    });

    expect(started[0].before).toBe("");
    expect(inside).toEqual([PHOTO_TRANSITION_NAME]);
    expect(started[0].after).toBe(PHOTO_TRANSITION_NAME);
    expect(started[0].mark).toBe("close");
  });

  it("clears the name and the mark when the morph is over", async () => {
    const photo = box();
    const started = stubViewTransition(() => named(photo));

    morphPhoto({ photo, direction: "close", update: () => undefined });
    started[0].settle();
    await Promise.resolve();

    expect(named(photo)).toBe("");
    expect(morphInProgress()).toBeNull();
  });

  it("clears them when the browser skips the morph", async () => {
    const photo = box();
    const started = stubViewTransition(() => named(photo));

    morphPhoto({ photo, direction: "close", update: () => undefined });
    started[0].skip();
    await Promise.resolve();
    await Promise.resolve();

    expect(named(photo)).toBe("");
    expect(morphInProgress()).toBeNull();
  });

  // A morph runs for a third of a second over a live page: its
  // pseudo-elements take no presses, so a gesture in that window is an
  // ordinary gesture and starts a second morph. Here it is an Escape during
  // the open, which sends the photograph straight back to the card it had just
  // left. The browser rejects the first transition, and that rejection used to
  // run the first morph's cleanup over the second morph's state: the name came
  // off the box the photograph was travelling back to and the mark came off
  // the document, so the morph on screen finished unscoped.
  it("leaves the morph now running alone when the one it took over ends", async () => {
    const card = box();
    const started = stubViewTransition(() => named(card));

    morphPhoto({ photo: card, direction: "open", update: () => undefined });
    morphPhoto({ photo: card, direction: "close", update: () => undefined });

    started[0].skip();
    await Promise.resolve();
    await Promise.resolve();

    expect(morphInProgress()).toBe("close");
    expect(named(card)).toBe(PHOTO_TRANSITION_NAME);

    // And the one that is running still cleans up after itself.
    started[1].settle();
    await Promise.resolve();
    expect(morphInProgress()).toBeNull();
    expect(named(card)).toBe("");
  });

  // The same overlap with the card that is clicked during a close, which is
  // the one that leaked: the close puts the name on the card inside its own
  // update and nothing but its cleanup ever takes it off, and that cleanup is
  // what the guard above stops from running. The name stayed on that card for
  // the life of the page, which makes every later morph a transition the
  // browser skips and lifts the card out of the next navigation's snapshot.
  it("takes the name off the box the morph it took over from had named", async () => {
    const card = box();
    const other = box();
    const started = stubViewTransition(() => named(card));

    morphPhoto({ photo: card, direction: "close", update: () => undefined });
    expect(named(card)).toBe(PHOTO_TRANSITION_NAME);

    // Another card, pressed while the photograph is still on its way back.
    morphPhoto({
      photo: other,
      direction: "open",
      update: () => undefined,
    });

    expect(named(card)).toBe("");
    started[0].skip();
    await Promise.resolve();
    await Promise.resolve();
    expect(named(card)).toBe("");
    expect(morphInProgress()).toBe("open");
  });

  // A transition that was never started has no `finished` to subscribe to, so
  // nothing would ever take the mark off: the dialog would never zoom again
  // and the print would keep its name across navigations.
  it("leaves nothing behind when the transition cannot be started", () => {
    const photo = box();
    document.startViewTransition = (() => {
      throw new Error("no transition here");
    }) as typeof document.startViewTransition;

    expect(() =>
      morphPhoto({
        photo,
        direction: "open",
        update: () => undefined,
      }),
    ).toThrow("no transition here");

    expect(morphInProgress()).toBeNull();
    expect(named(photo)).toBe("");
  });

  // A real browser calls the update on its own, so a throw from inside it
  // rejects `finished` and the cleanup runs from there. Here the stub runs it
  // in place, which is the other half of the same guard.
  it("leaves nothing behind when the update throws", () => {
    const photo = box();
    stubViewTransition(() => named(photo));

    expect(() =>
      morphPhoto({
        photo,
        direction: "open",
        update: () => {
          throw new Error("the render threw");
        },
      }),
    ).toThrow("the render threw");

    expect(morphInProgress()).toBeNull();
    expect(named(photo)).toBe("");
  });
});

describe("morphInProgress", () => {
  it("says nothing while nothing is running", () => {
    expect(morphInProgress()).toBeNull();
  });

  it("says which way the photograph is going, for as long as it is going", () => {
    const photo = box();
    const seen: (string | null)[] = [];
    stubViewTransition(() => named(photo));

    morphPhoto({
      photo,
      direction: "open",
      // Everything the dialog mounts is mounted by this render, and this is
      // the question it asks: the card under the photographs fades in behind
      // the photograph rather than standing there waiting for it.
      update: () => seen.push(morphInProgress()),
    });

    expect(seen).toEqual(["open"]);
  });
});
