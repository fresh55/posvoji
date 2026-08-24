// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { commitLocation, mergeOwnedParams } from "./location-search";

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
