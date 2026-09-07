// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalLogin } from "@/components/portal/portal-login";
import { fill, portalText } from "@/components/portal/portal-text";
import { PORTAL_PATH } from "@/hooks/use-portal-session";
import { PortalError, requestLoginLink, verifyToken } from "@/lib/portal-api";

// Only the two calls the login page makes are stubbed; PortalError and
// isUnauthorized stay the real ones, because the page branches on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  requestLoginLink: vi.fn(),
  verifyToken: vi.fn(),
}));

// The dev picker fetches on mount and is never in a production build.
vi.mock("@/components/portal/portal-dev-login", () => ({
  PortalDevLogin: () => null,
}));

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

let restoreLocation: (() => void) | null = null;

/**
 * A location whose replace() only records where the page was sent. jsdom
 * navigates nowhere and warns instead, and the test has to see the address
 * the card handed over to.
 */
function captureNavigation(): ReturnType<typeof vi.fn> {
  const real = window.location;
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...real, replace, assign: vi.fn() },
  });
  restoreLocation = () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: real,
    });
  };
  return replace;
}

afterEach(() => {
  cleanup();
  vi.mocked(requestLoginLink).mockReset();
  vi.mocked(verifyToken).mockReset();
  window.sessionStorage.clear();
  restoreLocation?.();
  restoreLocation = null;
  window.history.replaceState(null, "", "/portal");
});

function emailBox(): HTMLElement {
  return screen.getByLabelText(portalText.emailLabel);
}

function type(value: string) {
  fireEvent.change(emailBox(), { target: { value } });
}

function send() {
  fireEvent.click(screen.getByRole("button", { name: portalText.sendLink }));
}

describe("the address the link is sent to", () => {
  it("refuses an empty box", () => {
    render(<PortalLogin />);

    send();

    expect(screen.getByText(portalText.emailRequired)).toBeTruthy();
    expect(requestLoginLink).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one", () => {
    render(<PortalLogin />);

    type("zavetisce.si");
    send();

    expect(screen.getByText(portalText.emailInvalid)).toBeTruthy();
    expect(emailBox().getAttribute("aria-invalid")).toBe("true");
    expect(emailBox().getAttribute("aria-describedby")).toBe(
      screen.getByText(portalText.emailInvalid).id,
    );
    expect(requestLoginLink).not.toHaveBeenCalled();
  });

  it("refuses a half typed one", () => {
    render(<PortalLogin />);

    type("info@zavetisce");
    send();

    expect(screen.getByText(portalText.emailInvalid)).toBeTruthy();
    expect(requestLoginLink).not.toHaveBeenCalled();
  });

  // The same rule lib/shelters.ts holds the register to.
  it("refuses one that carries a second recipient", () => {
    render(<PortalLogin />);

    type("info,vodja@zavetisce.si");
    send();

    expect(screen.getByText(portalText.emailInvalid)).toBeTruthy();
    expect(requestLoginLink).not.toHaveBeenCalled();
  });

  it("sends a well formed one", async () => {
    vi.mocked(requestLoginLink).mockResolvedValue(undefined);
    render(<PortalLogin />);

    type("  info@zavetisce.si  ");
    send();

    await screen.findByText(portalText.sentTitle);
    expect(requestLoginLink).toHaveBeenCalledWith("info@zavetisce.si");
  });
});

describe("a failure the address is not to blame for", () => {
  it("reports it on the form and leaves the field valid", async () => {
    vi.mocked(requestLoginLink).mockRejectedValue(new PortalError(0));
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(portalText.networkError);
    expect(emailBox().getAttribute("aria-invalid")).toBeNull();
    expect(emailBox().getAttribute("aria-describedby")).toBeNull();
  });
});

describe("a link the API refused to send because of the rate limit", () => {
  it("says how long the wait is when the API stated it", async () => {
    vi.mocked(requestLoginLink).mockRejectedValue(
      new PortalError(429, "too many requests", 540),
    );
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      fill(portalText.throttledMinutes, { minutes: 9 }),
    );
    // The address is not what failed, so the box keeps its valid state.
    expect(emailBox().getAttribute("aria-invalid")).toBeNull();
    expect(emailBox().getAttribute("aria-describedby")).toBeNull();
  });

  // Anything under a minute still reads as one: "0 min" would send the shelter
  // straight back to the button that is being refused.
  it("never rounds the wait down to nothing", async () => {
    vi.mocked(requestLoginLink).mockRejectedValue(new PortalError(429, "", 20));
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      fill(portalText.throttledMinutes, { minutes: 1 }),
    );
  });

  it("names the window when the API sent no wait at all", async () => {
    vi.mocked(requestLoginLink).mockRejectedValue(new PortalError(429));
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(portalText.throttledHour);
    // The retry-and-fail loop this replaces.
    expect(alert.textContent).not.toContain(portalText.unknownError);
  });
});

describe("the way out for a shelter the form cannot help", () => {
  it("names the address under the form, as a link to write to", () => {
    render(<PortalLogin />);

    const link = screen.getByRole("link", { name: portalText.contactEmail });
    expect(link.getAttribute("href")).toBe(
      `mailto:${portalText.contactEmail}`,
    );
    expect(link.parentElement?.textContent).toBe(
      fill(portalText.helpLine, { email: portalText.contactEmail }),
    );
  });

  it("is not on the cards that have said their piece", async () => {
    vi.mocked(requestLoginLink).mockResolvedValue(undefined);
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    await screen.findByText(portalText.sentTitle);
    expect(
      screen.queryByRole("link", { name: portalText.contactEmail }),
    ).toBeNull();
  });
});

describe("a verification that left no session behind", () => {
  it("notes the verification before handing the tab over to the workspace", async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      email: "info@zavetisce.si",
      shelters: [],
    });
    // The address first: the stand-in location is a snapshot of the real one.
    window.history.replaceState(null, "", "/portal?token=abc123");
    const replace = captureNavigation();

    render(<PortalLogin />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(PORTAL_PATH);
    });
    // Read by the workspace's guard, which is the only thing that can tell a
    // browser that kept no cookie from a visitor who never signed in.
    expect(window.sessionStorage.getItem("portal:verified")).toBe("1");
  });

  it("says what happened when the guard sends the visitor back", async () => {
    window.history.replaceState(null, "", "/portal?napaka=seja");

    render(<PortalLogin />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(portalText.sessionNotStored);
    // The form is what the shelter needs next, and the box is theirs to type in.
    expect(emailBox().getAttribute("aria-invalid")).toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
    // Said on the card, so it has no business in a reloadable address.
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
  });

  it("leaves the notice behind as soon as the shelter types", async () => {
    window.history.replaceState(null, "", "/portal?napaka=seja");

    render(<PortalLogin />);
    expect(screen.getByRole("alert")).toBeTruthy();

    type("info@zavetisce.si");

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a token that arrives in the address bar", () => {
  it("is out of the URL before the answer comes back", async () => {
    let settle = () => {};
    vi.mocked(verifyToken).mockReturnValue(
      new Promise((_, reject) => {
        settle = () => reject(new PortalError(401));
      }),
    );
    window.history.replaceState(null, "", "/portal?token=abc123");

    render(<PortalLogin />);

    expect(verifyToken).toHaveBeenCalledWith("abc123");
    expect(window.location.search).toBe("");

    settle();
    await screen.findByText(portalText.expiredTitle);
    expect(window.location.search).toBe("");
  });

  it("stays out of it when the check fails on the transport", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error("offline"));
    window.history.replaceState(null, "", "/portal?token=abc123");

    render(<PortalLogin />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(portalText.unknownError);
    expect(window.location.search).toBe("");
    expect(emailBox().getAttribute("aria-invalid")).toBeNull();
  });
});

describe("where the reader lands after a step change", () => {
  it("moves to the heading of the card that replaced the form", async () => {
    vi.mocked(requestLoginLink).mockResolvedValue(undefined);
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    const heading = await screen.findByRole("heading", {
      name: portalText.sentTitle,
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });
  });

  it("moves to the heading when the link has expired", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new PortalError(401));
    window.history.replaceState(null, "", "/portal?token=abc123");

    render(<PortalLogin />);

    const heading = await screen.findByRole("heading", {
      name: portalText.expiredTitle,
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });
  });
});
