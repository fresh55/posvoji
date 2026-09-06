// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PORTAL_DRAFT_PREFIX,
  clearAccountDrafts,
  clearDraft,
  draftDiff,
  draftIds,
  draftKey,
  draftValueDiffers,
  keepKnownDraftKeys,
  readDraft,
  resumeDraft,
  subscribeDrafts,
  writeDraft,
} from "./portal-drafts";

type Draft = {
  name: string;
  breed: string;
  sex: "male" | "female" | null;
};

const BASE: Draft = { name: "Rex", breed: "labradorec", sex: null };

/** Keeps a string name, a string breed and a known sex; drops the rest. */
function sanitizeStrict(stored: unknown, base: Draft): Partial<Draft> {
  const kept: Partial<Draft> = {};
  if (typeof stored !== "object" || stored === null) return kept;
  const value = stored as Record<string, unknown>;
  if (typeof value.name === "string") kept.name = value.name;
  if (typeof value.breed === "string") kept.breed = value.breed;
  if (value.sex === "male" || value.sex === "female" || value.sex === null) {
    kept.sex = value.sex;
  }
  void base;
  return kept;
}

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

describe("draftValueDiffers", () => {
  it("compares text trimmed on both sides", () => {
    expect(draftValueDiffers("Rex ", "Rex")).toBe(false);
    expect(draftValueDiffers("Rex", "\tRex\n")).toBe(false);
    expect(draftValueDiffers("Rex", "Max")).toBe(true);
  });

  it("compares everything else by identity", () => {
    expect(draftValueDiffers(null, null)).toBe(false);
    expect(draftValueDiffers(null, "male")).toBe(true);
    expect(draftValueDiffers("male", null)).toBe(true);
    expect(draftValueDiffers(NaN, NaN)).toBe(false);
    expect(draftValueDiffers(0, -0)).toBe(true);
  });
});

describe("draftDiff", () => {
  it("holds only the keys that differ from the base", () => {
    expect(draftDiff({ ...BASE, name: "Max" }, BASE)).toEqual({ name: "Max" });
    expect(draftDiff({ ...BASE, sex: "male" }, BASE)).toEqual({ sex: "male" });
  });

  it("is empty when the draft is the base", () => {
    expect(draftDiff({ ...BASE }, BASE)).toEqual({});
  });

  it("is empty when only whitespace differs", () => {
    expect(draftDiff({ ...BASE, name: " Rex " }, BASE)).toEqual({});
    expect(draftDiff(BASE, { ...BASE, breed: "labradorec  " })).toEqual({});
  });

  it("keeps the draft's own value, untrimmed", () => {
    expect(draftDiff({ ...BASE, name: " Max " }, BASE)).toEqual({
      name: " Max ",
    });
  });
});

describe("keepKnownDraftKeys", () => {
  it("returns nothing for a value that is not a plain object", () => {
    expect(keepKnownDraftKeys(1, BASE)).toEqual({});
    expect(keepKnownDraftKeys("abc", BASE)).toEqual({});
    expect(keepKnownDraftKeys([1], BASE)).toEqual({});
    expect(keepKnownDraftKeys(null, BASE)).toEqual({});
    expect(keepKnownDraftKeys(undefined, BASE)).toEqual({});
  });

  it("drops keys the base does not have", () => {
    expect(keepKnownDraftKeys({ name: "Max", colour: "black" }, BASE)).toEqual({
      name: "Max",
    });
  });

  it("drops anything but text where the base holds text", () => {
    expect(
      keepKnownDraftKeys({ name: null, breed: 1, sex: "male" }, BASE),
    ).toEqual({ sex: "male" });
  });

  it("keeps a key the base holds as null whatever it holds", () => {
    expect(keepKnownDraftKeys({ sex: "female" }, BASE)).toEqual({
      sex: "female",
    });
    expect(keepKnownDraftKeys({ sex: null }, BASE)).toEqual({ sex: null });
  });
});

describe("resumeDraft", () => {
  it("returns the sanitized keys that differ from the base", () => {
    expect(
      resumeDraft({ name: "Max", breed: "labradorec" }, BASE, sanitizeStrict),
    ).toEqual({ name: "Max" });
  });

  it("is empty for a value that changes nothing", () => {
    expect(resumeDraft({ ...BASE }, BASE, sanitizeStrict)).toEqual({});
    expect(resumeDraft({ name: "Rex " }, BASE, sanitizeStrict)).toEqual({});
  });

  it("is empty for a non-object value and for one of wrongly typed keys", () => {
    for (const stored of [1, "abc", [1], true, { name: null }, { name: 1 }]) {
      expect(resumeDraft(stored, BASE, sanitizeStrict)).toEqual({});
    }
  });

  it("keeps the good keys of a value that also has bad ones", () => {
    expect(resumeDraft({ name: null, sex: "male" }, BASE, sanitizeStrict)).toEqual(
      { sex: "male" },
    );
  });

  it("drops keys the sanitizer lets through that the base does not have", () => {
    expect(
      resumeDraft({ colour: "black" }, BASE, (stored) => stored as Partial<Draft>),
    ).toEqual({});
  });

  it("does not throw when the sanitizer throws or returns garbage", () => {
    expect(
      resumeDraft({ name: "Max" }, BASE, () => {
        throw new Error("bad");
      }),
    ).toEqual({});
    expect(
      resumeDraft({ name: "Max" }, BASE, () => null as unknown as Partial<Draft>),
    ).toEqual({});
    expect(
      resumeDraft({ name: "Max" }, BASE, () => 1 as unknown as Partial<Draft>),
    ).toEqual({});
  });

  it("lays every field of a whole draft over the base, as keys written before the diff hold one", () => {
    const legacy: Draft = { name: "Max", breed: "pudelj", sex: "male" };
    expect(resumeDraft(legacy, BASE, sanitizeStrict)).toEqual(legacy);
  });
});
