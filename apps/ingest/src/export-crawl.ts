import { PoliteClient } from "@posvoji/provider-sdk";
import type { Animal, ProviderPolicy } from "@posvoji/schema";
import { applyAllowedFields } from "./allowed-fields";
import { guardProviderRequests, type CrawlClient } from "./crawl-guard";
import type { ExportServices } from "./export-run";
import {
  forceFullRefresh,
  type CrawlState,
  type ProviderCrawlResult,
} from "./incremental-crawl";
import { normalizeAnimalOrigin } from "./normalize-origin";
import { crawlablePolicies, type LoadedPolicy } from "./policies";
import { type SnapshotReference } from "./provider-snapshots";
import { applyPublicationPolicy } from "./publication-policy";
import {
  carryFirstSeenAt,
  guardMassRemoval,
  guardUniqueAnimalIds,
} from "./run-guards";

/** Crawl independent providers, retaining completed checkpoints for recovery. */
export async function crawlProviders({
  client,
  policies,
  previousAnimals,
  state,
  refreshAll,
  bootstrappingSnapshot,
  providerSnapshots,
  previousPublishedAt,
  codeSha,
  snapshotReferences,
  acceptRemovals,
  services,
  logger,
}: {
  client: CrawlClient;
  policies: LoadedPolicy[];
  previousAnimals: readonly Animal[];
  state: CrawlState;
  refreshAll: boolean;
  bootstrappingSnapshot: boolean;
  providerSnapshots: ReturnType<ExportServices["createSnapshots"]>;
  previousPublishedAt: string | undefined;
  codeSha: string;
  snapshotReferences: Record<string, SnapshotReference>;
  acceptRemovals: Set<string>;
  services: Pick<ExportServices, "providers" | "crawlProviderIncrementally">;
  logger: ExportServices["logger"];
}) {
  const { providers, crawlProviderIncrementally } = services;
  // Each policy targets a different shelter site, so crawling them concurrently
  // is no less polite than crawling them one at a time: PoliteClient already
  // serializes requests per host with its own delay between them. Running the
  // providers themselves in parallel just removes the artificial wait for an
  // unrelated host to finish first.
  async function crawlProvider(
    client: CrawlClient,
    policy: LoadedPolicy["policy"],
    previousAnimals: readonly Animal[],
    state: CrawlState,
  ): Promise<ProviderCrawlResult> {
    const provider = providers.find((p) => p.id === policy.providerId);
    if (!provider) {
      throw new Error(
        `policy ${policy.providerId} is enabled but no provider is registered`,
      );
    }
    // ProviderContext types client as the concrete PoliteClient, so the guard
    // is handed over as one. It forwards everything it does not refuse.
    const guarded = guardProviderRequests(
      client,
      policy,
    ) as unknown as PoliteClient;
    const ctx = { client: guarded, policy };
    const resumed =
      !refreshAll && !bootstrappingSnapshot
        ? providerSnapshots.resume(policy, codeSha, previousPublishedAt)
        : null;
    if (resumed) {
      logger.log(
        `${policy.providerId}: resuming completed provider checkpoint`,
      );
      const held = providerSnapshots.read(policy, codeSha)!;
      snapshotReferences[policy.providerId] = {
        snapshotId: held.snapshotId,
        checkedAt: held.snapshot.checkedAt,
      };
      return resumed;
    }
    // The list page still decides who is listed, and every listed animal ends up
    // in the result. What this skips is the detail page of an animal we already
    // hold and read recently enough.
    const result = await crawlProviderIncrementally(provider, ctx, {
      previous: previousAnimals,
      forcedBecause: forceFullRefresh(state, policy, refreshAll),
    });
    const policyMap = new Map([[policy.providerId, policy]]);
    result.animals = applyAllowedFields(
      applyPublicationPolicy(
        carryFirstSeenAt(previousAnimals, result.animals).map(
          normalizeAnimalOrigin,
        ),
        policyMap,
      ).animals,
      policyMap,
    ).animals;
    guardUniqueAnimalIds(result.animals);
    guardMassRemoval(previousAnimals, result.animals, {
      accepted: acceptRemovals,
      crawledProviderIds: new Set([policy.providerId]),
    });
    snapshotReferences[policy.providerId] = providerSnapshots.save(
      policy,
      codeSha,
      result,
    );
    return result;
  }

  interface CrawlOutcome {
    animals: Animal[];
    // Providers whose crawl completed. Everybody else's records come from the
    // previous dataset.
    crawled: Set<string>;
    failed: string[];
    // Animals a finished provider could not refresh. Their previous record was
    // carried forward where we held one; where we did not, the listing was
    // skipped this run.
    failedAnimals: { providerId: string; sourceUrl: string }[];
    // Providers that re-fetched every listed animal, so every record they just
    // produced came from the current parsers under the current policy. Only
    // these advance the crawl state.
    fullyRefreshed: ProviderPolicy[];
    // Detail pages read, and detail pages the run did not have to read, over
    // every provider that finished.
    fetched: number;
    reused: number;
  }

  // One shelter's site being down, or its robots.txt refusing us, must not throw
  // away every other shelter's finished crawl. A failed provider keeps its
  // previous animals and the run exits 2 so the scheduler notices without
  // reading that as a reason to skip the deploy.
  async function crawl(
    client: CrawlClient,
    policies: LoadedPolicy[],
    previousAnimals: readonly Animal[],
    state: CrawlState,
  ): Promise<CrawlOutcome> {
    // A manual provider has no site to read and no adapter in registry.ts: its
    // animals are written into our own portal and arrive on the listings feed
    // instead. Skipping it here is what keeps crawlProvider from throwing
    // "enabled but no provider is registered" for it on every run. Everything
    // after the crawl treats its listings exactly like these animals.
    const enabled = crawlablePolicies(policies);
    const settled = await Promise.allSettled(
      enabled.map(({ policy }) =>
        crawlProvider(client, policy, previousAnimals, state),
      ),
    );

    const animals: Animal[] = [];
    const crawled = new Set<string>();
    const failed: string[] = [];
    const failedAnimals: { providerId: string; sourceUrl: string }[] = [];
    const fullyRefreshed: ProviderPolicy[] = [];
    let fetched = 0;
    let reused = 0;
    for (const [index, result] of settled.entries()) {
      const policy = enabled[index]!.policy;
      const providerId = policy.providerId;
      if (result.status === "fulfilled") {
        crawled.add(providerId);
        animals.push(...result.value.animals);
        fetched += result.value.fetched;
        reused += result.value.reused;
        if (result.value.fullRefresh) fullyRefreshed.push(policy);
        for (const ref of result.value.failedRefs) {
          failedAnimals.push({ providerId, sourceUrl: ref.sourceUrl });
        }
        continue;
      }
      failed.push(providerId);
      const reason =
        result.reason instanceof Error
          ? (result.reason.stack ?? result.reason.message)
          : String(result.reason);
      logger.error(`crawl ${providerId} FAILED: ${reason}`);
    }
    return {
      animals,
      crawled,
      failed,
      failedAnimals,
      fullyRefreshed,
      fetched,
      reused,
    };
  }
  return crawl(client, policies, previousAnimals, state);
}
