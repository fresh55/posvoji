import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPortalOverrides, portalIntegrationEnabled } from "./portal-client";

// The three variables the whole integration is configured from. Saved and put
// back so a run of the suite cannot leak one test's configuration into the
// next, or into a shell that had the real ones set.
const VARIABLES = [
  "PORTAL_EXPORT_URL",
  "PORTAL_EXPORT_TOKEN",
  "PORTAL_EXPORT_FIXTURE",
] as const;

describe("portal configuration", () => {
  const original = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of VARIABLES) {
      original.set(name, process.env[name]);
      delete process.env[name];
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("fetch should not be called in this test");
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const name of VARIABLES) {
      const before = original.get(name);
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is disabled when neither the URL nor the token is set", async () => {
    expect(portalIntegrationEnabled()).toBe(false);
    await expect(fetchPortalOverrides()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is enabled when both the URL and the token are set", () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";

    expect(portalIntegrationEnabled()).toBe(true);
  });

  it("refuses the run when only the URL is set", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";

    // A lost token used to disable the overrides quietly and republish the
    // raw crawl values at exit 0.
    expect(() => portalIntegrationEnabled()).toThrow(/PORTAL_EXPORT_TOKEN/);
    await expect(fetchPortalOverrides()).rejects.toThrow(
      /PORTAL_EXPORT_TOKEN is not/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses the run when only the token is set", async () => {
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";

    expect(() => portalIntegrationEnabled()).toThrow(/PORTAL_EXPORT_URL/);
    await expect(fetchPortalOverrides()).rejects.toThrow(
      /PORTAL_EXPORT_URL is not/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the predicate and the fetch reading the same configuration", () => {
    // A fixture is the third way to be configured, and the pipeline has to
    // see it as enabled: corrections do reach the dataset.
    process.env["PORTAL_EXPORT_FIXTURE"] = "fixtures/portal-export.example.json";

    expect(portalIntegrationEnabled()).toBe(true);
  });

  it("gets past the configuration gate without touching the network", async () => {
    process.env["PORTAL_EXPORT_URL"] = "not-a-url";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";

    // The URL is rejected where the endpoint is built, which is after the
    // configuration check and before the request.
    await expect(fetchPortalOverrides()).rejects.toThrow(/HTTP\(S\) URL/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
