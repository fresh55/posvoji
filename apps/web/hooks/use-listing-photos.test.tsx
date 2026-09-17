// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeEvent } from "react";
import type { PortalListingPhoto } from "@/lib/portal-api";
import { clearAccountPhotoDrafts, photoDraftIds, readPhotoDraft } from "./portal-photo-drafts";
import { useListingPhotos } from "./use-listing-photos";
import type { PortalListingActions } from "./use-portal-listings";

const scope = { account: "fixture-account", shelter: "fixture-shelter", id: "listing" };
const uploadPhoto = vi.fn<PortalListingActions["uploadPhoto"]>();
const deletePhoto = vi.fn<PortalListingActions["deletePhoto"]>();
function mount() {
  return renderHook(() => useListingPhotos({ scope, listingId: scope.id, actions: { uploadPhoto, deletePhoto }, startSave: vi.fn() }));
}
function picked(...names: string[]) {
  return { target: { files: names.map((name) => new File(["photo"], name, { type: "image/jpeg" })), value: "" } } as unknown as ChangeEvent<HTMLInputElement>;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
  URL.revokeObjectURL = vi.fn();
  uploadPhoto.mockReset();
  deletePhoto.mockReset();
});
afterEach(() => {
  cleanup();
  clearAccountPhotoDrafts(scope.account);
});

describe("uploads across navigation and discard", () => {
  it.each([
    ["discard", null],
    ["discard", { id: 1, url: "/fixture.jpg", width: 100, height: 100 }],
    ["sign-out", null],
    ["sign-out", { id: 1, url: "/fixture.jpg", width: 100, height: 100 }],
  ] as const)("does not restart or resurrect files after %s while a request resolves to %j", async (reason, response) => {
    let resolve!: (photo: PortalListingPhoto | null) => void;
    uploadPhoto.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = mount();
    act(() => view.result.current.pickFiles(picked("first.jpg", "second.jpg")));
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    act(() => {
      if (reason === "discard") view.result.current.discardPending();
      else clearAccountPhotoDrafts(scope.account);
    });
    await act(async () => { resolve(response); });
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(readPhotoDraft(scope)).toEqual([]);
    expect(photoDraftIds(scope.account, scope.shelter)).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("shares in-flight progress after remount and removes the queue after success", async () => {
    let resolve!: (photo: PortalListingPhoto | null) => void;
    uploadPhoto.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = mount();
    act(() => view.result.current.pickFiles(picked("first.jpg")));
    view.unmount();
    const returned = mount();
    expect(returned.result.current.pending).toHaveLength(1);
    expect(returned.result.current.uploading).toEqual({ index: 1, total: 1 });
    await act(async () => { resolve({ id: 1, url: "/fixture.jpg", width: 100, height: 100 }); });
    expect(returned.result.current.pending).toEqual([]);
    expect(returned.result.current.uploading).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
