import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PORTAL_API,
  PRODUCTION_PORTAL_API,
  PortalError,
  archiveListing,
  clearCsrfToken,
  createListing,
  deleteListingPhoto,
  fetchAnimals,
  fetchCsrfToken,
  fetchListings,
  fetchSession,
  isUnauthorized,
  logout,
  portalBaseUrl,
  portalUrl,
  requestLoginLink,
  saveAnimal,
  updateListing,
  uploadListingPhoto,
  verifyToken,
  type PortalListingInput,
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

function respondWithCsrf(status: number, body?: unknown) {
  respond(200, { csrfToken: "test-csrf-token" });
  respond(status, body);
}

beforeEach(() => {
  clearCsrfToken();
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

  it("never falls back to a visitor's localhost in a production build", () => {
    expect(portalBaseUrl(undefined, true)).toBe(PRODUCTION_PORTAL_API);
    expect(portalBaseUrl("   ", true)).toBe(PRODUCTION_PORTAL_API);
  });

  it("trims trailing slashes so paths concatenate cleanly", () => {
    expect(portalBaseUrl("https://api.posvoji.si/")).toBe(
      "https://api.posvoji.si",
    );
    expect(portalBaseUrl("https://api.posvoji.si///")).toBe(
      "https://api.posvoji.si",
    );
  });

  it.each([
    "/relative",
    "javascript:alert(1)",
    "https://user:secret@api.posvoji.si",
    "https://api.posvoji.si?redirect=elsewhere",
  ])("rejects the unsafe configured base %s", (value) => {
    expect(() => portalBaseUrl(value)).toThrow(/HTTP\(S\) URL/);
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
    respondWithCsrf(204);
    await requestLoginLink("info@zavetisce.si");

    const [url, init] = lastCall();
    expect(url).toBe(`${DEFAULT_PORTAL_API}/api/auth/request-link`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-CSRFToken": "test-csrf-token",
    });
    expect(init.body).toBe(JSON.stringify({ email: "info@zavetisce.si" }));
  });

  it("gets a CSRF token with the API cookie included", async () => {
    respond(200, { csrfToken: "abc123" });

    await expect(fetchCsrfToken()).resolves.toBe("abc123");
    const [url, init] = lastCall();
    expect(url).toBe(`${DEFAULT_PORTAL_API}/api/auth/csrf`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  it("deduplicates and caches the CSRF bootstrap", async () => {
    respond(200, { csrfToken: "abc123" });

    await expect(
      Promise.all([fetchCsrfToken(), fetchCsrfToken()]),
    ).resolves.toEqual(["abc123", "abc123"]);
    await expect(fetchCsrfToken()).resolves.toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached CSRF token across unsafe requests", async () => {
    respond(200, { csrfToken: "abc123" });
    respond(200, { id: "one", overrides: {} });
    respond(200, { id: "two", overrides: {} });

    await saveAnimal("zonzani", "one", { name: "One" });
    await saveAnimal("zonzani", "two", { name: "Two" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "X-CSRFToken": "abc123",
    });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      "X-CSRFToken": "abc123",
    });
  });

  it("refreshes a stale CSRF token once after a 403", async () => {
    respond(200, { csrfToken: "stale" });
    respond(403, { detail: "CSRF failed" });
    respond(200, { csrfToken: "fresh" });
    respond(200, { id: "rex", overrides: {} });

    await expect(
      saveAnimal("zonzani", "rex", { name: "Rex" }),
    ).resolves.toMatchObject({ id: "rex" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "X-CSRFToken": "stale",
    });
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toMatchObject({
      "X-CSRFToken": "fresh",
    });
  });

  it("does not retry a second 403", async () => {
    respond(200, { csrfToken: "stale" });
    respond(403, { detail: "CSRF failed" });
    respond(200, { csrfToken: "fresh" });
    respond(403, { detail: "still forbidden" });

    const error = await saveAnimal("zonzani", "rex", { name: "Rex" }).catch(
      (reason) => reason,
    );

    expect(error).toBeInstanceOf(PortalError);
    expect(error.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("resolves a 204 with no body to parse", async () => {
    respondWithCsrf(204);
    await expect(logout()).resolves.toBeUndefined();
  });

  it("escapes the slug and the animal id in the path", async () => {
    respondWithCsrf(200, { id: "zonzani:12/3", overrides: {} });
    await saveAnimal("zon zani", "zonzani:12/3", { status: "adopted" });

    const [url, init] = lastCall();
    expect(url).toBe(
      `${DEFAULT_PORTAL_API}/api/shelters/zon%20zani/animals/zonzani%3A12%2F3`,
    );
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ status: "adopted" }));
  });

  it("keeps an explicit null in the body, because null clears an override", async () => {
    respondWithCsrf(200, { id: "rex", overrides: {} });
    await saveAnimal("zonzani", "rex", { name: null });

    const [, init] = lastCall();
    expect(init.body).toBe('{"name":null}');
  });

  it("returns the merged animal the API answers with", async () => {
    const animal = { id: "rex", name: "Rex", overrides: { name: "Rex" } };
    respondWithCsrf(200, animal);

    await expect(saveAnimal("zonzani", "rex", { name: "Rex" })).resolves.toEqual(
      animal,
    );
  });

  it("deduplicates overlapping exchanges of a single-use login token", async () => {
    const session = { email: "info@example.si", shelters: [] };
    respondWithCsrf(200, session);

    const first = verifyToken("one-time-token");
    const second = verifyToken("one-time-token");

    expect(second).toBe(first);
    await expect(first).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears the cached CSRF token after verification and logout", async () => {
    respond(200, { csrfToken: "before-login" });
    respond(200, { email: "info@example.si", shelters: [] });
    await verifyToken("rotating-token");

    respond(200, { csrfToken: "before-logout" });
    respond(204);
    await logout();

    respond(200, { csrfToken: "after-logout" });
    await expect(fetchCsrfToken()).resolves.toBe("after-logout");

    const csrfCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/auth/csrf"),
    );
    expect(csrfCalls).toHaveLength(3);
  });
});

describe("errors", () => {
  it("marks 401 so the UI can send the visitor back to the login page", async () => {
    respondWithCsrf(401, { detail: "invalid or expired token" });

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

  it("rejects a malformed CSRF bootstrap response", async () => {
    respond(200, {});

    const error = await requestLoginLink("info@example.si").catch(
      (reason) => reason,
    );
    expect(error).toBeInstanceOf(PortalError);
    expect(error.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("listings", () => {
  const LISTINGS = `${DEFAULT_PORTAL_API}/api/shelters/johanca/listings`;

  const input: PortalListingInput = {
    species: "cat",
    name: "Luna",
    status: "available",
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
  };

  const photo = {
    id: 7,
    url: `${DEFAULT_PORTAL_API}/media/listings/6d1c/3f2a9c.jpg`,
    width: 1600,
    height: 1200,
  };

  it("reads the shelter's listings", async () => {
    respond(200, []);
    await expect(fetchListings("johanca")).resolves.toEqual([]);

    const [url, init] = lastCall();
    expect(url).toBe(LISTINGS);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("posts a new listing whole, with every unset field as null", async () => {
    respondWithCsrf(201, { id: "6d1c", ...input, photos: [] });

    await expect(createListing("johanca", input)).resolves.toMatchObject({
      id: "6d1c",
    });

    const [url, init] = lastCall();
    expect(url).toBe(LISTINGS);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-CSRFToken": "test-csrf-token",
    });
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("replaces a listing with PUT, id escaped", async () => {
    respondWithCsrf(200, { id: "6d1c", ...input });

    await updateListing("johanca", "6d 1c", { ...input, status: "reserved" });

    const [url, init] = lastCall();
    expect(url).toBe(`${LISTINGS}/6d%201c`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      ...input,
      status: "reserved",
    });
  });

  it("archives with DELETE and resolves the empty 204", async () => {
    respondWithCsrf(204);

    await expect(archiveListing("johanca", "6d1c")).resolves.toBeUndefined();

    const [url, init] = lastCall();
    expect(url).toBe(`${LISTINGS}/6d1c`);
    expect(init.method).toBe("DELETE");
  });

  it("sends a photo as multipart and leaves the content type to fetch", async () => {
    respondWithCsrf(201, photo);
    const file = new File(["jpeg bytes"], "luna.jpg", { type: "image/jpeg" });

    await expect(
      uploadListingPhoto("johanca", "6d1c", file),
    ).resolves.toEqual(photo);

    const [url, init] = lastCall();
    expect(url).toBe(`${LISTINGS}/6d1c/photos`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const sent = (init.body as FormData).get("file");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("luna.jpg");
    // No Content-Type: fetch writes the multipart boundary into its own.
    expect(init.headers).toEqual({
      Accept: "application/json",
      "X-CSRFToken": "test-csrf-token",
    });
  });

  it("answers a duplicate (200) with the same shape as a new photo (201)", async () => {
    respondWithCsrf(200, photo);
    const file = new File(["jpeg bytes"], "luna.jpg", { type: "image/jpeg" });

    await expect(
      uploadListingPhoto("johanca", "6d1c", file),
    ).resolves.toEqual(photo);
  });

  it("resends the same multipart body after a stale-token 403", async () => {
    respond(200, { csrfToken: "stale" });
    respond(403, { detail: "CSRF failed" });
    respond(200, { csrfToken: "fresh" });
    respond(201, photo);
    const file = new File(["jpeg bytes"], "luna.jpg", { type: "image/jpeg" });

    await expect(
      uploadListingPhoto("johanca", "6d1c", file),
    ).resolves.toEqual(photo);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const first = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(second.body).toBe(first.body);
    expect(second.headers).toMatchObject({ "X-CSRFToken": "fresh" });
  });

  it("removes a photo by its id", async () => {
    respondWithCsrf(204);

    await expect(
      deleteListingPhoto("johanca", "6d1c", 7),
    ).resolves.toBeUndefined();

    const [url, init] = lastCall();
    expect(url).toBe(`${LISTINGS}/6d1c/photos/7`);
    expect(init.method).toBe("DELETE");
  });

  it("reports the 404 a crawled shelter gets as not found, not as a permission", async () => {
    respond(404, { detail: "not found" });

    const error = await fetchListings("ljubljana").catch((reason) => reason);
    expect(error).toBeInstanceOf(PortalError);
    expect(error.kind).toBe("notFound");
  });
});
