// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Photos, type PhotoPanel } from "./listing-photos";
import { portalText } from "./portal-text";

afterEach(cleanup);

function panel(overrides: Partial<PhotoPanel> = {}): PhotoPanel {
  return {
    stored: [1, 2].map((id) => ({
      id,
      url: `/media/audit-${id}.png`,
      width: 100,
      height: 100,
      order: id,
    })),
    pending: [],
    uploading: null,
    error: null,
    errorId: "photo-error",
    removing: null,
    busy: false,
    storable: true,
    onPick: vi.fn(),
    onRetry: vi.fn(),
    onDrop: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

describe("photo removal focus", () => {
  it("keeps focus while deletion is busy, prevents repeat clicks, and continues to the next photo", () => {
    const photos = panel();
    const { rerender } = render(<Photos uid="audit" panel={photos} />);
    const first = screen.getByRole("button", { name: "Odstrani 1. fotografijo" });
    first.focus();
    fireEvent.click(first);
    rerender(<Photos uid="audit" panel={{ ...photos, removing: 1 }} />);
    const confirm = screen.getByRole("button", { name: portalText.photoRemoveConfirm });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(confirm);
    rerender(<Photos uid="audit" panel={{ ...photos, busy: true }} />);
    expect(document.activeElement).toBe(confirm);
    expect(confirm.hasAttribute("disabled")).toBe(false);
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(confirm);
    expect(photos.onRemove).toHaveBeenCalledTimes(2);

    const second = screen.getByRole("button", { name: "Odstrani 2. fotografijo" });
    rerender(<Photos uid="audit" panel={{ ...photos, stored: photos.stored.slice(1) }} />);
    expect(document.activeElement).toBe(second);
  });

  it("waits until the picker is enabled before focusing it after the last stored photo disappears", () => {
    const photos = panel();
    photos.stored = photos.stored.slice(0, 1);
    const { rerender } = render(<Photos uid="audit" panel={photos} />);
    const remove = screen.getByRole("button", { name: "Odstrani 1. fotografijo" });
    remove.focus();
    fireEvent.click(remove);
    rerender(<Photos uid="audit" panel={{ ...photos, stored: [], busy: true }} />);
    rerender(<Photos uid="audit" panel={{ ...photos, stored: [] }} />);
    expect(document.activeElement).toBe(screen.getByLabelText(portalText.photoAdd));
  });

  it("returns to Add photo after dropping the last unsaved preview", () => {
    const photos = panel({
      stored: [],
      storable: false,
      pending: [{
        key: 10,
        file: new File(["preview"], "audit-photo.png", { type: "image/png" }),
        previewUrl: "blob:audit-preview",
        failed: false,
      }],
    });
    const { rerender } = render(<Photos uid="audit" panel={photos} />);
    const remove = screen.getByRole("button", { name: portalText.photoRemove });
    remove.focus();
    fireEvent.click(remove);
    rerender(<Photos uid="audit" panel={{ ...photos, pending: [] }} />);
    expect(photos.onDrop).toHaveBeenCalledWith(photos.pending[0]);
    expect(document.activeElement).toBe(screen.getByLabelText(portalText.photoAdd));
  });

  it("does not steal focus if the user moves away while a deletion is pending", () => {
    const photos = panel();
    const { rerender } = render(
      <><button>Elsewhere</button><Photos uid="audit" panel={photos} /></>,
    );
    const first = screen.getByRole("button", { name: "Odstrani 1. fotografijo" });
    first.focus();
    fireEvent.click(first);
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    rerender(
      <><button>Elsewhere</button><Photos uid="audit" panel={{ ...photos, stored: [] }} /></>,
    );
    expect(document.activeElement).toBe(elsewhere);
  });
});
