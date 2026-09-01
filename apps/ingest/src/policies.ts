import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "yaml";
import { ProviderPolicy } from "@posvoji/schema";
import { ANIMAL_FIELDS } from "./allowed-fields";
import { providersDir } from "./paths";

export interface LoadedPolicy {
  dir: string;
  policy: ProviderPolicy;
}

export interface PolicyError {
  dir: string;
  message: string;
}

// A manual provider is crawled by our own portal rather than by an adapter:
// it has no entry in registry.ts, no crawl state and no detail pages, and its
// animals arrive on the listings feed. Several loops in the pipeline turn on
// that distinction, so the two halves of it are named once here rather than
// spelled out at each of them. See docs/MANUAL-LISTINGS.md.
export function isManualPolicy(policy: ProviderPolicy): boolean {
  return policy.ingestion === "manual";
}

// The providers the crawl loop runs over: enabled, and with a site to read.
export function crawlablePolicies(
  policies: readonly LoadedPolicy[],
): LoadedPolicy[] {
  return policies.filter(
    ({ policy }) => policy.enabled && !isManualPolicy(policy),
  );
}

// The providers whose animals come from the listings feed instead.
export function manualPolicies(
  policies: readonly LoadedPolicy[],
): LoadedPolicy[] {
  return policies.filter(
    ({ policy }) => policy.enabled && isManualPolicy(policy),
  );
}

// The directory is a parameter so the loader can be exercised over a fixture
// tree; every entry point takes the repo's own providers/.
export function loadPolicies(root: string = providersDir): {
  policies: LoadedPolicy[];
  errors: PolicyError[];
} {
  const policies: LoadedPolicy[] = [];
  const errors: PolicyError[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const policyPath = join(dir, "policy.yaml");

    if (!existsSync(policyPath)) {
      errors.push({ dir, message: "missing policy.yaml" });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parse(readFileSync(policyPath, "utf8"));
    } catch (error) {
      errors.push({ dir, message: `policy.yaml is not valid YAML: ${error}` });
      continue;
    }

    const result = ProviderPolicy.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          dir,
          message: `${issue.path.join(".") || "policy"}: ${issue.message}`,
        });
      }
      continue;
    }

    const folder = basename(dir);
    const isTemplate = folder.startsWith("_");
    if (!isTemplate && folder !== result.data.providerId) {
      errors.push({
        dir,
        message: `folder "${folder}" does not match providerId "${result.data.providerId}"`,
      });
      continue;
    }
    // A template is a file to copy, not a shelter. Enabled, it would be
    // crawled like any other policy, and its providerId is nobody's folder.
    if (isTemplate && result.data.enabled) {
      errors.push({
        dir,
        message: `template folder "${folder}" must not be enabled`,
      });
      continue;
    }

    // allowedFields is enforced at export time: a field it does not name is
    // stripped from that provider's animals. A typo would therefore read as
    // "the shelter did not grant this" and silently drop live data, so a name
    // the Animal schema does not know is a policy error.
    const unknown = (result.data.allowedFields ?? []).filter(
      (field) => !ANIMAL_FIELDS.has(field),
    );
    if (unknown.length > 0) {
      errors.push({
        dir,
        message: `allowedFields: not an Animal field: ${unknown.join(", ")}`,
      });
      continue;
    }

    policies.push({ dir, policy: result.data });
  }

  // Two directories claiming one providerId crawls that shelter twice and
  // ships every animal twice, since the folder-name check lets a template
  // copy carry any id it likes.
  const byProviderId = new Map<string, LoadedPolicy[]>();
  for (const loaded of policies) {
    const same = byProviderId.get(loaded.policy.providerId) ?? [];
    same.push(loaded);
    byProviderId.set(loaded.policy.providerId, same);
  }
  for (const [providerId, same] of byProviderId) {
    if (same.length < 2) continue;
    for (const loaded of same) {
      const others = same
        .filter((other) => other !== loaded)
        .map((other) => basename(other.dir))
        .join(", ");
      errors.push({
        dir: loaded.dir,
        message: `providerId "${providerId}" is also declared by ${others}`,
      });
    }
  }

  return { policies, errors };
}
