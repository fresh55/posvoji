import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "yaml";
import { ProviderPolicy } from "@posvoji/schema";
import { providersDir } from "./paths.js";

export interface LoadedPolicy {
  dir: string;
  policy: ProviderPolicy;
}

export interface PolicyError {
  dir: string;
  message: string;
}

export function loadPolicies(): {
  policies: LoadedPolicy[];
  errors: PolicyError[];
} {
  const policies: LoadedPolicy[] = [];
  const errors: PolicyError[] = [];

  for (const entry of readdirSync(providersDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(providersDir, entry.name);
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

    policies.push({ dir, policy: result.data });
  }

  return { policies, errors };
}
