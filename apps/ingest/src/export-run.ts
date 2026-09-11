import { PoliteClient } from "@posvoji/provider-sdk";
import { ChangeSet, Dataset } from "@posvoji/schema";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { holdArtifactLock } from "./artifact-lock";
import { cacheImages, hotlinkedCachePermittedImages } from "./cache-images";
import { cacheLogos, logoTargets } from "./cache-logos";
import { buildChangeSet } from "./changes";
import {
  assertBootstrapCrawlIsComplete,
  readPreviousCrawledDataset,
} from "./crawled-snapshot";
import { exitCodeForRun } from "./exit-codes";
import { preparePublication } from "./export-animals";
import { crawlProviders } from "./export-crawl";
import { writeGenerationReceipt } from "./generation-receipt";
import { checkPreviousGenerationSealed } from "./generation-seal";
import {
  advanceCrawlState,
  crawlProviderIncrementally,
  crawlStatePath,
  readCrawlState,
} from "./incremental-crawl";
import {
  crawledDatasetPath,
  datasetDir,
  datasetPath,
  overrideReportPath,
  repoRoot,
} from "./paths";
import {
  crawlablePolicies,
  loadPolicies,
  manualPolicies,
  type LoadedPolicy,
} from "./policies";
import { answeredProviders, buildListingAnimals } from "./portal-listings";
import {
  buildOverrideReport,
  fetchPortalListings,
  fetchPortalOverrides,
  portalIntegrationEnabled,
  type ListingsReport,
  type PortalListingsPayload,
} from "./portal-overrides";
import {
  buildCrawlManifest,
  ProviderSnapshots,
  readSnapshotReferences,
  reserveInputRevision,
  type SnapshotReference,
} from "./provider-snapshots";
import { providers } from "./registry";
import { readPreviousDataset } from "./run-guards";
import { writeShareCards } from "./share-cards";
import { loadShelters } from "./shelters";
import { writeFileAtomic } from "./write-atomic";

export interface ExportOptions {
  providerId?: string;
  acceptRemovals?: readonly string[];
  discardPrevious?: boolean;
  refreshAll?: boolean;
  republish?: boolean;
}

const defaultServices = {
  holdArtifactLock,
  reserveInputRevision,
  loadPolicies,
  readPreviousDataset,
  readPreviousCrawledDataset,
  checkPreviousGenerationSealed,
  readCrawlState,
  readSnapshotReferences,
  fetchPortalOverrides,
  fetchPortalListings,
  portalIntegrationEnabled,
  loadShelters,
  cacheImages,
  cacheLogos,
  writeShareCards,
  writeFileAtomic,
  writeGenerationReceipt,
  crawlProviderIncrementally,
  providers,
  datasetDir,
  datasetPath,
  crawledDatasetPath,
  overrideReportPath,
  crawlStatePath,
  createClient: () =>
    new PoliteClient({
      userAgent: "PosvojiBot/0.1 (+https://posvoji.si/bot; bot@posvoji.si)",
    }),
  createSnapshots: (
    directory: string,
  ): Pick<ProviderSnapshots, "resume" | "read" | "save" | "prune"> =>
    new ProviderSnapshots(directory),
  getCodeSha: () =>
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim(),
  now: () => new Date(),
  logger: console as Pick<Console, "log" | "warn" | "error">,
};
export type ExportServices = typeof defaultServices;

/** Importing this module does no work. Each run owns its state and lock. */
export async function runExport(
  options: ExportOptions = {},
  services: Partial<ExportServices> = {},
) {
  const {
    holdArtifactLock,
    reserveInputRevision,
    loadPolicies,
    readPreviousDataset,
    readPreviousCrawledDataset,
    checkPreviousGenerationSealed,
    readCrawlState,
    readSnapshotReferences,
    fetchPortalOverrides,
    fetchPortalListings,
    portalIntegrationEnabled,
    loadShelters,
    cacheImages,
    cacheLogos,
    writeShareCards,
    writeFileAtomic,
    writeGenerationReceipt,
    crawlProviderIncrementally,
    providers,
    datasetDir,
    datasetPath,
    crawledDatasetPath,
    overrideReportPath,
    crawlStatePath,
    createClient,
    createSnapshots,
    getCodeSha,
    now,
    logger,
  } = { ...defaultServices, ...services };
  const {
    providerId: requestedProviderId,
    discardPrevious = false,
    refreshAll = false,
    republish = false,
  } = options;
  const acceptRemovals = new Set(options.acceptRemovals);
  if (republish && (refreshAll || requestedProviderId))
    throw new Error(
      "--republish cannot be combined with --refresh-all or --provider",
    );
  const release = holdArtifactLock("dataset-export");
  try {
    const inputRevision = reserveInputRevision(datasetDir);
    const codeSha = getCodeSha();
    const providerSnapshots = createSnapshots(datasetDir);
    const snapshotReferences: Record<string, SnapshotReference> = {};

    function loadValidPolicies(): LoadedPolicy[] {
      const { policies, errors } = loadPolicies();
      if (errors.length > 0) {
        for (const { dir, message } of errors) {
          logger.error(`invalid  ${dir}: ${message}`);
        }
        throw new Error("refusing to crawl with invalid provider policies");
      }
      return policies;
    }

    // What the listings feed left this run with: a payload, a fetch that threw,
    // or an integration that is not configured. Three states in one value, so no
    // pair of flags can put the run in a state it cannot be in, and every reader
    // below decides from the same fact.
    type ListingsFeed =
      | { kind: "ok"; payload: PortalListingsPayload }
      | { kind: "failed" }
      | { kind: "off" };

    // A throw is reported and turned into "failed" rather than aborting the run.
    // What that costs the manual shelters is decided further down, where the
    // three states are handled together.
    async function fetchListingsFeed(): Promise<ListingsFeed> {
      try {
        const payload = await fetchPortalListings();
        return payload ? { kind: "ok", payload } : { kind: "off" };
      } catch (error) {
        const reason =
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error);
        logger.error(`portal listings FAILED: ${reason}`);
        return { kind: "failed" };
      }
    }

    // Two previous datasets, and which one a step reads is the whole point of the
    // split. animals.json is what the last run published, corrections merged in;
    // animals.crawled.json is what its crawl produced, before any of them.
    //
    // Everything below that means "what did the crawl say last time" reads the
    // crawled one: the reuse input, firstSeenAt, the carried-over records, the
    // removal guard. Only the change set reads the published one, and deliberately
    // so: it answers "what changed on the site", and a correction that is still
    // standing is not a change. See crawled-snapshot.ts for the feedback loop this
    // closes.
    //
    // The two files are also checked against each other there: they carry one
    // run's generatedAt, and the snapshot is written first, so a snapshot ahead of
    // the published file is a run that stopped between the two writes and is
    // carried on from; a published file ahead of the snapshot is a restored old
    // snapshot and stops the run.
    const previousPublished = readPreviousDataset(datasetPath, {
      discardPrevious,
    });
    // The generation receipt is the last write of a run, so a receipt that does
    // not name the published dataset's generation means the run that wrote the
    // datasets never committed. Its records are still last run's crawl and are
    // reused as such; what is lost is the change set's baseline, and it is lost
    // for good, because that run had already overwritten the datasets its
    // predecessor sealed. Say so instead of treating it as an ordinary previous
    // run.
    const previousSeal = checkPreviousGenerationSealed(
      previousPublished?.generatedAt,
      join(datasetDir, "generation.json"),
    );
    if (!previousSeal.sealed) {
      logger.warn(
        `WARNING: the previous run wrote its datasets but never sealed them: ` +
          `${previousSeal.reason}. Their records are still last run's crawl and ` +
          `this run reuses them. changes.json this run is computed against that ` +
          `unsealed baseline, so an animal the stopped run added is not reported ` +
          `as added again.`,
      );
    }
    const { dataset: previousCrawled, bootstrapping: bootstrappingSnapshot } =
      readPreviousCrawledDataset(crawledDatasetPath, {
        discardPrevious,
        portalEnabled: portalIntegrationEnabled(),
        refreshAll,
        targetedProviderId: requestedProviderId,
        published: previousPublished,
        publishedPath: datasetPath,
        overrideReportPath,
      });
    // Which generation of the parsers, and which policy, produced the records we
    // are about to reuse. A missing or unreadable file forces a full crawl, which
    // is the safe direction.
    const crawlState = readCrawlState(crawlStatePath);

    const policies = loadValidPolicies();
    const policyById = new Map(
      policies.map(({ policy }) => [policy.providerId, policy] as const),
    );
    // Carried records keep their actual observation time. A missing provider
    // checkpoint (the first upgraded run, or an empty legacy shelter) is unknown.
    Object.assign(
      snapshotReferences,
      readSnapshotReferences(datasetDir, previousCrawled?.generatedAt),
    );
    providerSnapshots.prune(
      policies.map(({ policy }) => policy),
      snapshotReferences,
    );

    if (requestedProviderId) {
      const target = policyById.get(requestedProviderId);
      if (!target) {
        throw new Error(`unknown provider: ${requestedProviderId}`);
      }
      // A disabled provider used to pass this check, crawl nothing and take its
      // animals down with it.
      if (!target.enabled) {
        throw new Error(
          `provider ${requestedProviderId} is disabled in its policy.yaml, so a ` +
            `targeted run would crawl nothing and drop every animal it has`,
        );
      }
      if (target.permission.status !== "granted") {
        throw new Error(
          `provider ${requestedProviderId} has permission.status ` +
            `"${target.permission.status}", not "granted"`,
        );
      }
    }
    const crawlPolicies = republish
      ? manualPolicies(policies)
      : requestedProviderId
        ? policies.filter(
            ({ policy }) => policy.providerId === requestedProviderId,
          )
        : policies;
    const client = createClient();

    // Fetched before the crawl, not after it. A bad token or a payload that no
    // longer matches the contract throws, and a run that is going to fail on that
    // should fail in the first second rather than after a crawl of many minutes.
    // The request is milliseconds, so there is nothing to gain by overlapping it.
    const portalPayload = await fetchPortalOverrides();

    // The manual shelters' animals, fetched here for the same reason and from the
    // same portal. It does not abort the run when it fails, though, and that is
    // the one way it differs from the overrides above: a manual shelter has no
    // listing of its animals anywhere but here, so a portal outage has to leave
    // its records where they are rather than empty its page. A throw is turned
    // into the same carry-forward a failed crawl gets, below.
    const listingsFeed = await fetchListingsFeed();

    const {
      animals: crawled,
      crawled: crawledProviderIds,
      failed,
      failedAnimals,
      fullyRefreshed,
      fetched: detailsFetched,
      reused: detailsReused,
    } = await crawlProviders({
      client,
      policies: crawlPolicies,
      previousAnimals: previousCrawled?.animals ?? [],
      state: crawlState,
      refreshAll,
      bootstrappingSnapshot,
      providerSnapshots,
      previousPublishedAt: previousPublished?.generatedAt,
      codeSha,
      snapshotReferences,
      acceptRemovals,
      services: { providers, crawlProviderIncrementally },
      logger,
    });
    logger.log(
      `detail pages: ${detailsFetched} fetched, ${detailsReused} reused`,
    );
    if (failedAnimals.length > 0) {
      logger.error(
        `detail pages: ${failedAnimals.length} could not be refreshed`,
      );
      for (const { providerId, sourceUrl } of failedAnimals) {
        logger.error(`  ${providerId}: ${sourceUrl}`);
      }
    }

    // The manual providers this run is responsible for: enabled, ingestion:
    // manual, and inside the --provider filter when there is one. crawlPolicies
    // is already narrowed to the target, so a targeted run over a manual shelter
    // builds only its listings and carries everybody else forward, the same as a
    // targeted crawl does.
    const manualProviderIds = manualPolicies(crawlPolicies).map(
      ({ policy }) => policy.providerId,
    );

    // Which of them the feed says it is answering for, and which it left
    // unaccounted for. The payload's providers list is what separates a manual
    // shelter that archived everything from one this portal does not consider
    // manual at all, and only the first is a removal. See answeredProviders.
    //
    // Both are read on the "ok" path only. A feed that did not arrive answers for
    // nobody, and the switch below is the one place that says so.
    const { answered: answeredProviderIds, unanswered: unansweredProviderIds } =
      answeredProviders(
        manualProviderIds,
        listingsFeed.kind === "ok" ? listingsFeed.payload.providers : undefined,
      );

    // The feed is the whole listing of every manual shelter it answers for, so a
    // payload that arrived answers for all of those at once, including a shelter
    // that now has nothing: its animals leave the dataset the same way a crawled
    // shelter's do when they leave its list page, and guardMassRemoval below
    // still stands between an emptied feed and a deletion.
    //
    // The build is narrowed to the answered providers, not just the targeted
    // ones. A provider the feed did not name is carried forward below, and a
    // record built for it here would then collide with the carried copy of
    // itself and stop the run on a duplicate id.
    //
    // The records ride along on the state that produced them, so nothing below
    // has to ask a second time whether a payload arrived before reading them.
    const listings =
      listingsFeed.kind === "ok"
        ? {
            ...listingsFeed,
            result: buildListingAnimals(
              listingsFeed.payload,
              policyById,
              loadShelters(),
              now().toISOString(),
              new Set(answeredProviderIds),
            ),
          }
        : listingsFeed;

    switch (listings.kind) {
      case "ok": {
        for (const providerId of answeredProviderIds) {
          crawledProviderIds.add(providerId);
        }
        logger.log(
          `portal listings: ${listings.result.animals.length} listed, ` +
            `${listings.result.skipped.length} skipped`,
        );
        for (const skip of listings.result.skipped) {
          logger.warn(
            `portal listings: skipped ${skip.providerId}/${skip.listingId}: ${skip.reason}`,
          );
        }
        // The same outcome a failed fetch gets, for the providers the payload did
        // not answer for: not in crawledProviderIds, so their previous animals
        // are carried forward below, and in failed, so the run exits 2.
        failed.push(...unansweredProviderIds);
        for (const providerId of unansweredProviderIds) {
          logger.error(
            `portal listings: ${providerId} is ingestion: manual in its ` +
              `policy.yaml but the portal did not list it as manual, so the feed ` +
              `answered nothing for it. Its animals were carried forward rather ` +
              `than removed. Run seed_shelters on the portal to bring its ` +
              `shelter record back in step with the policy.`,
          );
        }
        break;
      }
      case "failed":
        // Exactly what a failed crawl does: the provider is not in
        // crawledProviderIds, so its previous animals are carried forward below,
        // and it is in failed, so the run exits 2 and the scheduler sees a run
        // that was not clean.
        failed.push(...manualProviderIds);
        break;
      case "off":
        if (manualProviderIds.length > 0) {
          logger.log(
            `portal listings: no feed this run, ${manualProviderIds.length} manual ` +
              `provider(s) carried forward: ${manualProviderIds.join(", ")}`,
          );
        }
        break;
    }

    // The second half of the bootstrap check, and the first point at which it can
    // be made: whether every enabled provider finished and refreshed in full is a
    // fact about the crawl that just returned. It runs here, before firstSeenAt is
    // carried, before a photo is fetched and before any file is written, so a
    // bootstrap run that would have to carry a provider over from the merged
    // dataset stops with nothing on disk to undo. See crawled-snapshot.ts.
    //
    // Manual providers are left out of the enabled set it checks. "Fully
    // refreshed" is a fact about a detail crawl and they have none: the listings
    // feed is every listing the shelter has, every run, so nothing of theirs is
    // ever carried over from the merged dataset. A feed that did not arrive, or
    // that did not name the provider, is the case that would carry them over, and
    // both already put it in failed, which this check refuses.
    if (bootstrappingSnapshot) {
      assertBootstrapCrawlIsComplete({
        failed,
        fullyRefreshedProviderIds: fullyRefreshed.map((p) => p.providerId),
        enabledProviderIds: crawlablePolicies(policies).map(
          ({ policy }) => policy.providerId,
        ),
      });
      logger.log(
        `bootstrap: every enabled provider crawled and fully refreshed, so ` +
          `${crawledDatasetPath} is the crawl's own answer`,
      );
    }

    // This run's origin for animal records: what the crawl returned, plus what the
    // manual shelters wrote into the portal. The listings join here, before a
    // single guard has run, because a manual listing is a crawled animal whose
    // crawler is the portal: from this line down nothing distinguishes them, so
    // they take the same firstSeenAt carry, the same uniqueness and removal
    // guards, the same allowedFields backstop, the same image cache, and they land
    // in animals.crawled.json like everything else. See docs/MANUAL-LISTINGS.md.
    const { crawledSnapshot, overridden, overrideResult } = preparePublication({
      crawled,
      listingAnimals: listings.kind === "ok" ? listings.result.animals : [],
      previousAnimals: previousCrawled?.animals ?? [],
      policies,
      policyById,
      portalPayload,
      acceptRemovals,
      crawledProviderIds,
      logger,
    });

    // Cache permitted photos before the dataset is written so cachedUrl ships
    // with it; the same sync deletes copies that fell out of the dataset.
    const imagePolicies = new Map(
      policies.map(({ policy }) => [policy.providerId, policy.images] as const),
    );
    mkdirSync(datasetDir, { recursive: true });
    // A targeted run caches the provider it just crawled, otherwise enabling a
    // cache-permitted shelter would leave its photos hotlinked until somebody ran
    // a full export. Preserved providers stay in scope for the deletion sweep but
    // out of scope for requests, so their cached files and URLs are neither
    // deleted nor needlessly rechecked.
    const { animals, fetched, reused, deleted, scored, derived } =
      await cacheImages(
        overridden,
        client,
        imagePolicies,
        requestedProviderId || republish
          ? { refreshProviderIds: crawledProviderIds }
          : {},
      );
    logger.log(
      `images: ${fetched} fetched, ${reused} revalidated, ${deleted} deleted`,
    );
    logger.log(
      `image variants: ${derived.thumbs} thumbs, ${derived.rungs} rungs, ` +
        `${derived.blurs} placeholders, ${derived.avifs} avif derived, ` +
        `${scored} scored`,
    );

    // cachedUrl is set by cacheImages above, so this catches whatever it could
    // not cache: a source that 404s, exceeds the size cap or fails to decode.
    const hotlinked = hotlinkedCachePermittedImages(animals);
    if (hotlinked.length > 0) {
      const detail =
        hotlinked.length <= 5
          ? hotlinked.map((h) => h.sourceUrl).join(", ")
          : [...new Set(hotlinked.map((h) => h.providerId))].join(", ");
      logger.warn(
        `images: ${hotlinked.length} cache-permitted image(s) left hotlinked (${detail})`,
      );
    }

    // Shelter logos are keyed by provider, not by animal, so the sync runs over
    // every permitted shelter even on a targeted run: revalidation keeps that
    // free, and passing a subset would read as "the rest revoked their logo" and
    // delete their files.
    const logos = await cacheLogos(
      logoTargets(policies.map(({ policy }) => policy)),
      client,
    );
    logger.log(
      `logos: ${logos.fetched} fetched, ${logos.reused} reused, ${logos.deleted} deleted`,
    );
    // Discovery is a ranked guess. Naming what it picked lets a maintainer pin the
    // url into policy.yaml, after which the guess is never made again.
    for (const [providerId, url] of Object.entries(logos.discovered)) {
      logger.log(
        `logos: ${providerId} discovered ${url} (pin it in policy.yaml)`,
      );
    }

    const generatedAt = now().toISOString();

    // Share cards are drawn from the cached photos, so they come after the image
    // sync and read the dataset's own build time: an age on a card and the same
    // age on the page are measured from one clock. A targeted run needs no
    // special case, since an unchanged animal keeps its fingerprint and its card.
    const cards = await writeShareCards(animals, {
      reference: new Date(generatedAt),
    });
    logger.log(
      `share cards: ${cards.written} drawn, ${cards.reused} reused, ${cards.deleted} deleted`,
    );

    // Parsed once, then used for both the diff and the file. The two used to
    // disagree on key order alone: the file carries the schema's order, an animal
    // that just went through the image cache carries cachedUrl and its derived
    // fields appended, and JSON.stringify follows insertion order, so every cached
    // animal showed up as updated on every run.
    const dataset: Dataset = Dataset.parse({ generatedAt, animals });

    // The same run's crawl, stamped with the same generatedAt even though it was
    // captured several phases earlier: the two files describe one run, and a
    // second clock reading would only invite somebody to compare them. It goes
    // through the same schema, so a snapshot that could not be published is not
    // written either.
    //
    // It carries no cachedUrl and none of the derived image fields for anything
    // this run crawled, because cacheImages runs after the capture; a record
    // carried over from a file that had them keeps them until its provider is
    // crawled again. Either way their state here says nothing: reuseAnimal in
    // incremental-crawl.ts strips exactly those fields off a reused record before
    // republishing it, and cacheImages grafts them back from the manifest as it
    // stands now. The snapshot is only ever read as crawl input.
    const crawledDataset: Dataset = Dataset.parse({
      generatedAt,
      animals: crawledSnapshot,
    });

    // The published dataset against the last published one. This is the only
    // comparison in the run that uses the merged files on both sides, so a
    // correction that has been standing for weeks stays out of changes.json
    // instead of being reported again on every run.
    const changes = buildChangeSet({
      generatedAt,
      previous: previousPublished?.animals ?? [],
      current: dataset.animals,
    });

    // The snapshot is written first, and the order is load-bearing. A run that
    // dies between the two writes then leaves a snapshot one generation ahead of
    // the published file, which is the recoverable direction: the snapshot is the
    // whole crawl, so everything that reads it is right, and only changes.json's
    // baseline is a generation old. The other order left an unusable pair that
    // blocked every following run. See assertGenerationPair in
    // crawled-snapshot.ts.
    writeFileAtomic(
      crawledDatasetPath,
      JSON.stringify(crawledDataset, null, 2),
    );
    writeFileAtomic(datasetPath, JSON.stringify(dataset, null, 2));
    writeFileAtomic(
      join(datasetDir, "changes.json"),
      JSON.stringify(ChangeSet.parse(changes), null, 2),
    );
    // Written on every run, including runs with no portal configured, so the
    // file never goes stale and an empty report cannot be mistaken for "the
    // shelters have corrected nothing".
    const listingsReport: ListingsReport =
      listings.kind === "ok"
        ? {
            payloadArrived: true,
            failed: false,
            portalGeneratedAt: listings.payload.generatedAt,
            applied: listings.result.applied,
            skipped: listings.result.skipped,
            unanswered: unansweredProviderIds,
          }
        : {
            payloadArrived: false,
            failed: listings.kind === "failed",
            applied: [],
            skipped: [],
            // No payload, so no provider list either. Every manual provider was
            // carried forward for a reason payloadArrived and failed already
            // carry, which is not the same fact as a payload that arrived and
            // left one out.
            unanswered: [],
          };
    writeFileAtomic(
      overrideReportPath,
      JSON.stringify(
        buildOverrideReport(
          generatedAt,
          portalPayload,
          overrideResult,
          listingsReport,
        ),
        null,
        2,
      ),
    );
    // Written with the dataset rather than at the end of the crawl: it says which
    // providers' records on disk were produced by the current parsers, so it may
    // only advance once those records are the ones on disk. A provider that failed,
    // or that only refreshed the animals that were due, keeps its old entry. A
    // manual provider never gets one: it has no parser generation and no detail
    // pages to schedule, so nothing in incremental-crawl.ts ever asks about it.
    writeFileAtomic(
      crawlStatePath,
      JSON.stringify(
        advanceCrawlState(crawlState, fullyRefreshed, generatedAt),
        null,
        2,
      ),
    );

    // Portal-managed shelters have a real observation too, including an empty
    // feed. Save only after the common validation and removal guards succeeded.
    if (listings.kind === "ok") {
      for (const providerId of answeredProviderIds) {
        const policy = policyById.get(providerId)!;
        const animals = crawledSnapshot.filter(
          (animal) => animal.source.providerId === providerId,
        );
        snapshotReferences[providerId] = providerSnapshots.save(
          policy,
          codeSha,
          {
            checkedAt: listings.payload.generatedAt,
            animals,
            listed: animals.length,
            fetched: 0,
            reused: 0,
            failedRefs: [],
            excluded: 0,
            fullRefresh: true,
          },
        );
      }
    }

    // This is the commit point for the generated snapshot. It hashes the five
    // deployment inputs, the image-cache manifest used by standalone derivation,
    // and every media byte they reference. It is written only after all of those
    // writes have completed. A stopped run therefore leaves either the prior valid
    // generation or a stale receipt deployment refuses to accept.
    writeFileAtomic(
      join(datasetDir, "crawl-manifest.json"),
      JSON.stringify(
        buildCrawlManifest({
          generatedAt,
          inputRevision,
          codeSha,
          policies: policies.map(({ policy }) => policy),
          references: snapshotReferences,
          overrides: portalPayload?.overrides ?? null,
          listings: listings.kind === "ok" ? listings.payload : null,
        }),
        null,
        2,
      ),
    );
    const generationId = writeGenerationReceipt(
      {},
      { preserveInputRevision: true },
    );
    providerSnapshots.prune(
      policies.map(({ policy }) => policy),
      snapshotReferences,
    );
    logger.log(`sealed generation ${generationId}`);

    logger.log(
      `exported ${dataset.animals.length} animals ` +
        `(+${changes.added.length} ~${changes.updated.length} -${changes.removed.length}) to ${datasetDir}`,
    );

    // See exit-codes.ts for what the codes mean. In short: a run that got this
    // far wrote a dataset, so it exits 0 or 2, never 1. The scheduled crawl
    // deploys on both and refuses on anything else.
    // failed holds providers whose crawl threw, every enabled manual provider
    // when the listings feed did not come back, and any manual provider a feed
    // that did come back declined to answer for: the same outcome by the same
    // route, so one list and one exit code cover all three.
    if (failed.length > 0) {
      logger.error(
        `no fresh records for ${failed.length} provider(s): ${failed.join(", ")}. ` +
          `Their previous records were carried forward and the dataset was ` +
          `written, but this run is not a clean one.`,
      );
    }
    if (failedAnimals.length > 0) {
      logger.error(
        `${failedAnimals.length} animal(s) could not be refreshed. The record we ` +
          `already held was carried forward for each one we hold, and the ` +
          `listing was skipped for each one we do not, so this run is not a ` +
          `clean one either.`,
      );
    }
    const exitCode = exitCodeForRun({
      failedProviders: failed.length,
      failedAnimals: failedAnimals.length,
    });
    return { exitCode, dataset, generationId };
  } finally {
    release();
  }
}
