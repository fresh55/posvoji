import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PORTAL_API,
  PortalError,
  fetchAnimals,
  fetchSession,
  isUnauthorized,
  logout,
  portalBaseUrl,
  portalUrl,
  requestLoginLink,
  saveAnimal,
  verifyToken,
} from "./portal-api";

type FetchArgs = [input: string, init: RequestInit];

const fetchMock = vi.fn();

function respond(
  status: number,
  body?: unknown,
  { json = true }: { json?: boolean } = {},
) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: json
      ? () => Promise.resolve(body)
      : () => Promise.reject(new SyntaxError("not json")),
  });
}

function lastCall(): FetchArgs {
  return fetchMock.mock.calls.at(-1) as FetchArgs;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("base URL", () => {
  it("falls back to the local API when the variable is unset or blank", () => {
    expect(portalBaseUrl(undefined)).toBe(DEFAULT_PORTAL_API);
    expect(portalBaseUrl("   ")).toBe(DEFAULT_PORTAL_API);
  });

  it("trims trailing slashes so paths concatenate cleanly", () => {
    expect(portalBaseUrl("https://api.posvoji.si/")).toBe(
      "https://api.posvoji.si",
    );
    expect(portalBaseUrl("https://api.posvoji.si///")).toBe(
      "https://api.posvoji.si",
    );
  });

  it("builds request URLs from the base", () => {
    expect(portalUrl("/api/me")).toBe(`${DEFAULT_PORTAL_API}/api/me`);
  });
});

describe("requests", () => {
  it("sends the session cookie with every call", async () => {
    respond(200, { email: "a@b.si", shelters: [] });
    await fetchSession();

    const [url, init] = lastCall();
    expect(url).toBe(`${DEFAULT_PORTAL_API}/api/me`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  it("omits a body and its content type on a read", async () => {
    respond(200, []);
    await fetchAnimals("zonzani");

    const [, init] = lastCall();
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("posts the login address as JSON", async () => {
    respond(204);
    await requestLoginLink("info@zavetisce.si");

    const [url, init] = lastCall();
    expect(url).toBe(`${DEFAULT_PORTAL_API}/api/auth/request-link`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ email: "info@zavetisce.si" }));
  });

  it("resolves a 204 with no body to parse", async () => {
    respond(204);
    await expect(logout()).resolves.toBeUndefined();
  });

  it("escapes the slug and the animal id in the path", async () => {
    respond(200, { id: "zonzani:12/3", overrides: {} });
    await saveAnimal("zon zani", "zonzani:12/3", { status: "adopted" });

    const [url, init] = lastCall();
    expect(url).toBe(
      `${DEFAULT_PORTAL_API}/api/shelters/zon%20zani/animals/zonzani%3A12%2F3`,
    );
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ status: "adopted" }));
  });

  it("keeps an explicit null in the body, because null clears an override", async () => {
    respond(200, { id: "rex", overrides: {} });
    await saveAnimal("zonzani", "rex", { name: null });

    const [, init] = lastCall();
    expect(init.body).toBe('{"name":null}');
  });

  it("returns the merged animal the API answers with", async () => {
    const animal = { id: "rex", name: "Rex", overrides: { name: "Rex" } };
    respond(200, animal);

    await expect(saveAnimal("zonzani", "rex", { name: "Rex" })).resolves.toEqual(
      animal,
    );
  });
});

describe("errors", () => {
  it("marks 401 so the UI can send the visitor back to the login page", async () => {
    respond(401, { detail: "invalid or expired token" });

    const error = await verifyToken("stale").catch((reason) => reason);
    expect(error).toBeInstanceOf(PortalError);
    expect(error.status).toBe(401);
    expect(error.kind).toBe("unauthorized");
    expect(error.detail).toBe("invalid or expired token");
    expect(isUnauthorized(error)).toBe(true);
  });

  it("keeps the other statuses apart from 401", async () => {
    const cases: [number, string][] = [
      [403, "forbidden"],
      [404, "notFound"],
      [422, "invalid"],
      [500, "server"],
    ];

    for (const [status, kind] of cases) {
      respond(status, { detail: "no" });
      const error = await fetchAnimals("zonzani").catch((reason) => reason);
      expect(error.kind).toBe(kind);
      expect(isUnauthorized(error)).toBe(false);
    }
  });

  it("reports an unreachable API as a network failure, not a server one", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = await fetchSession().catch((reason) => reason);
    expect(error).toBeInstanceOf(PortalError);
    expect(error.kind).toBe("network");
    expect(error.status).toBe(0);
  });

  it("survives an error body that is not JSON", async () => {
    respond(502, undefined, { json: false });

    const error = await fetchSession().catch((reason) => reason);
    expect(error.kind).toBe("server");
    expect(error.detail).toBeUndefined();
  });
});
