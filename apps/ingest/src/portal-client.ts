import { readFileSync } from "node:fs";
import type { ZodType } from "zod";
import {
  PortalExportPayload,
  type PortalExportPayload as PortalExportPayloadType,
} from "./portal-contract";
import {
  PortalListingsPayload,
  type PortalListingsPayload as PortalListingsPayloadType,
} from "./portal-listings-contract";

const PORTAL_EXPORT_TIMEOUT_MS = 30_000;
const PORTAL_EXPORT_MAX_BYTES = 5 * 1024 * 1024;

// Both feeds validate the same way. The label names the feed in the message,
// so a payload that fails says which of them it came from.
function parsePayload<T>(schema: ZodType<T>, label: string, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(
      `portal ${label} payload failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

// Both feeds hang off one base URL and one token, so the path is a parameter
// rather than two copies of the same validation.
function portalEndpoint(baseUrl: string, path: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("PORTAL_EXPORT_URL must be an absolute HTTP(S) URL");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("PORTAL_EXPORT_URL must be an absolute HTTP(S) URL");
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error(
      "PORTAL_EXPORT_URL must not contain credentials, a query, or a fragment",
    );
  }
  base.pathname = `${base.pathname.replace(/\/+$/, "")}${path}`;
  return base.href;
}

async function readBoundedBody(
  response: Response,
  url: string,
  label: string,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    BigInt(contentLength) > BigInt(PORTAL_EXPORT_MAX_BYTES)
  ) {
    throw new Error(
      `portal ${label} response exceeds ${PORTAL_EXPORT_MAX_BYTES} bytes: ${url}`,
    );
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > PORTAL_EXPORT_MAX_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new Error(
        `portal ${label} response exceeds ${PORTAL_EXPORT_MAX_BYTES} bytes: ${url}`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

type PortalConfig =
  | { kind: "fixture"; path: string }
  | { kind: "remote"; baseUrl: string; token: string }
  | { kind: "disabled" };

// The one place the environment variables are read, so the predicate below
// and every feed's fetch cannot disagree about whether this run has the
// portal. The fixture variable is the feed's own; the base URL and the token
// are shared by both.
//
// Half a configuration is refused rather than treated as "off". A deployment
// that lost one of the two secrets used to log a line and carry on with the
// raw crawl values, which republishes every correction the portal holds: an
// animal a shelter marked adopted is available again, at exit 0, on a run
// nobody had reason to look at.
function portalConfig(fixtureVar: string): PortalConfig {
  const fixturePath = process.env[fixtureVar];
  if (fixturePath) return { kind: "fixture", path: fixturePath };

  const baseUrl = process.env["PORTAL_EXPORT_URL"];
  const token = process.env["PORTAL_EXPORT_TOKEN"];
  if (baseUrl && token) return { kind: "remote", baseUrl, token };
  if (baseUrl || token) {
    const set = baseUrl ? "PORTAL_EXPORT_URL" : "PORTAL_EXPORT_TOKEN";
    const missing = baseUrl ? "PORTAL_EXPORT_TOKEN" : "PORTAL_EXPORT_URL";
    throw new Error(
      `${set} is set but ${missing} is not, so the portal integration is only ` +
        `half configured. Refusing the run: continuing would publish the raw ` +
        `crawl values and silently drop every correction the portal holds. ` +
        `Set ${missing}, or unset ${set} to run without the portal.`,
    );
  }
  return { kind: "disabled" };
}

// Whether this run has the portal integration configured at all, decided from
// the same three variables the override feed below reads: its fixture, the
// base URL and the token. It is a separate
// predicate because the pipeline has to know before the payload is fetched:
// the crawled-snapshot bootstrap in crawled-snapshot.ts is strict when
// corrections can reach the dataset and forgiving when they cannot. Both read
// portalConfig, which is what keeps them in step.
export function portalIntegrationEnabled(): boolean {
  return portalConfig("PORTAL_EXPORT_FIXTURE").kind !== "disabled";
}

// What one feed is: the fixture variable that stands in for the network, the
// path it reads, the nouns its messages use, what a 404 means for it, and the
// schema its payload is parsed with. Everything else is one implementation
// below, the byte cap, the timeout and the credential-free URL check
// included, so a change to any of those cannot reach one feed and miss the
// other.
interface PortalFeed<T> {
  // The noun this feed's console lines use.
  label: string;
  // The noun its errors use. The override feed says "export" there, after the
  // route it reads, and "overrides" in its logs, after what the payload
  // carries. Both wordings are kept as they were.
  errorLabel: string;
  fixtureVar: string;
  path: string;
  schema: ZodType<T>;
  // What a 404 means for this feed. Unset, it is a failure like any other
  // status. Set, it is an empty feed and the text says why that is expected.
  emptyOn404?: string;
}

async function fetchPortalFeed<T>(feed: PortalFeed<T>): Promise<T | null> {
  const config = portalConfig(feed.fixtureVar);
  if (config.kind === "fixture") {
    console.log(`portal: reading ${feed.label} from fixture ${config.path}`);
    return parsePayload(
      feed.schema,
      feed.errorLabel,
      JSON.parse(readFileSync(config.path, "utf8")),
    );
  }

  if (config.kind === "disabled") {
    console.log(
      `portal: ${feed.label} disabled (PORTAL_EXPORT_URL/PORTAL_EXPORT_TOKEN not set)`,
    );
    return null;
  }

  // This calls our own portal service, not a shelter website. PoliteClient's
  // crawling etiquette therefore does not apply.
  const url = portalEndpoint(config.baseUrl, feed.path);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(PORTAL_EXPORT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`portal ${feed.errorLabel} request failed: ${url}`, {
      cause: error,
    });
  }
  if (feed.emptyOn404 !== undefined && response.status === 404) {
    console.log(
      `portal: no ${feed.label} feed at ${url} (HTTP 404). ${feed.emptyOn404}`,
    );
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `portal ${feed.errorLabel} request failed: HTTP ${response.status} ${url}`,
    );
  }

  const text = await readBoundedBody(response, url, feed.errorLabel);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `portal ${feed.errorLabel} response is not valid JSON: ${url}`,
      { cause: error },
    );
  }
  return parsePayload(feed.schema, feed.errorLabel, body);
}

// Fetches the portal's current export, or returns null when the integration
// is not configured at all. A half configuration throws in portalConfig, and
// shape or HTTP failures abort the export, so the pipeline never writes a
// dataset with only some corrections applied.
export async function fetchPortalOverrides(): Promise<PortalExportPayloadType | null> {
  return fetchPortalFeed({
    label: "overrides",
    errorLabel: "export",
    fixtureVar: "PORTAL_EXPORT_FIXTURE",
    path: "/api/export",
    schema: PortalExportPayload,
  });
}

// The manual shelters' animals, from the same portal, the same base URL and
// the same token as the overrides above. See docs/MANUAL-LISTINGS.md.
//
// Null means "no listings this run" and is not an error: the integration is
// not configured, or the portal is an older deployment that has no listings
// route yet and answers 404. That 404 is treated as an empty feed rather than
// a failure so this pipeline can ship ahead of the portal: manual providers
// keep the records they already have and the run stays a clean one. Every
// other failure throws, the same as the override fetch. What export.ts does
// with a throw is different, though: a manual shelter has no listing of its
// animals anywhere else, so it carries its previous records forward the way a
// failed crawl does rather than emptying its page.
export async function fetchPortalListings(): Promise<PortalListingsPayloadType | null> {
  return fetchPortalFeed({
    label: "listings",
    errorLabel: "listings",
    fixtureVar: "PORTAL_LISTINGS_FIXTURE",
    path: "/api/export/listings",
    schema: PortalListingsPayload,
    emptyOn404:
      "Manual shelters keep their previous animals; this is expected until " +
      "the portal ships the route.",
  });
}
