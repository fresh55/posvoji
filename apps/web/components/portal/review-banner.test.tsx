// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fill, portalText } from "@/components/portal/portal-text";
import { ReviewBanner } from "@/components/portal/review-banner";
import type { PortalBulkState } from "@/hooks/use-portal-animals";

afterEach(cleanup);

const IDLE: PortalBulkState = { status: "idle" };

function banner(count: number, bulk: PortalBulkState = IDLE) {
  const onConfirmAll = vi.fn();
  const view = render(
    <ReviewBanner count={count} bulk={bulk} onConfirmAll={onConfirmAll} />,
  );
  return { onConfirmAll, ...view };
}

const button = () => screen.queryByRole("button");
// The sentence alone: the button sits inside the same role="status".
const line = () =>
  screen.getByRole("status").querySelector("p")?.textContent ?? "";

describe("the review banner", () => {
  it("is not there when nothing is waiting and nothing has run", () => {
    const { container } = banner(0);

    expect(container.innerHTML).toBe("");
  });

  it("says how many statuses are still ours and confirms them all", () => {
    const { onConfirmAll } = banner(12);

    expect(line()).toBe(fill(portalText.reviewBannerLead, { count: 12 }));
    const confirm = button();
    expect(confirm?.textContent).toContain(
      fill(portalText.reviewBannerConfirm, { count: 12 }),
    );

    fireEvent.click(confirm!);
    expect(onConfirmAll).toHaveBeenCalledTimes(1);
  });

  it("counts the run off while it is going, with nothing left to press", () => {
    banner(12, { status: "running", done: 5, total: 12 });

    expect(line()).toBe(
      fill(portalText.reviewBannerConfirming, { done: 5, count: 12 }),
    );
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });

  it("says the run went through, and offers nothing more to do", () => {
    banner(0, { status: "done", total: 12 });

    expect(line()).toContain(portalText.reviewBannerDone);
    expect(button()).toBeNull();
  });

  it("says what failed and keeps the retry for what is left", () => {
    const { onConfirmAll } = banner(3, { status: "failed", failed: 3, total: 12 });

    expect(line()).toContain(portalText.reviewBannerFailed);
    const retry = button();
    expect(retry?.textContent).toContain(
      fill(portalText.reviewBannerConfirm, { count: 3 }),
    );

    fireEvent.click(retry!);
    expect(onConfirmAll).toHaveBeenCalledTimes(1);
  });
});
