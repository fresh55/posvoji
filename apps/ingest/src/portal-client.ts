import { readFileSync } from "node:fs";
import {
  PortalExportPayload,
  type PortalExportPayload as PortalExportPayloadType,
} from "./portal-contract";

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

function exportEndpoint(baseUrl: string): string {
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
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/api/export`;
  return base.href;
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
