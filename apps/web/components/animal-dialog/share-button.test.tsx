// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/animal-dialog/share-button";
import { I18nProvider } from "@/components/i18n-provider";
import { SITE_URL } from "@/lib/site";

// I18nProvider wraps everything in MotionConfig, which reads matchMedia when
// it resolves reducedMotion="user", and jsdom ships none. The share button
// asks it for the phone layout, which is off unless a test turns it on.
let phone = false;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === "(max-width: 639px)" && phone,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  phone = false;
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

const PATH = "/zival/rex-abc123/ljubljana/test-shelter";
const PAGE = `${SITE_URL}${PATH}`;

function renderButton(photo?: number, className?: string) {
  render(
    <I18nProvider locale="sl">
      <ShareButton
        path={PATH}
        name="Rex"
        photo={photo}
        className={className}
      />
    </I18nProvider>,
  );
  return screen.getByRole("button", { name: "Deli" });
}

async function openSheet(photo?: number) {
  const button = renderButton(photo);
  await act(async () => {
    fireEvent.click(button);
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
  });

  it("leaves the first photo unnamed", async () => {
    const panel = await openSheet(0);

    // The page opens on its first photo anyway, so saying so would only make
    // the link longer than it has to be to be read out.
    expect(panel.getByLabelText("Povezava")).toHaveProperty("value", PAGE);
  });

  it("leaves the link bare where no photo is named at all", async () => {
    const panel = await openSheet();

    expect(panel.getByLabelText("Povezava")).toHaveProperty("value", PAGE);
  });

  // A mailto: in a new tab hands the mail client an empty tab to leave behind.
  it("opens the email target in the same tab", async () => {
    const panel = await openSheet();

    const email = panel.getByRole("link", { name: "E-pošta" });
    expect(email.getAttribute("href")).toMatch(/^mailto:/);
    expect(email.getAttribute("target")).toBeNull();
    expect(
      panel.getByRole("link", { name: "Facebook" }).getAttribute("target"),
    ).toBe("_blank");
  });
});

describe("copying the link", () => {
  it("confirms a copy the clipboard took", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const panel = await openSheet();

    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Kopiraj povezavo" }));
    });

    expect(writeText).toHaveBeenCalledWith(PAGE);
    expect(panel.getByRole("status").textContent).toBe("Povezava kopirana");
  });

  // A page served over plain http has no clipboard API at all. Awaiting the
  // optional call resolved anyway, and the sheet said "copied" over a link
  // that had gone nowhere.
  it("does not claim a copy where there is no clipboard", async () => {
    const panel = await openSheet();

    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Kopiraj povezavo" }));
    });

    expect(panel.getByRole("status").textContent).toBe("");
    // The field is what is left, selected so a manual copy is one keystroke.
    const field = panel.getByLabelText("Povezava") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(PAGE.length);
  });

  it("stays quiet when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const panel = await openSheet();

    await act(async () => {
      fireEvent.click(panel.getByRole("button", { name: "Kopiraj povezavo" }));
    });

    expect(panel.getByRole("status").textContent).toBe("");
  });
});

describe("on a phone", () => {
  it("offers the existing copy popover after a genuine native-share failure", async () => {
    phone = true;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException("unavailable", "NotAllowedError")),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const button = renderButton(2);
    fireEvent.click(button);
    const copy = await screen.findByRole("button", { name: "Kopiraj povezavo" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Deljenje ni uspelo"));
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith(`${PAGE}?foto=3`);
  });

  it("announces the failure after the fallback region mounts and retries native share after closing", async () => {
    phone = true;
    const share = vi.fn()
      .mockRejectedValueOnce(new DOMException("unavailable", "NotAllowedError"))
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const button = renderButton();
    const announcements: string[] = [];
    const observer = new MutationObserver(() => {
      const status = screen.queryByRole("status");
      if (status) announcements.push(status.textContent ?? "");
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    try {
      fireEvent.click(button);
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Deljenje ni uspelo"));
      expect(announcements[0]).toBe("");
      expect(announcements.some((text) => text.includes("Deljenje ni uspelo"))).toBe(true);
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Povezava" }), { key: "Escape" });
      await waitFor(() => expect(screen.queryByText("Deli to žival")).toBeNull());
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Deli" })));
      expect(share).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Deli to žival")).toBeNull();
    } finally {
      observer.disconnect();
    }
  });

  it("keeps a cancelled native share quiet", async () => {
    phone = true;
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const button = renderButton();
    await act(async () => fireEvent.click(button));
    expect(share).toHaveBeenCalledOnce();
    expect(screen.queryByText("Deli to žival")).toBeNull();
  });

  // The platform's sheet lists every app the visitor has, and copying is one
  // of its rows: a popover of our own in front of it was one tap more for
  // less. So the button is the share.
  it("opens the platform's own sheet straight from the button", async () => {
    phone = true;
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    const button = renderButton(2);

    await act(async () => {
      fireEvent.click(button);
    });

    // text as well as title: an Android app is handed both and most of them
    // print only the text, so a title on its own left WhatsApp with a bare
    // link to send.
    expect(share).toHaveBeenCalledWith({
      title: "Rex išče dom",
      text: "Rex išče dom",
      url: `${PAGE}?foto=3`,
    });
    expect(screen.queryByText("Deli to žival")).toBeNull();
  });

  it("keeps the popover where the platform has no sheet", async () => {
    phone = true;
    const panel = await openSheet();

    expect(panel.getByLabelText("Povezava")).toHaveProperty("value", PAGE);
    expect(panel.queryByRole("button", { name: "Več" })).toBeNull();
  });
});

// The dialog dresses this button as the third control of its title row. Both
// buttons this component can be are the same element, so the classes have to
// reach whichever one the platform leaves standing, and neither may lose the
// 44px the phone layout holds every control to.
describe("the classes the caller passes", () => {
  it.each([
    ["the popover's trigger", false],
    ["the button that opens the platform's sheet", true],
  ])("reach %s", (_name, native) => {
    if (native) {
      phone = true;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });
    }

    const button = renderButton(undefined, "max-sm:rounded-full");

    expect(button.className).toContain("max-sm:rounded-full");
    expect(button.className).toContain("size-11");
    // And the floor survives sm: a 768px tablet is all thumb, and it was
    // handed the 32px disc that belongs to a mouse.
    expect(button.className).toContain("pointer-coarse:size-11");
  });
});
