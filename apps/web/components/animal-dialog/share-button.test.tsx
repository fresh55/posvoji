// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/animal-dialog/share-button";
import { I18nProvider } from "@/components/i18n-provider";
import { SITE_URL } from "@/lib/site";

// I18nProvider wraps everything in MotionConfig, which reads matchMedia when
// it resolves reducedMotion="user", and jsdom ships none.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(cleanup);

const PATH = "/zival/rex-abc123/ljubljana/test-shelter";
const PAGE = `${SITE_URL}${PATH}`;

async function openSheet(photo?: number) {
  render(
    <I18nProvider locale="sl">
      <ShareButton path={PATH} name="Rex" photo={photo} />
    </I18nProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deli" }));
  });
  const heading = await screen.findByText("Deli to žival");
  return within(heading.closest("[data-slot=popover-content]") as HTMLElement);
}

describe("the share sheet's link", () => {
  it("names the photo on show", async () => {
    const panel = await openSheet(2);

    // One-based in the URL, because that is how the count on the photo reads.
    expect(panel.getByLabelText("Povezava")).toHaveProperty(
      "value",
      `${PAGE}?foto=3`,
    );
    // Every target hands over the same address the field shows.
    expect(
      panel.getByRole("link", { name: "Facebook" }).getAttribute("href"),
    ).toContain(encodeURIComponent(`${PAGE}?foto=3`));
    expect(
      panel.getByText("Povezava odpre stran te živali na tej fotografiji."),
    ).toBeTruthy();
  });

  it("leaves the first photo unnamed", async () => {
    const panel = await openSheet(0);

    // The page opens on its first photo anyway, so saying so would only make
    // the link longer than it has to be to be read out.
    expect(panel.getByLabelText("Povezava")).toHaveProperty("value", PAGE);
    expect(
      panel.getByText(
        "Povezava odpre stran te živali, s fotografijo in zavetiščem.",
      ),
    ).toBeTruthy();
  });

  it("leaves the link bare where no photo is named at all", async () => {
    const panel = await openSheet();

    expect(panel.getByLabelText("Povezava")).toHaveProperty("value", PAGE);
  });
});
