// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccountPhotoDrafts,
  clearPhotoDraft,
  movePhotoDraft,
  photoDraftIds,
  readPhotoDraft,
  updatePhotoDraft,
  type PhotoDraftScope,
} from "./portal-photo-drafts";

const scope: PhotoDraftScope = { account: "fixture-shelter", shelter: "fixture", id: "new" };
const other: PhotoDraftScope = { account: "second-fixture", shelter: "fixture", id: "new" };

function photo(key = 1) {
  return { key, file: new File(["photo"], "fixture.jpg", { type: "image/jpeg" }), previewUrl: `blob:fixture-${key}`, failed: false };
}

function leavingDocument() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => { URL.revokeObjectURL = vi.fn(); });
afterEach(() => {
  clearAccountPhotoDrafts(scope.account);
  clearAccountPhotoDrafts(other.account);
});

describe("tab-local pending photos", () => {
  it("warns on document navigation only while files remain", () => {
    expect(leavingDocument()).toBe(false);
    const file = photo();
    updatePhotoDraft(scope, () => [file]);
    expect(leavingDocument()).toBe(true);
    // A canceled browser leave has not changed the pending file.
    expect(readPhotoDraft(scope)).toEqual([file]);
    clearPhotoDraft(scope);
    expect(leavingDocument()).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(file.previewUrl);
  });

  it("keeps files and the guard when a failed file receives a new state", () => {
    updatePhotoDraft(scope, () => [photo()]);
    updatePhotoDraft(scope, (files) => files.map((file) => ({ ...file, failed: true })));
    expect(readPhotoDraft(scope)[0].failed).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(leavingDocument()).toBe(true);
  });

  it("transfers a new listing queue to the saved ID without revoking previews", () => {
    const file = photo();
    updatePhotoDraft(scope, () => [file]);
    const saved = movePhotoDraft(scope, "saved-id");
    expect(readPhotoDraft(scope)).toEqual([]);
    expect(readPhotoDraft(saved)).toEqual([file]);
    expect(photoDraftIds(scope.account, scope.shelter)).toEqual(["saved-id"]);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(leavingDocument()).toBe(true);
  });

  it("isolates accounts and shelters, and clears only the account signing out", () => {
    updatePhotoDraft(scope, () => [photo()]);
    updatePhotoDraft(other, () => [photo(2)]);
    expect(readPhotoDraft({ ...scope, shelter: "different" })).toEqual([]);
    clearAccountPhotoDrafts(scope.account);
    expect(readPhotoDraft(scope)).toEqual([]);
    expect(readPhotoDraft(other)).toHaveLength(1);
    expect(leavingDocument()).toBe(true);
    clearAccountPhotoDrafts(other.account);
    expect(leavingDocument()).toBe(false);
  });
});
