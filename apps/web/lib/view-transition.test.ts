// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  morphInProgress,
  morphPhoto,
  PHOTO_TRANSITION_NAME,
} from "@/lib/view-transition";

// The contract around one name and one mark, which is the whole of what this
// module owns. Getting it wrong is silent: a name left on an element makes the
// browser skip the next morph, and a mark left on <html> leaves the stylesheet
// scoping a transition that is over.

const MARK = "data-photo-morph";

type Started = {
  /** The name on the box this morph carries, as the old state was captured. */
  before: string;
  /** And as the new one is: the browser takes it the moment the update
   *  returns. */
  after: string;
  /** The mark the stylesheet reads, while the update ran. */
  mark: string | null;
  /** The transition ending well, and the browser taking it away. */
  settle: () => void;
  skip: () => void;
};

function box() {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function named(element: HTMLElement) {
  return element.style.getPropertyValue("view-transition-name");
}

/** Every transition this module starts, run in place rather than on the
 *  browser's own schedule: what is under test is the order of what happens
 *  around the update and who is allowed to clean up afterwards, not when the
 *  browser gets round to any of it. */
function stubTransitions(read: () => string): Started[] {
  const started: Started[] = [];
  document.startViewTransition = ((update: () => void) => {
    let settle = () => undefined as void;
    let skip = () => undefined as void;
    const finished = new Promise<void>((resolve, reject) => {
      settle = () => resolve();
      skip = () => reject(new Error("the browser skipped it"));
    });
    const before = read();
    update();
    started.push({
      before,
      after: read(),
      mark: document.documentElement.getAttribute(MARK),
      settle,
      skip,
    });
    return {
      finished,
      ready: finished,
      updateCallbackDone: finished,
    };
  }) as typeof document.startViewTransition;
  return started;
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  document.documentElement.removeAttribute(MARK);
  document.body.replaceChildren();
});

describe("morphPhoto", () => {
  it("hands the name over inside the update on the way in", () => {
    const photo = box();
    const inside: string[] = [];
    const started = stubTransitions(() => named(photo));

    morphPhoto({
      photo,
      at: "old",
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
    const started = stubTransitions(() => named(photo));

    morphPhoto({
      photo,
      at: "new",
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
    const started = stubTransitions(() => named(photo));

    morphPhoto({ photo, at: "new", direction: "close", update: () => undefined });
    started[0].settle();
    await Promise.resolve();

    expect(named(photo)).toBe("");
    expect(morphInProgress()).toBeNull();
  });

  it("clears them when the browser skips the morph", async () => {
    const photo = box();
    const started = stubTransitions(() => named(photo));

    morphPhoto({ photo, at: "new", direction: "close", update: () => undefined });
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
    const started = stubTransitions(() => named(card));

    morphPhoto({ photo: card, at: "old", direction: "open", update: () => undefined });
    morphPhoto({ photo: card, at: "new", direction: "close", update: () => undefined });

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
});

describe("morphInProgress", () => {
  it("says nothing while nothing is running", () => {
    expect(morphInProgress()).toBeNull();
  });

  it("says which way the photograph is going, for as long as it is going", () => {
    const photo = box();
    const seen: (string | null)[] = [];
    stubTransitions(() => named(photo));

    morphPhoto({
      photo,
      at: "old",
      direction: "open",
      // Everything the dialog mounts is mounted by this render, and this is
      // the question it asks: the fan holds its side prints back for the
      // photograph, and the card fades in behind it.
      update: () => seen.push(morphInProgress()),
    });

    expect(seen).toEqual(["open"]);
  });
});
