// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PORTAL_DRAFT_PREFIX,
  clearAccountDrafts,
  clearDraft,
  draftIds,
  draftKey,
  readDraft,
  subscribeDrafts,
  writeDraft,
} from "./portal-drafts";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("draftKey", () => {
  it("keeps triples distinct when a slash moves between the shelter and the id", () => {
    const first = draftKey("a", "b/c", "d");
    const second = draftKey("a", "b", "c/d");
    expect(first).not.toBe(second);
  });

  it("keeps triples distinct when a colon sits inside a part", () => {
    const first = draftKey("a", "b:c", "d");
    const second = draftKey("a", "b", "c:d");
    expect(first).not.toBe(second);
  });

  it("always starts with the public prefix", () => {
    expect(draftKey("acc", "shelter", "id").startsWith(PORTAL_DRAFT_PREFIX)).toBe(
      true,
    );
  });
});

describe("readDraft and writeDraft", () => {
  it("round-trips an object draft", () => {
    const draft = { name: "Rex", age: 3, tags: ["pes", "odrasel"] };
    writeDraft("bruno@example.com", "ljubljana", "42", draft);
    expect(readDraft("bruno@example.com", "ljubljana", "42")).toEqual(draft);
  });

  it("returns null for a key that was never written", () => {
    expect(readDraft("bruno@example.com", "ljubljana", "missing")).toBeNull();
  });

  it("returns null when the stored value is not valid JSON", () => {
    window.sessionStorage.setItem(
      draftKey("bruno@example.com", "ljubljana", "42"),
      "not json {{{",
    );
    expect(readDraft("bruno@example.com", "ljubljana", "42")).toBeNull();
  });

  it("does not throw when setItem throws, and leaves readDraft at null afterwards", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() =>
      writeDraft("bruno@example.com", "ljubljana", "42", { a: 1 }),
    ).not.toThrow();
    vi.restoreAllMocks();
    expect(readDraft("bruno@example.com", "ljubljana", "42")).toBeNull();
  });

  it("returns null when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readDraft("bruno@example.com", "ljubljana", "42")).toBeNull();
  });
});

describe("clearDraft", () => {
  it("removes exactly the one key it is given", () => {
    writeDraft("bruno@example.com", "ljubljana", "42", { a: 1 });
    writeDraft("bruno@example.com", "ljubljana", "43", { a: 2 });

    clearDraft("bruno@example.com", "ljubljana", "42");

    expect(readDraft("bruno@example.com", "ljubljana", "42")).toBeNull();
    expect(readDraft("bruno@example.com", "ljubljana", "43")).toEqual({
      a: 2,
    });
  });
});

describe("draftIds", () => {
  it("lists only the ids of the given account and shelter", () => {
    writeDraft("bruno@example.com", "ljubljana", "1", { a: 1 });
    writeDraft("bruno@example.com", "ljubljana", "2", { a: 2 });
    writeDraft("bruno@example.com", "maribor", "3", { a: 3 });
    writeDraft("someone-else@example.com", "ljubljana", "4", { a: 4 });
    window.sessionStorage.setItem("unrelated.key", "1");
    window.sessionStorage.setItem("other.prefix:x", "1");

    expect(draftIds("bruno@example.com", "ljubljana")).toEqual(
      new Set(["1", "2"]),
    );
  });

  it("returns an empty set when there are no matching drafts", () => {
    expect(draftIds("bruno@example.com", "ljubljana")).toEqual(new Set());
  });

  it("returns an empty set when getItem-adjacent storage access throws", () => {
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(draftIds("bruno@example.com", "ljubljana")).toEqual(new Set());
  });
});

describe("clearAccountDrafts", () => {
  it("removes every draft of the account across shelters, and leaves other accounts alone", () => {
    writeDraft("bruno@example.com", "ljubljana", "1", { a: 1 });
    writeDraft("bruno@example.com", "maribor", "2", { a: 2 });
    writeDraft("someone-else@example.com", "ljubljana", "3", { a: 3 });

    clearAccountDrafts("bruno@example.com");

    expect(readDraft("bruno@example.com", "ljubljana", "1")).toBeNull();
    expect(readDraft("bruno@example.com", "maribor", "2")).toBeNull();
    expect(readDraft("someone-else@example.com", "ljubljana", "3")).toEqual({
      a: 3,
    });
  });
});

describe("subscribeDrafts", () => {
  it("fires on write, clear and clearAccountDrafts, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDrafts(listener);

    writeDraft("bruno@example.com", "ljubljana", "1", { a: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    clearDraft("bruno@example.com", "ljubljana", "1");
    expect(listener).toHaveBeenCalledTimes(2);

    clearAccountDrafts("bruno@example.com");
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    writeDraft("bruno@example.com", "ljubljana", "1", { a: 1 });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("notifies on a storage event with our prefix, but not on one with an unrelated key", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDrafts(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: `${PORTAL_DRAFT_PREFIX}a/b/c`,
        newValue: "1",
      }),
    );
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "unrelated.key", newValue: "1" }),
    );
    expect(listener).toHaveBeenCalledTimes(1);

    // A null key is what a browser sends when a tab clears storage wholesale,
    // so it must notify too even though it does not start with the prefix.
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
