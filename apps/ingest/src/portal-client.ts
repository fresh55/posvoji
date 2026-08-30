import { readFileSync } from "node:fs";
import {
  PortalExportPayload,
  type PortalExportPayload as PortalExportPayloadType,
} from "./portal-contract";

function parsePortalExport(body: unknown): PortalExportPayloadType {
  const result = PortalExportPayload.safeParse(body);
  if (!result.success) {
    throw new Error(
      `portal export payload failed validation: ${result.error.message}`,
    );
  }
  return result.data;
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
  const url = `${baseUrl.replace(/\/+$/, "")}/api/export`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `portal export request failed: HTTP ${response.status} ${url}`,
    );
  }

  return parsePortalExport(await response.json());
}
