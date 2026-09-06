// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePortalDraft,
  usePortalDraftMirror,
} from "@/hooks/use-portal-draft";
import { draftKey, readDraft } from "@/lib/portal-drafts";

type Draft = {
  name: string;
  breed: string;
  sex: "male" | "female" | null;
};

const ACCOUNT = "info@zavetisce.si";
const SHELTER = "johanca";
const ID = "johanca:7";
const KEY = draftKey(ACCOUNT, SHELTER, ID);
const RECORD: Draft = { name: "Rex", breed: "labradorec", sex: null };

/** Keeps a string name, a string breed and a known sex; drops the rest. */
function sanitize(stored: unknown): Partial<Draft> {
  const kept: Partial<Draft> = {};
  if (typeof stored !== "object" || stored === null) return kept;
  const value = stored as Record<string, unknown>;
  if (typeof value.name === "string") kept.name = value.name;
  if (typeof value.breed === "string") kept.breed = value.breed;
  if (value.sex === "male" || value.sex === "female" || value.sex === null) {
    kept.sex = value.sex;
  }
  return kept;
}

function seed(value: unknown): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(value));
}

function stored(): unknown {
  return readDraft<unknown>(ACCOUNT, SHELTER, ID);
}

/** Both hooks the way an editor page wires them. */
function useEditor(props: {
  record: Draft;
  unsaved?: boolean;
  diff?: boolean;
}) {
  const fromRecord = () => props.record;
  const state = usePortalDraft(ACCOUNT, SHELTER, ID, fromRecord, sanitize);
  usePortalDraftMirror(
    ACCOUNT,
    SHELTER,
    ID,
    state.draft,
    props.unsaved ?? true,
    props.diff === false ? undefined : fromRecord,
  );
  return state;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePortalDraft", () => {
  it("starts from the record when the tab holds nothing", () => {
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(result.current.draft).toEqual(RECORD);
    expect(result.current.resumed).toBe(false);
  });

  it("lays only the stored keys over a record that changed since", () => {
    seed({ name: "Max" });
    const changed: Draft = { ...RECORD, breed: "pudelj" };
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => changed, sanitize),
    );
    expect(result.current.draft).toEqual({ ...changed, name: "Max" });
    expect(result.current.resumed).toBe(true);
  });

  it("lays every differing field of a whole stored draft over the record", () => {
    // A key written before the diff holds the whole draft. It resumes as it
    // always did, breed included.
    seed({ name: "Max", breed: "mesanec", sex: null });
    const changed: Draft = { ...RECORD, breed: "pudelj" };
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => changed, sanitize),
    );
    expect(result.current.draft).toEqual({
      name: "Max",
      breed: "mesanec",
      sex: null,
    });
    expect(result.current.resumed).toBe(true);
  });

  it.each([1, "abc", [1], true, { name: null }, { name: 1 }, { breed: [] }])(
    "does not throw on a stored %j, resumes nothing and drops the key",
    (value) => {
      seed(value);
      const { result } = renderHook(() =>
        usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
      );
      expect(result.current.draft).toEqual(RECORD);
      expect(result.current.resumed).toBe(false);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    },
  );

  it("does not throw on malformed JSON and resumes nothing", () => {
    window.sessionStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(result.current.draft).toEqual(RECORD);
    expect(result.current.resumed).toBe(false);
  });

  it("keeps the good keys of a stored value that also has bad ones", () => {
    seed({ name: null, sex: "male" });
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(result.current.draft).toEqual({ ...RECORD, sex: "male" });
    expect(result.current.resumed).toBe(true);
  });

  it("does not report a resume for a stored draft that changes nothing", () => {
    seed({ ...RECORD });
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(result.current.draft).toEqual(RECORD);
    expect(result.current.resumed).toBe(false);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("does not report a resume for a stored value that differs only in whitespace", () => {
    seed({ name: " Rex " });
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(result.current.draft).toEqual(RECORD);
    expect(result.current.resumed).toBe(false);
  });

  it("leaves a key alone that it resumed from", () => {
    seed({ name: "Max" });
    renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(stored()).toEqual({ name: "Max" });
  });

  it("falls back to a sanitizer that drops non-objects and non-text in text keys", () => {
    seed({ name: null, breed: "pudelj", colour: "black" });
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD),
    );
    expect(result.current.draft).toEqual({ ...RECORD, breed: "pudelj" });
    expect(result.current.resumed).toBe(true);

    cleanup();
    window.sessionStorage.clear();
    seed("abc");
    const bare = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD),
    );
    expect(bare.result.current.draft).toEqual(RECORD);
    expect(bare.result.current.resumed).toBe(false);
  });

  it("resets to the record as it is now, not as it was on mount", () => {
    seed({ name: "Max" });
    const { result, rerender } = renderHook(
      ({ record }: { record: Draft }) =>
        usePortalDraft(ACCOUNT, SHELTER, ID, () => record, sanitize),
      { initialProps: { record: RECORD } },
    );
    expect(result.current.draft.name).toBe("Max");

    // A status save hands the form a new record while it is mounted.
    const later: Draft = { ...RECORD, sex: "female" };
    rerender({ record: later });
    act(() => result.current.reset());

    expect(result.current.draft).toEqual(later);
    expect(result.current.resumed).toBe(false);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("clear() removes the key and nothing else", () => {
    seed({ name: "Max" });
    const other = draftKey(ACCOUNT, SHELTER, "johanca:8");
    window.sessionStorage.setItem(other, JSON.stringify({ name: "Lu" }));
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    act(() => result.current.clear());
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(window.sessionStorage.getItem(other)).not.toBeNull();
  });

  it("survives storage that cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() =>
      usePortalDraft(ACCOUNT, SHELTER, ID, () => RECORD, sanitize),
    );
    expect(result.current.draft).toEqual(RECORD);
    expect(result.current.resumed).toBe(false);
  });
});

describe("usePortalDraftMirror", () => {
  it("stores only the keys that differ from the record", () => {
    const { result } = renderHook(useEditor, {
      initialProps: { record: RECORD },
    });
    act(() =>
      result.current.setDraft((current) => ({ ...current, name: "Max" })),
    );
    expect(stored()).toEqual({ name: "Max" });

    act(() =>
      result.current.setDraft((current) => ({ ...current, sex: "male" })),
    );
    expect(stored()).toEqual({ name: "Max", sex: "male" });
  });

  it("writes no key for a form whose text differs from the record only in whitespace", () => {
    const crawled: Draft = { ...RECORD, name: "Rex " };
    const { result } = renderHook(useEditor, {
      initialProps: { record: crawled, unsaved: true },
    });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    act(() =>
      result.current.setDraft((current) => ({ ...current, name: " Rex" })),
    );
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("drops the key once the form is back to what the record says", () => {
    const { result } = renderHook(useEditor, {
      initialProps: { record: RECORD },
    });
    act(() =>
      result.current.setDraft((current) => ({ ...current, name: "Max" })),
    );
    expect(stored()).toEqual({ name: "Max" });

    act(() =>
      result.current.setDraft((current) => ({ ...current, name: "Rex" })),
    );
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("drops the key when the editor says there is no work, whatever the draft holds", () => {
    seed({ name: "Max" });
    const { result } = renderHook(useEditor, {
      initialProps: { record: RECORD, unsaved: false },
    });
    expect(result.current.draft.name).toBe("Max");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("writes the whole draft when it is not given the record", () => {
    const { result } = renderHook(useEditor, {
      initialProps: { record: RECORD, diff: false },
    });
    act(() =>
      result.current.setDraft((current) => ({ ...current, name: "Max" })),
    );
    expect(stored()).toEqual({ ...RECORD, name: "Max" });
  });

  it("diffs against the record as it is now", () => {
    const { result, rerender } = renderHook(useEditor, {
      initialProps: { record: RECORD },
    });
    act(() =>
      result.current.setDraft((current) => ({ ...current, breed: "pudelj" })),
    );
    expect(stored()).toEqual({ breed: "pudelj" });

    // The record catches up with the draft and the shelter types on.
    rerender({ record: { ...RECORD, breed: "pudelj" } });
    act(() =>
      result.current.setDraft((current) => ({ ...current, name: "Max" })),
    );
    expect(stored()).toEqual({ name: "Max" });
  });

  it("swallows a storage that refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(useEditor, {
      initialProps: { record: RECORD },
    });
    expect(() =>
      act(() =>
        result.current.setDraft((current) => ({ ...current, name: "Max" })),
      ),
    ).not.toThrow();
    expect(result.current.draft.name).toBe("Max");
  });
});
