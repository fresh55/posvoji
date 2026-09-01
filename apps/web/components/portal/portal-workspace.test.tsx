// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalWorkspace } from "@/components/portal/portal-workspace";
import { portalText } from "@/components/portal/portal-text";
import {
  PortalError,
  fetchAnimals,
  fetchSession,
  type PortalAnimal,
} from "@/lib/portal-api";

// Only the two calls the workspace makes are stubbed; PortalError and
// isUnauthorized stay the real ones, because the hooks branch on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchAnimals: vi.fn(),
  fetchSession: vi.fn(),
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
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(fetchSession).mockReset();
});

const SESSION = {
  email: "info@zavetisce.si",
  shelters: [{ slug: "testno", name: "Zavetišče Testno", city: "Ljubljana" }],
};

function animal(): PortalAnimal {
  return {
    id: "testno:1",
    species: "cat",
    status: "available",
    name: "Muri",
    breed: null,
    sex: "female",
    birthDate: null,
    approximateAgeMonths: 24,
    size: null,
    energy: null,
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    apartmentOk: null,
    specialNeeds: null,
    shortDescription: null,
    thumbnailUrl: null,
    overrides: {},
  };
}

function headings(): HTMLElement[] {
  return screen.queryAllByRole("heading", { level: 1 });
}

describe("what a failure tells the shelter", () => {
  it("says what failed and what to do, never the same sentence twice", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(500));

    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(screen.getByText(portalText.sessionErrorLead)).toBeTruthy();
    // The notice prints a title and a body. One sentence in both places reads
    // as a fault in the page, not as an answer.
    expect(portalText.sessionErrorLead).not.toBe(portalText.sessionErrorTitle);
    expect(screen.queryAllByText(portalText.sessionErrorTitle)).toHaveLength(1);
  });

  it("names the connection when that is what went wrong", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(0));

    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.networkError)).toBeTruthy();
    });
    expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
  });

  it("does the same for a list that will not load", async () => {
    vi.mocked(fetchSession).mockResolvedValue(SESSION);
    vi.mocked(fetchAnimals).mockRejectedValue(new PortalError(500));

    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.listErrorTitle)).toBeTruthy();
    });
    expect(screen.getByText(portalText.listError)).toBeTruthy();
    expect(portalText.listError).not.toBe(portalText.listErrorTitle);
    expect(screen.queryAllByText(portalText.listErrorTitle)).toHaveLength(1);
  });
});

describe("the page's own heading", () => {
  it("is there while the session is still being read", () => {
    vi.mocked(fetchSession).mockReturnValue(new Promise(() => {}));

    render(<PortalWorkspace />);

    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.brand);
  });

  it("is there when the session cannot be read", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(500));

    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.brand);
  });

  it("is there when the account has no shelter yet", async () => {
    vi.mocked(fetchSession).mockResolvedValue({ ...SESSION, shelters: [] });

    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.noSheltersTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
  });

  it("is the workspace's own name once there is a list, and only once", async () => {
    vi.mocked(fetchSession).mockResolvedValue(SESSION);
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);

    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.animalsTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.animalsTitle);
  });
});
