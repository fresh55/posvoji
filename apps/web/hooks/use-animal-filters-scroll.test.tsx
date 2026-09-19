// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { scrollToResults } from "./use-animal-filters";
afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("data-scroll-locked");
  vi.restoreAllMocks();
});
it("waits until all modal scroll locks are gone before returning to changed results", async () => {
  document.body.innerHTML = '<section aria-labelledby="rezultati"></section>';
  vi.spyOn(
    document.querySelector("section")!,
    "getBoundingClientRect",
  ).mockReturnValue({ top: -29000 } as DOMRect);
  vi.spyOn(window, "scrollY", "get").mockReturnValue(30000);
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  document.body.setAttribute("data-scroll-locked", "2");
  scrollToResults();
  scrollToResults();
  expect(scroll).not.toHaveBeenCalled();
  document.body.setAttribute("data-scroll-locked", "1");
  await Promise.resolve();
  expect(scroll).not.toHaveBeenCalled();
  document.body.removeAttribute("data-scroll-locked");
  await waitFor(() =>
    expect(scroll).toHaveBeenCalledWith({ top: 1000, behavior: "auto" }),
  );
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("requests an immediate return to nearby results", () => {
  document.body.innerHTML = '<section aria-labelledby="rezultati"></section>';
  vi.spyOn(window, "scrollY", "get").mockReturnValue(600);
  vi.spyOn(document.querySelector("section")!, "getBoundingClientRect")
    .mockReturnValue({ top: -369 } as DOMRect);
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

  scrollToResults();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 231, behavior: "auto" });
});

it("does not move a visitor already above the result heading", () => {
  document.body.innerHTML = '<section aria-labelledby="rezultati"></section>';
  vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
  vi.spyOn(document.querySelector("section")!, "getBoundingClientRect")
    .mockReturnValue({ top: 231 } as DOMRect);
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  scrollToResults();
  expect(scroll).not.toHaveBeenCalled();
});
