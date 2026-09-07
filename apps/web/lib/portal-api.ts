// Client for the shelter portal API (apps/portal). The portal is the only
// part of the site that talks to a server at runtime; the rest is a static
// export. The session lives in a cookie the API sets, so every request has to
// carry credentials, and a 401 is the one error the UI reacts to by itself.

export const DEFAULT_PORTAL_API = "http://localhost:8000";
export const PRODUCTION_PORTAL_API = "https://api.posvoji.si";

/** Base URL without a trailing slash, so paths can be concatenated. */
export function portalBaseUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_PORTAL_API,
  production: boolean = process.env.NODE_ENV === "production",
): string {
  const value = raw?.trim();
  const candidate = value
    ? value
    : production
      ? PRODUCTION_PORTAL_API
      : DEFAULT_PORTAL_API;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("NEXT_PUBLIC_PORTAL_API must be an absolute HTTP(S) URL");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "NEXT_PUBLIC_PORTAL_API must be an HTTP(S) URL without credentials, a query, or a fragment",
    );
  }
  return candidate.replace(/\/+$/, "");
}

export function portalUrl(path: string): string {
  return `${portalBaseUrl()}${path}`;
}

/**
 * How this shelter's animals reach the site. "manual" is the shelter with no
 * catalogue we can crawl: it writes its listings in the portal, so the
 * workspace opens a different editor for it (see docs/MANUAL-LISTINGS.md).
 */
export const PORTAL_INGESTIONS = ["scrape", "api", "rss", "manual"] as const;
export type PortalIngestion = (typeof PORTAL_INGESTIONS)[number];

// city feeds the public animal address (see lib/animal-path.ts). Optional so
// a session served by an older API still parses; the link falls back to the
// path's own "slovenija" segment through an empty city.
//
// ingestion is optional for the same reason. An API that predates manual
// listings reports no mode, and a shelter with no mode is a crawled one:
// that is what every shelter was before this field existed.
export type PortalShelter = {
  slug: string;
  name: string;
  city?: string;
  ingestion?: PortalIngestion;
};

/** Whether this shelter writes its own listings rather than being crawled. */
export function isManualShelter(shelter: PortalShelter): boolean {
  return shelter.ingestion === "manual";
}

export type PortalSession = { email: string; shelters: PortalShelter[] };

export const PORTAL_STATUSES = [
  "available",
  "reserved",
  "adopted",
  "hold",
] as const;
export type PortalStatus = (typeof PORTAL_STATUSES)[number];

export const PORTAL_SEXES = ["male", "female", "unknown"] as const;
export type PortalSex = (typeof PORTAL_SEXES)[number];

export const PORTAL_SIZES = ["small", "medium", "large"] as const;
export type PortalSize = (typeof PORTAL_SIZES)[number];

/**
 * How much the animal wants to do in a day. Almost no shelter site states
 * this in a form the crawler can read, so for most animals this is where the
 * level comes from.
 */
export const PORTAL_ENERGIES = ["calm", "balanced", "lively"] as const;
export type PortalEnergy = (typeof PORTAL_ENERGIES)[number];

/** Answers to "does this animal get on with kids, dogs, cats". */
export const PORTAL_COMPATIBILITIES = ["yes", "no", "unknown"] as const;
export type PortalCompatibility = (typeof PORTAL_COMPATIBILITIES)[number];

/**
 * The species a manual listing can be. The same four the schema knows, spelt
 * out here rather than imported so the API client stays free of zod; the
 * editor's cards are built from SPECIES_ORDER and would fail to compile
 * against this if the two ever drifted.
 */
export const PORTAL_SPECIES = ["dog", "cat", "rabbit", "other"] as const;
export type PortalSpecies = (typeof PORTAL_SPECIES)[number];

/** The fields a shelter may override. The editor orders them its own way. */
export const PORTAL_FIELDS = [
  "name",
  "status",
  "sex",
  "breed",
  "birthDate",
  "approximateAgeMonths",
  "size",
  "energy",
  "goodWithKids",
  "goodWithDogs",
  "goodWithCats",
  "apartmentOk",
  "specialNeeds",
  "shortDescription",
] as const;
export type PortalField = (typeof PORTAL_FIELDS)[number];

/** One animal, crawled values already merged with the shelter's overrides. */
export type PortalAnimal = {
  id: string;
  species: string | null;
  status: string | null;
  name: string | null;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  size: string | null;
  energy: string | null;
  goodWithKids: string | null;
  goodWithDogs: string | null;
  goodWithCats: string | null;
  apartmentOk: string | null;
  specialNeeds: boolean | null;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  /** Only the fields the shelter changed, with the value it changed them to. */
  overrides: Partial<Record<PortalField, unknown>>;
};

/**
 * A partial update. A key that is absent leaves the override alone, an
 * explicit null clears it and the crawled value applies again.
 */
export type PortalAnimalPatch = {
  name?: string | null;
  status?: PortalStatus | null;
  sex?: PortalSex | null;
  breed?: string | null;
  /** "YYYY-MM-DD". */
  birthDate?: string | null;
  approximateAgeMonths?: number | null;
  size?: PortalSize | null;
  energy?: PortalEnergy | null;
  goodWithKids?: PortalCompatibility | null;
  goodWithDogs?: PortalCompatibility | null;
  goodWithCats?: PortalCompatibility | null;
  apartmentOk?: PortalCompatibility | null;
  specialNeeds?: boolean | null;
  shortDescription?: string | null;
};

/** One stored photograph of a listing, as the portal re-encoded it. */
export type PortalListingPhoto = {
  id: number;
  /** Absolute, served by the API host. */
  url: string;
  width: number;
  height: number;
};

/**
 * One manual listing, whole. There is no crawled record underneath, so unlike
 * PortalAnimal nothing here is merged from two sources and there are no
 * overrides: what the shelter typed is the animal.
 *
 * The optional fields keep their nulls. The export drops them, but the editor
 * has to be able to tell a field the shelter cleared from one it never filled
 * in, and both read as null here.
 */
export type PortalListing = {
  providerId: string;
  /** The UUID the portal minted. Ingest builds `<providerId>:<id>` from it. */
  id: string;
  species: string;
  status: string;
  name: string;
  sex: string | null;
  breed: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  size: string | null;
  energy: string | null;
  goodWithKids: string | null;
  goodWithDogs: string | null;
  goodWithCats: string | null;
  apartmentOk: string | null;
  specialNeeds: boolean | null;
  shortDescription: string | null;
  /** Ordered for display: the first is the one an adopter sees first. */
  photos: PortalListingPhoto[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/**
 * What a create or an edit sends. Not a patch: the API replaces the whole
 * listing every time, so every field travels and a null is the shelter not
 * stating it. Photos are not in here; they have routes of their own.
 */
export type PortalListingInput = {
  species: PortalSpecies;
  name: string;
  status: PortalStatus;
  sex: PortalSex | null;
  breed: string | null;
  /** "YYYY-MM-DD". */
  birthDate: string | null;
  approximateAgeMonths: number | null;
  size: PortalSize | null;
  energy: PortalEnergy | null;
  goodWithKids: PortalCompatibility | null;
  goodWithDogs: PortalCompatibility | null;
  goodWithCats: PortalCompatibility | null;
  apartmentOk: PortalCompatibility | null;
  specialNeeds: boolean | null;
  shortDescription: string | null;
};

export type PortalErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "invalid"
  | "throttled"
  | "server";

function kindFor(status: number): PortalErrorKind {
  if (status === 0) return "network";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 400 || status === 422) return "invalid";
  // The login link is rate limited per address and per network. Kept apart
  // from "server": nothing is broken, and the shelter only has to wait.
  if (status === 429) return "throttled";
  return "server";
}

/**
 * What a failure carries beyond its status and detail. Both parts are set by
 * one kind of failure each, so they are named rather than positional: a
 * throttled request has no fields and a rejected payload has no wait.
 */
export type PortalErrorExtra = {
  fields?: readonly string[];
  retryAfterSeconds?: number;
};

/**
 * Every failure the client raises, network included. `kind` is what callers
 * branch on: "unauthorized" is the one that sends the visitor back to the
 * login page.
 */
export class PortalError extends Error {
  readonly status: number;
  readonly kind: PortalErrorKind;
  /**
   * The API's own `detail`, when it sent one, as a single line. A validation
   * failure's list of entries is flattened to "field: message" pairs. Not
   * shown to shelters as it is.
   */
  readonly detail?: string;
  /**
   * The payload fields a validation failure pointed at, in the API's own
   * keys and without repeats. Empty for every other failure, so the message
   * built from it can name what to fix rather than say "a value".
   */
  readonly fields: readonly string[];
  /**
   * How long the API asked the caller to wait, in seconds. Present only when
   * it sent a Retry-After the client could read, so a message built from it
   * needs a wording for the case where there is none.
   */
  readonly retryAfterSeconds?: number;

  constructor(status: number, detail?: string, extra: PortalErrorExtra = {}) {
    const kind = kindFor(status);
    super(detail ? `${kind} (${status}): ${detail}` : `${kind} (${status})`);
    this.name = "PortalError";
    this.status = status;
    this.kind = kind;
    this.detail = detail;
    this.fields = extra.fields ?? [];
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof PortalError && error.kind === "unauthorized";
}

type Failure = { detail?: string; fields: string[] };

// django-ninja answers a 422 with one entry per rejected value:
// { type, loc: ["body", "payload", "<field>"], msg }. The field is the last
// segment of loc that is not one of these wrappers; a segment that is a list
// index is a number and is skipped the same way.
const LOC_WRAPPERS = new Set(["body", "payload"]);

function fieldOf(loc: unknown): string | undefined {
  if (!Array.isArray(loc)) return undefined;
  for (let index = loc.length - 1; index >= 0; index -= 1) {
    const segment: unknown = loc[index];
    if (typeof segment === "string" && !LOC_WRAPPERS.has(segment)) {
      return segment;
    }
  }
  return undefined;
}

/** A string detail as it came; a list detail as fields and one line of text. */
function parseDetail(detail: unknown): Failure {
  if (typeof detail === "string") return { detail, fields: [] };
  if (!Array.isArray(detail)) return { fields: [] };

  const fields: string[] = [];
  const lines: string[] = [];
  for (const entry of detail as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const { loc, msg } = entry as { loc?: unknown; msg?: unknown };
    const field = fieldOf(loc);
    const text = typeof msg === "string" ? msg : undefined;
    if (field && !fields.includes(field)) fields.push(field);
    if (field && text) lines.push(`${field}: ${text}`);
    else if (field) lines.push(field);
    else if (text) lines.push(text);
  }
  return { detail: lines.length > 0 ? lines.join("; ") : undefined, fields };
}

/**
 * The body as JSON. Undefined when there is none: a DELETE may answer 200
 * with nothing to say. Throws when there is a body and it is not JSON.
 */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return undefined;
  return JSON.parse(text) as unknown;
}

async function readFailure(response: Response): Promise<Failure> {
  try {
    const body = await readJson(response);
    if (body && typeof body === "object" && "detail" in body) {
      return parseDetail((body as { detail: unknown }).detail);
    }
  } catch {
    // A proxy or a crash answers with something that is not JSON. The status
    // is enough to tell the shelter what happened.
  }
  return { fields: [] };
}

// Django's text for a stale or missing proof is "CSRF check Failed", and
// nothing else the API refuses with a 403 mentions the check.
function isCsrfFailure(failure: Failure): boolean {
  return failure.detail !== undefined && /csrf/i.test(failure.detail);
}

/**
 * The wait a Retry-After header states, in seconds.
 *
 * Only the delta form is read. The header may also carry an HTTP date, which
 * is measured against the visitor's clock rather than the server's, and a wait
 * computed from a clock that is off is worse than no number at all. A header
 * the CORS policy did not expose reads as absent here, which is why every
 * caller has to have something to say without one.
 */
function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

type PortalRequestInit = {
  method: string;
  body?: unknown;
  csrf?: boolean;
};

let cachedCsrfToken: string | undefined;
let csrfTokenRequest: Promise<string> | undefined;

/** Drops the proof after an authentication endpoint may have rotated it. */
export function clearCsrfToken(): void {
  cachedCsrfToken = undefined;
  csrfTokenRequest = undefined;
}

function clearCsrfTokenIfCurrent(token: string): void {
  if (cachedCsrfToken === token) clearCsrfToken();
}

async function request<T>(
  path: string,
  init: PortalRequestInit = { method: "GET" },
): Promise<T> {
  // A photo upload is multipart. Its content type carries the boundary that
  // separates the parts, which only fetch can write, so the header is left
  // off and the body goes out as it arrived. Everything else is JSON.
  const form = init.body instanceof FormData ? init.body : null;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined && form === null) {
    headers["Content-Type"] = "application/json";
  }
  if (init.csrf) headers["X-CSRFToken"] = await fetchCsrfToken();

  const send = async (): Promise<Response> => {
    try {
      return await fetch(portalUrl(path), {
        method: init.method,
        // The API authenticates with a session cookie and verifies the separate
        // CSRF cookie/header proof on unsafe requests. Both cookies must travel.
        credentials: "include",
        headers: { ...headers },
        // FormData holds its parts in memory rather than streaming them, so
        // the stale-token retry below can send the same body a second time.
        body:
          init.body === undefined
            ? undefined
            : (form ?? JSON.stringify(init.body)),
      });
    } catch {
      // An unreachable API and a rejected preflight both land here, with no
      // status of their own.
      throw new PortalError(0);
    }
  };

  let response = await send();
  let failure = response.ok ? null : await readFailure(response);
  // A 403 on an unsafe request is either a stale proof or a shelter the
  // account is not a member of, and only the first is worth a second try.
  // Once: a retry that fails the same way has nothing left to refresh.
  if (
    failure &&
    init.csrf &&
    response.status === 403 &&
    isCsrfFailure(failure)
  ) {
    clearCsrfTokenIfCurrent(headers["X-CSRFToken"]);
    headers["X-CSRFToken"] = await fetchCsrfToken();
    response = await send();
    failure = response.ok ? null : await readFailure(response);
  }

  if (failure) {
    throw new PortalError(response.status, failure.detail, {
      fields: failure.fields,
      retryAfterSeconds: retryAfterSeconds(response),
    });
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await readJson(response)) as T;
  } catch {
    // A 200 whose body is not JSON is not the API answering: a captive
    // portal or a misrouted proxy is. Reported as the server fault it is.
    throw new PortalError(response.status, "body is not JSON");
  }
}

/**
 * Seeds Django's CSRF cookie and returns the matching request token.
 *
 * The frontend and API may live on sibling hosts, so JavaScript cannot safely
 * assume it can read the API's cookie. Returning the token from the API keeps
 * the cookie host-only while credentials: "include" sends it back for Django
 * to compare with this header value.
 */
export function fetchCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return Promise.resolve(cachedCsrfToken);
  if (csrfTokenRequest) return csrfTokenRequest;

  const pending = request<{ csrfToken?: unknown }>("/api/auth/csrf")
    .then((payload) => {
      if (
        typeof payload.csrfToken !== "string" ||
        payload.csrfToken.length === 0
      ) {
        throw new PortalError(500, "invalid CSRF response");
      }
      if (csrfTokenRequest === pending) cachedCsrfToken = payload.csrfToken;
      return payload.csrfToken;
    })
    .finally(() => {
      if (csrfTokenRequest === pending) csrfTokenRequest = undefined;
    });
  csrfTokenRequest = pending;
  return pending;
}

/**
 * A 204 never reveals whether the account exists; throttling/network errors
 * reject. `next` is the portal page the shelter was on, for the link to
 * carry into the tab it opens. The caller vets it, and the field stays out of
 * the body when there is none.
 */
export function requestLoginLink(
  email: string,
  next: string | null = null,
): Promise<void> {
  return request<void>("/api/auth/request-link", {
    method: "POST",
    body: next === null ? { email } : { email, next },
    csrf: true,
  });
}

// React Strict Mode deliberately re-runs effects in development. A magic link
// is single-use, so two overlapping exchanges for the same token must share
// the first request rather than race and let the replay overwrite success with
// an "expired" answer.
const verificationRequests = new Map<string, Promise<PortalSession>>();

/** Exchanges a magic-link token for a session. 401 means expired or forged. */
export function verifyToken(token: string): Promise<PortalSession> {
  const pending = verificationRequests.get(token);
  if (pending) return pending;

  const verification = request<PortalSession>("/api/auth/verify", {
    method: "POST",
    body: { token },
    csrf: true,
  }).finally(() => {
    clearCsrfToken();
    if (verificationRequests.get(token) === verification) {
      verificationRequests.delete(token);
    }
  });
  verificationRequests.set(token, verification);
  return verification;
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", {
    method: "POST",
    csrf: true,
  }).finally(clearCsrfToken);
}

/** The signed-in shelter account. Raises an "unauthorized" error when there is none. */
export function fetchSession(): Promise<PortalSession> {
  return request<PortalSession>("/api/me", { method: "GET" });
}

export function fetchAnimals(slug: string): Promise<PortalAnimal[]> {
  return request<PortalAnimal[]>(
    `/api/shelters/${encodeURIComponent(slug)}/animals`,
    { method: "GET" },
  );
}

/** Upserts the override and answers with the animal as it now reads. */
export function saveAnimal(
  slug: string,
  animalId: string,
  patch: PortalAnimalPatch,
): Promise<PortalAnimal> {
  return request<PortalAnimal>(
    `/api/shelters/${encodeURIComponent(slug)}/animals/${encodeURIComponent(animalId)}`,
    { method: "PUT", body: patch, csrf: true },
  );
}

// Manual listings. Every route below answers 404 for a crawled shelter: the
// routes are not a permission that shelter is missing, they are not there at
// all. See docs/MANUAL-LISTINGS.md.

function listingsPath(slug: string): string {
  return `/api/shelters/${encodeURIComponent(slug)}/listings`;
}

function listingPath(slug: string, listingId: string): string {
  return `${listingsPath(slug)}/${encodeURIComponent(listingId)}`;
}

/** The shelter's live listings, ordered by name. Archived ones are gone. */
export function fetchListings(slug: string): Promise<PortalListing[]> {
  return request<PortalListing[]>(listingsPath(slug), { method: "GET" });
}

/** Answers 201 with the listing, its minted id and an empty photo list. */
export function createListing(
  slug: string,
  input: PortalListingInput,
): Promise<PortalListing> {
  return request<PortalListing>(listingsPath(slug), {
    method: "POST",
    body: input,
    csrf: true,
  });
}

/** A full replace, not a patch: what is not sent is what the shelter cleared. */
export function updateListing(
  slug: string,
  listingId: string,
  input: PortalListingInput,
): Promise<PortalListing> {
  return request<PortalListing>(listingPath(slug, listingId), {
    method: "PUT",
    body: input,
    csrf: true,
  });
}

/**
 * The shelter's delete. The row stays so its uuid is never handed out again,
 * and the listing leaves the export, which takes the animal off the public
 * site on the next run.
 */
export function archiveListing(slug: string, listingId: string): Promise<void> {
  return request<void>(listingPath(slug, listingId), {
    method: "DELETE",
    csrf: true,
  });
}

/**
 * Sends one photograph and answers with the stored copy.
 *
 * The portal re-encodes every upload and names the file after a hash of the
 * bytes it would write, so the same photograph sent twice answers 200 with
 * the photo that is already there instead of 201 with a second copy. Both
 * carry the same shape, so a caller that keys on the id needs no branch.
 */
export function uploadListingPhoto(
  slug: string,
  listingId: string,
  file: File,
): Promise<PortalListingPhoto> {
  const body = new FormData();
  body.append("file", file);
  return request<PortalListingPhoto>(`${listingPath(slug, listingId)}/photos`, {
    method: "POST",
    body,
    csrf: true,
  });
}

export function deleteListingPhoto(
  slug: string,
  listingId: string,
  photoId: number,
): Promise<void> {
  return request<void>(
    `${listingPath(slug, listingId)}/photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE", csrf: true },
  );
}
