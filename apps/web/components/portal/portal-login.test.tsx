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
import { portalText } from "@/components/portal/portal-text";
import {
  PORTAL_PATH,
  PORTAL_RETURN_KEY,
  rememberPortalReturn,
} from "@/hooks/use-portal-session";
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

afterEach(() => {
  cleanup();
  vi.mocked(requestLoginLink).mockReset();
  vi.mocked(verifyToken).mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/portal");
});

const DEEP_LINK = "/portal/zival?zavetisce=testno&id=1";

// Addresses a login must never send the browser to, whether they were
// planted in storage or in the link itself.
const OUTSIDE_THE_PORTAL = [
  "https://evil.example/portal",
  "//evil.example/portal",
  "javascript:alert(1)",
  "/portalx",
  "/zavetisca/ljubljana",
  "/portal/prijava?token=abc",
  "/portal\\@evil.example",
  "/portal/zival?x=1\nlocation:https://evil.example",
];

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

  it("sends a well formed one, with no page to come back to", async () => {
    vi.mocked(requestLoginLink).mockResolvedValue(undefined);
    render(<PortalLogin />);

    type("  info@zavetisce.si  ");
    send();

    await screen.findByText(portalText.sentTitle);
    expect(requestLoginLink).toHaveBeenCalledWith("info@zavetisce.si", null);
  });

  it("sends the page the shelter was sent away from along with it", async () => {
    window.history.replaceState(null, "", DEEP_LINK);
    rememberPortalReturn();
    window.history.replaceState(null, "", "/portal/prijava");
    vi.mocked(requestLoginLink).mockResolvedValue(undefined);
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    await screen.findByText(portalText.sentTitle);
    expect(requestLoginLink).toHaveBeenCalledWith(
      "info@zavetisce.si",
      DEEP_LINK,
    );
    // Peeked, not taken: a login that follows in this tab still lands there.
    expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBe(DEEP_LINK);
  });

  it("sends no page that is not inside the portal", async () => {
    window.sessionStorage.setItem(PORTAL_RETURN_KEY, "https://evil.example");
    vi.mocked(requestLoginLink).mockResolvedValue(undefined);
    render(<PortalLogin />);

    type("info@zavetisce.si");
    send();

    await screen.findByText(portalText.sentTitle);
    expect(requestLoginLink).toHaveBeenCalledWith("info@zavetisce.si", null);
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

  it("takes the page it came with out of the URL as well", () => {
    vi.mocked(verifyToken).mockReturnValue(new Promise(() => {}));
    window.history.replaceState(
      null,
      "",
      `/portal/prijava?token=abc123&nazaj=${encodeURIComponent(DEEP_LINK)}`,
    );

    render(<PortalLogin />);

    expect(verifyToken).toHaveBeenCalledWith("abc123");
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

describe("where a login that went through lands", () => {
  const SESSION = { email: "info@zavetisce.si", shelters: [] };
  const realLocation = window.location;

  /**
   * jsdom cannot navigate, and its Location will not let one method be
   * stubbed on its own, so the whole object is stood in for. The stand-in
   * carries the address the test arrived on, frozen: the page reads the
   * token off it, and what it writes back goes to the real history.
   */
  function arriveWithToken(
    search = "?token=abc123",
  ): ReturnType<typeof vi.fn> {
    window.history.replaceState(null, "", `/portal/prijava${search}`);
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/portal/prijava",
        search,
        href: `http://localhost/portal/prijava${search}`,
        replace,
      },
    });
    return replace;
  }

  /** A link from the mail, with the page it was asked for in it. */
  function linkWith(back: string): string {
    return `?token=abc123&nazaj=${encodeURIComponent(back)}`;
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("goes back to the page the shelter was sent away from", async () => {
    // The provider, on finding no session, keeps the page it is leaving.
    window.history.replaceState(null, "", DEEP_LINK);
    rememberPortalReturn();
    expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBe(DEEP_LINK);

    const replace = arriveWithToken();
    vi.mocked(verifyToken).mockResolvedValue(SESSION);
    render(<PortalLogin />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(DEEP_LINK);
    });
    // Used once: a later login in this tab starts on the list again.
    expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBeNull();
  });

  it("lands on the list when nothing was remembered", async () => {
    const replace = arriveWithToken();
    vi.mocked(verifyToken).mockResolvedValue(SESSION);
    render(<PortalLogin />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(PORTAL_PATH);
    });
  });

  it.each(OUTSIDE_THE_PORTAL)(
    "never leaves the portal for a remembered %s",
    async (planted) => {
      window.sessionStorage.setItem(PORTAL_RETURN_KEY, planted);

      const replace = arriveWithToken();
      vi.mocked(verifyToken).mockResolvedValue(SESSION);
      render(<PortalLogin />);

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith(PORTAL_PATH);
      });
      expect(replace).not.toHaveBeenCalledWith(planted);
      expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBeNull();
    },
  );

  // The tab the mail opened has no storage of ours: the link is all it has.
  it("goes where the link says in a tab that remembers nothing", async () => {
    const replace = arriveWithToken(linkWith(DEEP_LINK));
    vi.mocked(verifyToken).mockResolvedValue(SESSION);
    render(<PortalLogin />);

    expect(verifyToken).toHaveBeenCalledWith("abc123");
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(DEEP_LINK);
    });
  });

  it("lets the link outrank what the tab remembers", async () => {
    window.sessionStorage.setItem(PORTAL_RETURN_KEY, "/portal/nastavitve");

    const replace = arriveWithToken(linkWith(DEEP_LINK));
    vi.mocked(verifyToken).mockResolvedValue(SESSION);
    render(<PortalLogin />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(DEEP_LINK);
    });
    // Taken all the same, so it is not left for a later login.
    expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBeNull();
  });

  it.each(OUTSIDE_THE_PORTAL)(
    "never leaves the portal for a link that says %s",
    async (planted) => {
      const replace = arriveWithToken(linkWith(planted));
      vi.mocked(verifyToken).mockResolvedValue(SESSION);
      render(<PortalLogin />);

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith(PORTAL_PATH);
      });
      expect(replace).not.toHaveBeenCalledWith(planted);
    },
  );

  it("falls back to what the tab remembers when the link's page is bad", async () => {
    window.history.replaceState(null, "", DEEP_LINK);
    rememberPortalReturn();

    const replace = arriveWithToken(linkWith("https://evil.example/portal"));
    vi.mocked(verifyToken).mockResolvedValue(SESSION);
    render(<PortalLogin />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(DEEP_LINK);
    });
  });

  it("lands on the list when the link names an empty page", async () => {
    const replace = arriveWithToken("?token=abc123&nazaj=");
    vi.mocked(verifyToken).mockResolvedValue(SESSION);
    render(<PortalLogin />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(PORTAL_PATH);
    });
  });

  it("remembers only a page inside the portal", () => {
    for (const path of ["/zavetisca/ljubljana", "/portal/prijava", "/"]) {
      window.history.replaceState(null, "", path);
      rememberPortalReturn();
      expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBeNull();
    }

    window.history.replaceState(null, "", PORTAL_PATH);
    rememberPortalReturn();
    expect(window.sessionStorage.getItem(PORTAL_RETURN_KEY)).toBe(PORTAL_PATH);
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
