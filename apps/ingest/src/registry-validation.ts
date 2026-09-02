import type { AdoptionProvider } from "@posvoji/provider-sdk";
import type { LoadedPolicy, PolicyError } from "./policies";

type RegisteredProvider = Pick<AdoptionProvider, "id">;

// Providers are statically imported so the TypeScript build can resolve every
// adapter, while policies are discovered from the filesystem. Keep the two
// sources of truth honest before a crawl starts.
export function validateProviderRegistry(
  policies: readonly LoadedPolicy[],
  registered: readonly RegisteredProvider[],
): PolicyError[] {
  const errors: PolicyError[] = [];
  const policyById = new Map(
    policies.map((loaded) => [loaded.policy.providerId, loaded] as const),
  );
  const registeredCounts = new Map<string, number>();

  for (const provider of registered) {
    registeredCounts.set(
      provider.id,
      (registeredCounts.get(provider.id) ?? 0) + 1,
    );
  }

  for (const loaded of policies) {
    const { providerId, enabled, ingestion } = loaded.policy;
    const registered = registeredCounts.has(providerId);
    // A manual provider is crawled by the portal, not by an adapter: its
    // animals arrive on the listings feed and the crawl loop skips it. So it
    // is exempt from the rule above, and held to the opposite one. An adapter
    // for a manual provider is a contradiction that would crawl the shelter
    // and duplicate every listing it has. See docs/MANUAL-LISTINGS.md.
    if (ingestion === "manual") {
      if (registered) {
        errors.push({
          dir: loaded.dir,
          message: `provider "${providerId}" is ingestion: manual but has an adapter in apps/ingest/src/registry.ts`,
        });
      }
      continue;
    }
    if (enabled && !registered) {
      errors.push({
        dir: loaded.dir,
        message: `enabled provider "${providerId}" is missing from apps/ingest/src/registry.ts`,
      });
    }
  }

  for (const [providerId, count] of registeredCounts) {
    if (count > 1) {
      errors.push({
        dir: "apps/ingest/src/registry.ts",
        message: `provider "${providerId}" is registered ${count} times`,
      });
    }
    if (!policyById.has(providerId)) {
      errors.push({
        dir: "apps/ingest/src/registry.ts",
        message: `registered provider "${providerId}" has no policy.yaml`,
      });
    }
  }

  return errors;
}
