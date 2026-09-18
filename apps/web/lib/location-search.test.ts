// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  commitLocation,
  mergeOwnedParams,
  subscribeToLocation,
  wrapNextPop,
} from "./location-search";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("mergeOwnedParams", () => {
  it("returns just the owned query when nothing foreign is in the URL", () => {
    expect(mergeOwnedParams("", ["spol"], "spol=samica")).toBe(
      "spol=samica",
    );
  });

  it("drops an owned query entirely when the write clears every owned param", () => {
    expect(mergeOwnedParams("?spol=samica", ["spol"], "")).toBe("");
  });

  it("keeps a foreign param a filter write does not know about", () => {
    expect(
      mergeOwnedParams("?najdena=1", ["spol"], "spol=samica"),
    ).toBe("najdena=1&spol=samica");
  });

  it("keeps a foreign param exactly as written, byte for byte, including its own encoding", () => {
    // A literal comma here would be indistinguishable from this codec's
    // multi-value join, so the point of this test is that mergeOwnedParams
    // never re-encodes or re-parses what it doesn't own.
    expect(
      mergeOwnedParams("?najdena=Ljubljana%2CSlovenija", ["spol"], ""),
    ).toBe("najdena=Ljubljana%2CSlovenija");
  });

  it("replaces only the params it's told it owns, leaving the rest of the query untouched", () => {
    expect(
      mergeOwnedParams(
        "?spol=samec&najdena=1&starost=odrasel",
        ["spol", "starost"],
        "spol=samica",
      ),
    ).toBe("najdena=1&spol=samica");
  });

  it("survives a foreign param whose name is not decodable", () => {
    // A browser will sit on ?100%=x quite happily. decodeURIComponent will not:
    // it threw, and the throw came out of the next filter write rather than out
    // of the link, so the first press of any filter took the page down.
    expect(mergeOwnedParams("?100%=x&spol=samec", ["spol"], "spol=samica")).toBe(
      "100%=x&spol=samica",
    );
    expect(mergeOwnedParams("?%zz=1", ["spol"], "")).toBe("%zz=1");
  });
});

describe("commitLocation", () => {
  it("preserves history.state across a replace write", () => {
    history.pushState({ animal: true }, "", "/pes/rex");

    commitLocation("/pes/rex", "spol=samica", "replace");

    expect(window.history.state).toEqual({ animal: true });
    expect(window.location.search).toBe("?spol=samica");
  });

  it("still lets an explicit state override the write", () => {
    history.pushState({ animal: true }, "", "/pes/rex");

    commitLocation("/pes/rex", "spol=samica", "replace", { animal: false });

    expect(window.history.state).toEqual({ animal: false });
  });
});

describe("wrapNextPop", () => {
  // The dialog arms the pop it is about to ask for, so that the photograph can
  // be carried back into its card instead of the box simply going out. Every
  // subscriber has to have rendered before the browser takes its new snapshot,
  // which is why what is wrapped is the whole notification rather than one
  // subscriber of it.
  function stub() {
    const wrapped: number[] = [];
    let heard = 0;
    const unsubscribe = subscribeToLocation(() => {
      heard += 1;
    });
    return {
      wrapped,
      heard: () => heard,
      /** What the dialog hands over: something that runs the notification. */
      wrap: (notify: () => void) => {
        notify();
        wrapped.push(heard);
      },
      pop: () => window.dispatchEvent(new PopStateEvent("popstate")),
      unsubscribe,
    };
  }

  it("wraps the next pop, and only the next one", () => {
    const { wrapped, heard, wrap, pop, unsubscribe } = stub();

    wrapNextPop(wrap);
    pop();
    expect(heard()).toBe(1);
    // Told inside the wrapper, not beside it.
    expect(wrapped).toEqual([1]);

    // A back press the dialog did not arm is a plain notification.
    pop();
    expect(heard()).toBe(2);
    expect(wrapped).toEqual([1]);

    unsubscribe();
  });

  it("drops the arming when the address moves without a pop", () => {
    const { wrapped, heard, wrap, pop, unsubscribe } = stub();

    // Closing takes this branch when the dialog stands on an entry nothing
    // pushed: there is no pop coming, and the arming must not sit and wait
    // for whatever back press comes next.
    wrapNextPop(wrap);
    commitLocation("/", "", "replace");
    pop();

    expect(wrapped).toEqual([]);
    expect(heard()).toBe(2);
    unsubscribe();
  });
});
