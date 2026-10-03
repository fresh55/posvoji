// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyContactButton } from "./copy-contact-button";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderPair() {
  return render(
    <div>
      <a href="tel:+38651304435">051 304 435</a>
      <CopyContactButton
        value="051 304 435"
        label="Kopiraj: 051 304 435"
        copiedLabel="Kopirano"
      />
    </div>,
  );
}

describe("the contact copy button", () => {
  it("copies the value as printed and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPair();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopiraj: 051 304 435" }));
    });

    expect(writeText).toHaveBeenCalledWith("051 304 435");
    expect(screen.getByRole("status").textContent).toBe("Kopirano");
  });

  // A page served over plain http has no clipboard API at all.
  it("selects the value instead of claiming a copy it could not make", async () => {
    renderPair();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopiraj: 051 304 435" }));
    });

    expect(screen.getByRole("status").textContent).toBe("");
    expect(window.getSelection()?.toString()).toBe("051 304 435");
  });
});
