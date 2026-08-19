// Client for the shelter portal API (apps/portal). The portal is the only
// part of the site that talks to a server at runtime; the rest is a static
// export. The session lives in a cookie the API sets, so every request has to
// carry credentials, and a 401 is the one error the UI reacts to by itself.

export const DEFAULT_PORTAL_API = "http://localhost:8000";

/** Base URL without a trailing slash, so paths can be concatenated. */
export function portalBaseUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_PORTAL_API,
): string {
  const value = raw?.trim();
  return (value ? value : DEFAULT_PORTAL_API).replace(/\/+$/, "");
}

export function portalUrl(path: string): string {
  return `${portalBaseUrl()}${path}`;
}

export type PortalShelter = { slug: string; name: string };

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

/** The fields a shelter may override, in the order the editor shows them. */
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

export type PortalErrorKind =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "invalid"
  | "server";

function kindFor(status: number): PortalErrorKind {
  if (status === 0) return "network";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 400 || status === 422) return "invalid";
  return "server";
}

/**
 * Every failure the client raises, network included. `kind` is what callers
 * branch on: "unauthorized" is the one that sends the visitor back to the
 * login page.
 */
export class PortalError extends Error {
  readonly status: number;
  readonly kind: PortalErrorKind;
  /** The API's own `detail`, when it sent one. Not shown to shelters. */
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    const kind = kindFor(status);
    super(detail ? `${kind} (${status}): ${detail}` : `${kind} (${status})`);
    this.name = "PortalError";
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof PortalError && error.kind === "unauthorized";
}

async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
  } catch {
    // A proxy or a crash answers with something that is not JSON. The status
    // is enough to tell the shelter what happened.
  }
  return undefined;
}

async function request<T>(
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(portalUrl(path), {
      method: init.method,
      // The API authenticates with a session cookie and rejects cross site
      // requests through CORS, so the cookie has to travel with every call.
      credentials: "include",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // An unreachable API and a rejected preflight both land here, with no
    // status of their own.
    throw new PortalError(0);
  }

  if (!response.ok) throw new PortalError(response.status, await readDetail(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Always resolves. The API answers 204 whether or not the account exists. */
export function requestLoginLink(email: string): Promise<void> {
  return request<void>("/api/auth/request-link", {
    method: "POST",
    body: { email },
  });
}

/** Exchanges a magic-link token for a session. 401 means expired or forged. */
export function verifyToken(token: string): Promise<PortalSession> {
  return request<PortalSession>("/api/auth/verify", {
    method: "POST",
    body: { token },
  });
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST" });
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
    { method: "PUT", body: patch },
  );
}
