// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalProvider } from "@/components/portal/portal-provider";
import { captureNavigation, restoreNavigation } from "@/test/location";
import { PortalWorkspace } from "@/components/portal/portal-workspace";
import { fill, portalText } from "@/components/portal/portal-text";
import {
  PORTAL_LOGIN_NO_SESSION_PATH,
  PORTAL_LOGIN_PATH,
  PORTAL_VERIFIED_KEY,
} from "@/hooks/use-portal-session";
import {
  PortalError,
  fetchAnimals,
  fetchListings,
  fetchSession,
  logout,
  saveAnimal,
  updateListing,
  type PortalAnimal,
  type PortalListing,
  type PortalPublished,
  type PortalShelter,
} from "@/lib/portal-api";
import { missingCountLabel } from "@/components/portal/animal-meta";
import { hasAccountDrafts, readDraft, writeDraft } from "@/lib/portal-drafts";
import { clearAccountPhotoDrafts, photoDraftIds, updatePhotoDraft } from "@/hooks/portal-photo-drafts";

// Only the calls the workspace makes are stubbed; PortalError and
// isUnauthorized stay the real ones, because the hooks branch on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchSession: vi.fn(),
  fetchAnimals: vi.fn(),
  fetchListings: vi.fn(),
  updateListing: vi.fn(),
  saveAnimal: vi.fn(),
  logout: vi.fn(),
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

Element.prototype.scrollTo = vi.fn();
// The list scrolls back to the card a save went to, and jsdom lays nothing
// out to scroll.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  restoreNavigation();
  clearAccountPhotoDrafts(SESSION.email);
  clearAccountPhotoDrafts("another-fixture-account");
});

beforeEach(() => {
  // A draft outlives the page it was typed on, so every test starts in a tab
  // that has never been used.
  window.sessionStorage.clear();
  URL.revokeObjectURL = vi.fn();
  clearAccountPhotoDrafts("info@zavetisce.si");
  vi.mocked(fetchSession).mockReset();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(fetchListings).mockReset();
  vi.mocked(saveAnimal).mockReset();
  vi.mocked(updateListing).mockReset();
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
});

const SESSION = {
  email: "info@zavetisce.si",
  shelters: [{ slug: "testno", name: "Zavetišče Testno", city: "Ljubljana" }],
};

const MANUAL: PortalShelter = {
  slug: "johanca",
  name: "Zavetišče JoHanca",
  city: "Kranj",
  ingestion: "manual",
};

// No ingestion at all: what every shelter reported before the field.
const CRAWLED: PortalShelter = {
  slug: "ljubljana",
  name: "Zavetišče Ljubljana",
  city: "Ljubljana",
};

const LISTING: PortalListing = {
  providerId: "johanca",
  id: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
  species: "cat",
  status: "available",
  name: "Luna",
  sex: null,
  breed: null,
  birthDate: null,
  approximateAgeMonths: null,
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: null,
  apartmentOk: null,
  specialNeeds: null,
  shortDescription: null,
  photos: [],
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  archivedAt: null,
};

function animal(over: Partial<PortalAnimal> = {}): PortalAnimal {
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
    ...over,
  };
}

/**
 * The workspace as the route serves it: the (app) layout mounts the provider,
 * which holds the session and the list, and the page reads them off it.
 */
function renderWorkspace() {
  return render(
    <PortalProvider>
      <PortalWorkspace />
    </PortalProvider>,
  );
}

function signIn(shelter: PortalShelter) {
  vi.mocked(fetchSession).mockResolvedValue({
    email: "info@zavetisce.si",
    shelters: [shelter],
  });
}

function headings(): HTMLElement[] {
  return screen.queryAllByRole("heading", { level: 1 });
}

/** The one action a manual shelter has up here. A link now, not a dialog. */
function addLink(): HTMLElement | null {
  return screen.queryByRole("link", { name: portalText.listingAdd });
}

describe("what a failure tells the shelter", () => {
  it("says what failed and what to do, never the same sentence twice", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(500));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(screen.getByText(portalText.sessionErrorLead)).toBeTruthy();
    // The notice prints a title and a body. One sentence in both places reads
    // as a fault in the page, not as an answer.
    expect(portalText.sessionErrorLead).not.toBe(portalText.sessionErrorTitle);
    expect(screen.queryAllByText(portalText.sessionErrorTitle)).toHaveLength(1);
  });

  // The body names the login as the other thing to try, and a retry that has
  // already failed twice is not the action that fixes an expired session.
  it("offers the login beside the retry, whatever the cause", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(0));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: portalText.retry }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: portalText.toLogin })
        .getAttribute("href"),
    ).toBe(PORTAL_LOGIN_PATH);
  });

  it("names the connection when that is what went wrong", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(0));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.networkError)).toBeTruthy();
    });
    expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
  });

  it("does the same for a list that will not load", async () => {
    vi.mocked(fetchSession).mockResolvedValue(SESSION);
    vi.mocked(fetchAnimals).mockRejectedValue(new PortalError(500));

    renderWorkspace();

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

    renderWorkspace();

    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.brand);
  });

  it("is there when the session cannot be read", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(500));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.brand);
  });

  it("is there when the account has no shelter yet", async () => {
    vi.mocked(fetchSession).mockResolvedValue({ ...SESSION, shelters: [] });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.noSheltersTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
  });

  it("is the workspace's own name once there is a list, and only once", async () => {
    vi.mocked(fetchSession).mockResolvedValue(SESSION);
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.animalsTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.animalsTitle);
  });

  // The manual branch is a second render path to the same heading, so it is
  // held to the same rule as the crawled one above.
  it("is the same name for a shelter that writes its own listings", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.animalsTitle);
  });
});

describe("the guard over a workspace with no session", () => {
  it("sends an ordinary visitor to the login page and says nothing", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(401));
    const replace = captureNavigation();

    renderWorkspace();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(PORTAL_LOGIN_PATH);
    });
  });

  // Verification worked, the browser kept no cookie, and the link is spent.
  // Without this the shelter is bounced back to an empty form with nothing to
  // read and one dead link in their inbox.
  it("tells the login page when a verification left no session behind", async () => {
    window.sessionStorage.setItem(PORTAL_VERIFIED_KEY, "1");
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(401));
    const replace = captureNavigation();

    renderWorkspace();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(PORTAL_LOGIN_NO_SESSION_PATH);
    });
    // Read once. A later bounce is a plain anonymous one and reads as one.
    expect(window.sessionStorage.getItem(PORTAL_VERIFIED_KEY)).toBeNull();
  });

  // Otherwise the note would sit in the tab until some later session ran out,
  // and that bounce would blame the browser for a cookie it did store.
  it("drops the note as soon as a session is read", async () => {
    window.sessionStorage.setItem(PORTAL_VERIFIED_KEY, "1");
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([]);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.emptyTitle)).toBeTruthy();
    });
    expect(window.sessionStorage.getItem(PORTAL_VERIFIED_KEY)).toBeNull();
  });
});

describe("an account with no shelter behind it", () => {
  it("names the address to write to", async () => {
    vi.mocked(fetchSession).mockResolvedValue({ ...SESSION, shelters: [] });

    renderWorkspace();

    const lead = await screen.findByText(
      fill(portalText.noSheltersLead, { email: portalText.contactEmail }),
    );
    expect(lead.textContent).toContain(portalText.contactEmail);
  });
});

describe("a shelter that writes its own listings", () => {
  it("reads listings, never animals, and offers to add the first", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.listingsEmptyLead)).toBeTruthy();
    });
    expect(fetchListings).toHaveBeenCalledWith("johanca");
    expect(fetchAnimals).not.toHaveBeenCalled();
    expect(screen.queryByText(portalText.emptyLead)).toBeNull();
    expect(addLink()?.getAttribute("href")).toBe(
      "/portal/zival?zavetisce=johanca&nova=1",
    );
  });

  it("lists its animals as listing cards under the add button", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
    expect(screen.getByText("1 žival")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: portalText.listingAdd }),
    ).toHaveLength(1);
    // A listing card, not a crawled one: nothing to confirm off a site.
    expect(screen.queryByText(portalText.statusFromSiteLine)).toBeNull();
    expect(
      screen.queryByRole("link", { name: portalText.publicListing }),
    ).toBeNull();
  });

  it("links each listing card to its own page", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });

    expect(
      screen.getByRole("link", { name: portalText.edit }).getAttribute("href"),
    ).toBe(`/portal/zival?zavetisce=johanca&id=${LISTING.id}`);
  });

  it("marks a listing this tab holds unsaved work for", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    writeDraft("info@zavetisce.si", "johanca", LISTING.id, { name: "Lunica" });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
    expect(screen.getByText(portalText.draftBadge)).toBeTruthy();
  });

  it("keeps a photo-only draft when sign-out is canceled and clears it only after confirmation", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([]);
    updatePhotoDraft(
      { account: SESSION.email, shelter: MANUAL.slug, id: "nova" },
      () => [{ key: 1, file: new File(["photo"], "fixture.jpg"), previewUrl: "blob:fixture", failed: false }],
    );
    renderWorkspace();
    const resume = await screen.findByRole("link", { name: portalText.listingResume });
    expect(resume.getAttribute("href")).toBe("/portal/zival?zavetisce=johanca&nova=1");
    captureNavigation();
    fireEvent.click(screen.getByRole("button", { name: portalText.logout }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain(portalText.logoutDraftsLead);
    expect(logout).not.toHaveBeenCalled();
    expect(photoDraftIds(SESSION.email, MANUAL.slug)).toEqual(["nova"]);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: portalText.logoutKeep }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(photoDraftIds(SESSION.email, MANUAL.slug)).toEqual(["nova"]);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: portalText.logout }));
    fireEvent.click(screen.getByRole("button", { name: portalText.logoutDiscard }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(photoDraftIds(SESSION.email, MANUAL.slug)).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
  });

  it("filters the listing cards by name", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([
      LISTING,
      { ...LISTING, id: "b", name: "Bine" },
    ]);
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Bine" })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(portalText.searchLabel), {
      target: { value: "lun" },
    });

    expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Bine" })).toBeNull();
  });
});

describe("a crawled shelter", () => {
  it("renders as it always has", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", species: "dog", name: "Rex", sex: null }),
    ]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(fetchAnimals).toHaveBeenCalledWith("ljubljana");
    expect(fetchListings).not.toHaveBeenCalled();
    expect(addLink()).toBeNull();
    // The crawled row: a status pill that says whose answer it shows, the
    // "Za pregled" chip, and the banner that offers to confirm the crawl's
    // reading, said once above the list instead of on every animal.
    expect(
      screen.getByRole("button", {
        name: `${portalText.statusLegend}: Na voljo , ${portalText.statusSourceSite}`,
      }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: /Za pregled/ }),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(portalText.reviewBannerLead, { count: 1 })),
    ).toBeTruthy();
    expect(screen.getByText("1 žival")).toBeTruthy();
  });

  it("confirms every crawled status from the banner in one go", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
      animal({ id: "ljubljana:2", name: "Bine", status: "reserved" }),
      // Already the shelter's own answer: nothing to confirm on it.
      animal({
        id: "ljubljana:3",
        name: "Muc",
        status: "adopted",
        overrides: { status: "adopted" },
      }),
    ]);
    vi.mocked(saveAnimal).mockImplementation(async (_slug, id, patch) =>
      animal({
        id,
        status: patch.status ?? null,
        overrides: { status: patch.status },
      }),
    );
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: fill(portalText.reviewBannerConfirm, { count: 2 }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(portalText.reviewBannerDone)).toBeTruthy();
    });
    expect(saveAnimal).toHaveBeenCalledTimes(2);
    expect(saveAnimal).toHaveBeenCalledWith("ljubljana", "ljubljana:1", {
      status: "available",
    });
    expect(saveAnimal).toHaveBeenCalledWith("ljubljana", "ljubljana:2", {
      status: "reserved",
    });
    // Every pill now says the answer is the shelter's own.
    expect(
      screen.getAllByRole("button", {
        name: new RegExp(`, ${portalText.statusSourceOwn}$`),
      }),
    ).toHaveLength(3);
  });

  it("keeps the crawl's empty state", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.emptyLead)).toBeTruthy();
    });
    expect(screen.queryByText(portalText.listingsEmptyLead)).toBeNull();
    expect(addLink()).toBeNull();
    expect(fetchListings).not.toHaveBeenCalled();
  });
});

describe("work left unsaved on an animal's own page", () => {
  const ACCOUNT = "info@zavetisce.si";

  function card(name: string): HTMLElement {
    const heading = screen.getByRole("heading", { name });
    const article = heading.closest("article");
    if (!article) throw new Error(`no card for ${name}`);
    return article;
  }

  it("is marked on the card, so the shelter can see which animal it is", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
      animal({ id: "ljubljana:2", name: "Bine" }),
    ]);
    writeDraft(ACCOUNT, "ljubljana", "ljubljana:1", { name: "Reks" });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(within(card("Rex")).getByText(portalText.draftBadge)).toBeTruthy();
    // And only on the animal it belongs to.
    expect(
      within(card("Bine")).queryByText(portalText.draftBadge),
    ).toBeNull();
  });

  it("goes with the account when it signs out", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
    ]);
    writeDraft(ACCOUNT, "ljubljana", "ljubljana:1", { name: "Reks" });

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });

    // Signing out hands the tab to the login page. jsdom cannot navigate and
    // says so on stderr unless the replace is caught here.
    const replace = captureNavigation();
    fireEvent.click(screen.getByRole("button", { name: portalText.logout }));

    expect(logout).not.toHaveBeenCalled();
    expect(hasAccountDrafts(ACCOUNT)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: portalText.logoutDiscard }));

    // The next account to sign in to this tab must not inherit a stranger's
    // half-written edits.
    expect(window.sessionStorage.length).toBe(0);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(PORTAL_LOGIN_PATH);
    });
  });
});

describe("sign-out across draft scopes", () => {
  it("confirms work outside the current shelter and clears only the signed-in account", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([]);
    writeDraft(SESSION.email, "former-shelter", "one", { name: "Unfinished" });
    writeDraft(SESSION.email, "another-shelter", "two", { name: "Still unfinished" });
    writeDraft("another-fixture-account", "former-shelter", "one", { name: "Other account" });
    for (const [account, key] of [[SESSION.email, 10], ["another-fixture-account", 11]] as const) {
      updatePhotoDraft({ account, shelter: "former-shelter", id: "one" }, () => [{
        key, file: new File(["photo"], "fixture.jpg"), previewUrl: `blob:scope-${key}`, failed: true,
      }]);
    }
    renderWorkspace();
    const signOut = await screen.findByRole("button", { name: portalText.logout });
    signOut.focus();
    fireEvent.click(signOut);
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: portalText.logoutKeep }));
    await waitFor(() => expect(document.activeElement).toBe(signOut));
    expect(hasAccountDrafts(SESSION.email)).toBe(true);
    expect(photoDraftIds(SESSION.email, "former-shelter")).toEqual(["one"]);

    captureNavigation();
    fireEvent.click(signOut);
    fireEvent.click(screen.getByRole("button", { name: portalText.logoutDiscard }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(hasAccountDrafts(SESSION.email)).toBe(false);
    expect(photoDraftIds(SESSION.email, "former-shelter")).toEqual([]);
    expect(readDraft("another-fixture-account", "former-shelter", "one")).toEqual({ name: "Other account" });
    expect(photoDraftIds("another-fixture-account", "former-shelter")).toEqual(["one"]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:scope-10");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:scope-11");
  });

  it("signs out directly when only another account has drafts", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([]);
    writeDraft("another-fixture-account", "former-shelter", "one", { name: "Other account" });
    updatePhotoDraft({ account: "another-fixture-account", shelter: "former-shelter", id: "one" }, () => [{
      key: 20, file: new File(["photo"], "fixture.jpg"), previewUrl: "blob:other", failed: false,
    }]);
    renderWorkspace();
    const signOut = await screen.findByRole("button", { name: portalText.logout });
    captureNavigation();
    fireEvent.click(signOut);
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(hasAccountDrafts("another-fixture-account")).toBe(true);
    expect(photoDraftIds("another-fixture-account", "former-shelter")).toEqual(["one"]);
  });
});

describe("a save that the current filter hides", () => {
  // The row's status is a pill that opens a menu. Radix opens it on Enter in
  // jsdom, where pointerdown lacks the fields it checks (see
  // status-menu.test.tsx); the values are the menu's radio items.
  function chooseStatus(name: string, label: string): void {
    const article = screen.getByRole("heading", { name }).closest("article");
    if (!article) throw new Error(`no row for ${name}`);
    const pill = within(article as HTMLElement).getByRole("button", {
      name: new RegExp(`^${portalText.statusLegend}: `),
    });
    fireEvent.keyDown(pill, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
  }

  async function listOf() {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
      animal({ id: "ljubljana:2", name: "Bine" }),
      animal({ id: "ljubljana:3", name: "Muc", status: "adopted" }),
    ]);
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
  }

  it("names the animal and offers the whole list back", async () => {
    await listOf();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({
        id: "ljubljana:1",
        name: "Rex",
        status: "adopted",
        overrides: { status: "adopted" },
      }),
    );

    // Looking at the animals that are still on offer, the shelter marks one
    // of them adopted. It leaves the list under the hand that saved it.
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: /Na voljo/ }),
    );
    chooseStatus("Rex", "Oddan");

    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.savedHidden, { name: "Rex" })),
      ).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "Rex" })).toBeNull();

    // Pokaži vse drops the filter and the card is back.
    fireEvent.click(screen.getByRole("button", { name: portalText.showAll }));

    expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    expect(
      screen.queryByText(fill(portalText.savedHidden, { name: "Rex" })),
    ).toBeNull();
  });

  it("says nothing when the animal is still on the page", async () => {
    await listOf();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({
        id: "ljubljana:1",
        name: "Rex",
        status: "reserved",
        overrides: { status: "reserved" },
      }),
    );

    chooseStatus("Rex", "Rezerviran");

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: `${portalText.statusLegend}: Rezerviran , ${portalText.statusSourceOwn}`,
        }),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/trenutni filter skrije/)).toBeNull();
  });

  it("is dropped again as soon as the shelter searches for something else", async () => {
    await listOf();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({
        id: "ljubljana:1",
        name: "Rex",
        status: "adopted",
        overrides: { status: "adopted" },
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: /Na voljo/ }),
    );
    chooseStatus("Rex", "Oddan");
    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.savedHidden, { name: "Rex" })),
      ).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(portalText.searchLabel), {
      target: { value: "bin" },
    });

    expect(screen.queryByText(/trenutni filter skrije/)).toBeNull();
  });
});

describe("a listing save that the current filter hides", () => {
  function statusButton(name: string, label: string): HTMLElement {
    const article = screen.getByRole("heading", { name }).closest("article");
    if (!article) throw new Error(`no card for ${name}`);
    return within(
      within(article as HTMLElement).getByRole("group", {
        name: portalText.statusLegend,
      }),
    ).getByRole("button", { name: label });
  }

  async function listOf() {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([
      LISTING,
      { ...LISTING, id: "b", name: "Bine" },
    ]);
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
  }

  it("names the listing and offers the whole list back", async () => {
    // The same notice the crawled list shows, over the other list: a manual
    // shelter's animals are its listings.
    await listOf();
    vi.mocked(updateListing).mockResolvedValue({
      ...LISTING,
      status: "adopted",
    });

    // Looking at the animals still on offer, the shelter marks one adopted.
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: /Na voljo/ }),
    );
    fireEvent.click(statusButton("Luna", "Oddan"));

    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.savedHidden, { name: "Luna" })),
      ).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "Luna" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: portalText.showAll }));

    expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    expect(
      screen.queryByText(fill(portalText.savedHidden, { name: "Luna" })),
    ).toBeNull();
  });

  it("says nothing while the listing is still on the page", async () => {
    await listOf();
    vi.mocked(updateListing).mockResolvedValue({
      ...LISTING,
      status: "reserved",
    });

    fireEvent.click(statusButton("Luna", "Rezerviran"));

    await waitFor(() => expect(updateListing).toHaveBeenCalled());
    expect(screen.queryByText(/trenutni filter skrije/)).toBeNull();
  });
});

/** The six answers the published dataset reports, all given. */
const ANSWERED_PUBLISHED: PortalPublished = {
  size: "large",
  energy: "lively",
  goodWithKids: "no",
  goodWithDogs: "yes",
  goodWithCats: "no",
  apartmentOk: "yes",
};

// The published dataset carries the reviewed enrichment the crawled values
// lack, and what the public site already shows is not missing.
describe("the missing marks on the list", () => {
  it("count an answer the public site shows as given", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({
        id: "ljubljana:1",
        species: "dog",
        name: "Rex",
        // Kids and the flat are all the public site leaves open.
        published: {
          ...ANSWERED_PUBLISHED,
          goodWithKids: null,
          apartmentOk: null,
        },
      }),
    ]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(
      screen.getByRole("link", { name: missingCountLabel(2) }),
    ).toBeTruthy();
  });

  it("leave out of Za pregled an animal the public site answers in full", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      // Both statuses are the shelter's own, so only the answers count.
      animal({
        id: "ljubljana:1",
        name: "Rex",
        overrides: { status: "available" },
        published: ANSWERED_PUBLISHED,
      }),
      animal({
        id: "ljubljana:2",
        name: "Bor",
        overrides: { status: "available" },
      }),
    ]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: new RegExp(`^${portalText.reviewChip}\\s*1$`) }),
    ).toBeTruthy();
  });
});

describe("the way into the quick answers", () => {
  /** The five answers a dog is asked, all given. */
  const ANSWERED: Partial<PortalAnimal> = {
    goodWithKids: "yes",
    goodWithDogs: "no",
    goodWithCats: "unknown",
    size: "medium",
    energy: "calm",
  };

  function quickLink(): HTMLElement | null {
    return screen.queryByRole("link", { name: portalText.quickNoticeAction });
  }

  it("counts the animals still missing an answer and opens the round", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", species: "dog", name: "Rex" }),
      // Only the size is missing, and a dog is asked its size.
      animal({ id: "ljubljana:2", species: "dog", name: "Bor", ...ANSWERED, size: null }),
      animal({ id: "ljubljana:3", species: "dog", name: "Luka", ...ANSWERED }),
    ]);
    renderWorkspace();

    await waitFor(() => expect(quickLink()).toBeTruthy());
    expect(
      screen.getByText(fill(portalText.quickNoticeMany, { count: 2 })),
    ).toBeTruthy();
    expect(quickLink()?.getAttribute("href")).toBe(
      "/portal/odgovori?zavetisce=ljubljana",
    );
  });

  // A cat is never asked its size, on the public site or here, and an animal
  // that has gone home can no longer be found by anyone searching.
  it("leaves out a cat's size and an adopted animal", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", species: "cat", name: "Muri", ...ANSWERED, size: null }),
      animal({ id: "ljubljana:2", species: "dog", name: "Rex", status: "adopted" }),
      animal({ id: "ljubljana:3", species: "dog", name: "Bor" }),
    ]);
    renderWorkspace();

    await waitFor(() => expect(quickLink()).toBeTruthy());
    expect(
      screen.getByText(fill(portalText.quickNoticeOne, { count: 1 })),
    ).toBeTruthy();
  });

  it("is gone once every animal has its answers", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", species: "dog", name: "Rex", ...ANSWERED }),
    ]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(quickLink()).toBeNull();
  });

  it("does not count an animal whose answers the public site already shows", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", species: "dog", name: "Rex" }),
      animal({
        id: "ljubljana:2",
        species: "dog",
        name: "Bor",
        published: { ...ANSWERED_PUBLISHED, apartmentOk: null },
      }),
    ]);
    renderWorkspace();

    await waitFor(() => expect(quickLink()).toBeTruthy());
    expect(
      screen.getByText(fill(portalText.quickNoticeOne, { count: 1 })),
    ).toBeTruthy();
  });

  it("asks a shelter that writes its own listings the same questions", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([
      LISTING,
      { ...LISTING, id: "b2c3", name: "Mica", goodWithKids: "yes", goodWithDogs: "yes", goodWithCats: "yes", energy: "lively" },
    ]);
    renderWorkspace();

    await waitFor(() => expect(quickLink()).toBeTruthy());
    expect(
      screen.getByText(fill(portalText.quickNoticeOne, { count: 1 })),
    ).toBeTruthy();
    expect(quickLink()?.getAttribute("href")).toBe(
      "/portal/odgovori?zavetisce=johanca",
    );
  });
});
