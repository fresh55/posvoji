import { readFileSync } from "node:fs";
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

function parsePortalExport(body: unknown): PortalExportPayloadType {
  const result = PortalExportPayload.safeParse(body);
  if (!result.success) {
    throw new Error(
      `portal export payload failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

function parsePortalListings(body: unknown): PortalListingsPayloadType {
  const result = PortalListingsPayload.safeParse(body);
  if (!result.success) {
    throw new Error(
      `portal listings payload failed validation: ${result.error.message}`,
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

function exportEndpoint(baseUrl: string): string {
  return portalEndpoint(baseUrl, "/api/export");
}

function listingsEndpoint(baseUrl: string): string {
  return portalEndpoint(baseUrl, "/api/export/listings");
}

async function readBoundedBody(response: Response, url: string): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    BigInt(contentLength) > BigInt(PORTAL_EXPORT_MAX_BYTES)
  ) {
    throw new Error(`portal export response exceeds ${PORTAL_EXPORT_MAX_BYTES} bytes: ${url}`);
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
        `portal export response exceeds ${PORTAL_EXPORT_MAX_BYTES} bytes: ${url}`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

// Whether this run has the portal integration configured at all, decided from
// the same three variables fetchPortalOverrides reads below. It is a separate
// predicate because the pipeline has to know before the payload is fetched:
// the crawled-snapshot bootstrap in crawled-snapshot.ts is strict when
// corrections can reach the dataset and forgiving when they cannot. Keep the
// two in step.
export function portalIntegrationEnabled(): boolean {
  return Boolean(
    process.env["PORTAL_EXPORT_FIXTURE"] ||
      (process.env["PORTAL_EXPORT_URL"] && process.env["PORTAL_EXPORT_TOKEN"]),
  );
}

// Fetches the portal's current export, or returns null when the integration
// is not configured. Shape or HTTP failures abort the export so the pipeline
// never writes a dataset with only some corrections applied.
export async function fetchPortalOverrides(): Promise<PortalExportPayloadType | null> {
  const fixturePath = process.env["PORTAL_EXPORT_FIXTURE"];
  if (fixturePath) {
    console.log(`portal: reading overrides from fixture ${fixturePath}`);
    return parsePortalExport(JSON.parse(readFileSync(fixturePath, "utf8")));
  }

  const baseUrl = process.env["PORTAL_EXPORT_URL"];
  const token = process.env["PORTAL_EXPORT_TOKEN"];
  if (!baseUrl || !token) {
    console.log(
      "portal: overrides disabled (PORTAL_EXPORT_URL/PORTAL_EXPORT_TOKEN not set)",
    );
    return null;
  }

  // This calls our own portal service, not a shelter website. PoliteClient's
  // crawling etiquette therefore does not apply.
  const url = exportEndpoint(baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PORTAL_EXPORT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`portal export request failed: ${url}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(
      `portal export request failed: HTTP ${response.status} ${url}`,
    );
  }

  const text = await readBoundedBody(response, url);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`portal export response is not valid JSON: ${url}`, {
      cause: error,
    });
  }
  return parsePortalExport(body);
}

// The manual shelters' animals, from the same portal, the same base URL and
// the same token as the overrides above. See docs/MANUAL-LISTINGS.md.
//
// Null means "no listings this run" and is not an error: the integration is
// not configured, or the portal is an older deployment that has no listings
// route yet and answers 404. Every other failure throws, the same as the
// override fetch. What export.ts does with a throw is different, though: a
// manual shelter has no listing of its animals anywhere else, so it carries
// its previous records forward the way a failed crawl does rather than
// emptying its page.
export async function fetchPortalListings(): Promise<PortalListingsPayloadType | null> {
  const fixturePath = process.env["PORTAL_LISTINGS_FIXTURE"];
  if (fixturePath) {
    console.log(`portal: reading listings from fixture ${fixturePath}`);
    return parsePortalListings(JSON.parse(readFileSync(fixturePath, "utf8")));
  }

  const baseUrl = process.env["PORTAL_EXPORT_URL"];
  const token = process.env["PORTAL_EXPORT_TOKEN"];
  if (!baseUrl || !token) {
    console.log(
      "portal: listings disabled (PORTAL_EXPORT_URL/PORTAL_EXPORT_TOKEN not set)",
    );
    return null;
  }

  const url = listingsEndpoint(baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PORTAL_EXPORT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`portal listings request failed: ${url}`, { cause: error });
  }
  // A portal deployed before the listings route existed. Treated as an empty
  // feed rather than a failure so this pipeline can ship ahead of the portal:
  // manual providers keep the records they already have and the run stays a
  // clean one.
  if (response.status === 404) {
    console.log(
      `portal: no listings feed at ${url} (HTTP 404). Manual shelters keep ` +
        `their previous animals; this is expected until the portal ships the ` +
        `route.`,
    );
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `portal listings request failed: HTTP ${response.status} ${url}`,
    );
  }

  const text = await readBoundedBody(response, url);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`portal listings response is not valid JSON: ${url}`, {
      cause: error,
    });
  }
  return parsePortalListings(body);
}
