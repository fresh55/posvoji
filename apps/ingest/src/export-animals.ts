import type { Animal, ProviderPolicy } from "@posvoji/schema";
import { applyAllowedFields } from "./allowed-fields";
import { captureCrawledSnapshot } from "./crawled-snapshot";
import { normalizeAnimalOrigin } from "./normalize-origin";
import { isManualPolicy, type LoadedPolicy } from "./policies";
import { applyOverrides, type PortalExportPayload } from "./portal-overrides";
import { applyPublicationPolicy } from "./publication-policy";
import {
  carryFirstSeenAt,
  guardMassRemoval,
  guardUniqueAnimalIds,
  retainableAnimals,
} from "./run-guards";

/** Apply current permission and removal guards before any media can be changed. */
export function preparePublication({
  crawled,
  listingAnimals,
  previousAnimals,
  policies,
  policyById,
  portalPayload,
  acceptRemovals = new Set<string>(),
  crawledProviderIds,
  logger = console,
}: {
  crawled: Animal[];
  listingAnimals: Animal[];
  previousAnimals: Animal[];
  policies: LoadedPolicy[];
  policyById: ReadonlyMap<string, ProviderPolicy>;
  portalPayload: PortalExportPayload | null;
  acceptRemovals?: Set<string>;
  crawledProviderIds: Set<string>;
  logger?: Pick<Console, "log" | "warn">;
}) {
  const produced = [...crawled, ...listingAnimals];

  // A re-crawled animal is not a new one, so keep the date we first saw it.
  // Matched by id first and by the page it came from second, so a provider that
  // changes how it derives ids does not reset every date it has. The manual
  // shelters are named because that second match cannot work for them: every one
  // of their listings links to the same shelter page, so the page identifies the
  // shelter and not the animal. Their ids never change, so the first match is
  // all they need.
  //
  // Every manual provider is named here, which is a wider set than
  // manualProviderIds above: not narrowed to the enabled ones and not narrowed
  // by --provider, because the side this matches against is the previous
  // dataset, and that can hold animals of a manual shelter this run is not
  // building listings for.
  const refreshed = carryFirstSeenAt(previousAnimals, produced, {
    sharedSourceUrlProviderIds: new Set(
      policies
        .filter(({ policy }) => isManualPolicy(policy))
        .map(({ policy }) => policy.providerId),
    ),
  });

  // Everything this run has no fresh answer for: the other shelters on a
  // targeted run, any provider whose crawl failed above, every manual provider
  // when the listings feed did not arrive, and any manual provider the feed
  // arrived without naming. Their records come back from the previous dataset
  // rather than being dropped, but only while their policy still lets us
  // publish them, so a shelter that switched off or withdrew its permission
  // leaves the dataset even on a run that never crawled it.
  const carried = previousAnimals.filter(
    (animal) => !crawledProviderIds.has(animal.source.providerId),
  );
  const { animals: preserved, dropped } = retainableAnimals(
    carried,
    policyById,
  );
  for (const drop of dropped) {
    logger.warn(
      `dropped ${drop.count} carried-over animal(s) of ${drop.providerId}: ${drop.reason}`,
    );
  }

  // Preserved animals go through the same normalization as freshly crawled
  // ones, so a bad value already in the previous dataset is cleaned up even
  // by a targeted run that does not re-crawl its provider.
  const seeded = [...preserved, ...refreshed].map(normalizeAnimalOrigin);

  // What each shelter's policy.yaml permits right now, applied to the crawled
  // and the carried-over records alike. A carried record holds the policy as it
  // stood when it was fetched: the incremental crawl re-fetches a provider whose
  // policy fingerprint moved, but only one this run crawled. On a targeted run,
  // and after a failed crawl, this is the only thing that brings an excluded
  // page, an image, a description and an attribution back to what the shelter
  // grants today. It only ever narrows.
  const published = applyPublicationPolicy(seeded, policyById);
  for (const { providerId, count, reason } of published.dropped) {
    logger.warn(
      `publication policy: ${providerId}: dropped ${count} animal(s) ${reason}`,
    );
  }
  for (const { providerId, field, applied, count } of published.adjusted) {
    logger.warn(
      `publication policy: ${providerId}: ${field} set to ` +
        `${JSON.stringify(applied)} on ${count} animal(s)`,
    );
  }

  guardUniqueAnimalIds(published.animals);

  // The portal keys every override by the shelter slug of the account that
  // recorded it and ships that slug as providerId; this pipeline matches an
  // override to an animal on source.providerId. That join is the only thing
  // stopping one shelter from correcting another shelter's animal, and it holds
  // only while an animal's shelter id and its provider id are the same string.
  // Nothing else in the schema enforces it, so it is checked here on every run.
  // A manual listing is built with both read off the same providerId, and its
  // sourceUrl is the shelter page that slug routes to, so the check covers the
  // listings feed for free.
  const misattributed = published.animals.filter(
    (a) => a.shelter.id !== a.source.providerId,
  );
  if (misattributed.length > 0) {
    const named = misattributed
      .map(
        (a) =>
          `${a.id} (shelter ${a.shelter.id}, provider ${a.source.providerId})`,
      )
      .join(", ");
    throw new Error(
      `shelter id and providerId disagree, which would break override authorization: ${named}`,
    );
  }

  // The policy backstop for what each shelter granted. It runs here, over the
  // crawled and the carried-over records alike, for three reasons:
  //
  // - after normalization, so it sees the field set that would actually ship
  //   rather than one a later step still edits;
  // - before image caching, so a photo from a provider that did not list
  //   images is never requested, let alone written to disk;
  // - before the portal overrides, because those are not crawled content. A
  //   shelter typing a correction into our own portal is stating the fact
  //   itself, which is a stronger grant than the crawl permission this list
  //   records; the same is already true of descriptions, where an override
  //   sets shortDescription whatever the policy's descriptions grant says.
  const restricted = applyAllowedFields(published.animals, policyById);
  for (const { providerId, field, count } of restricted.stripped) {
    logger.warn(
      `allowedFields: ${providerId}: field ${field} is not in allowedFields, ` +
        `stripped from ${count} animal(s)`,
    );
  }

  // The crawl's own answer for this run, taken here because this is the last
  // point at which nothing has been merged into it, and copied out so no later
  // phase can reach it. Written at the end as animals.crawled.json, and read
  // back by the next run as previousCrawled. The manual shelters' listings are
  // in it: the portal is their crawler, and what it said is exactly what this
  // file is for.
  const crawledSnapshot = captureCrawledSnapshot(restricted.animals);

  // Shelter corrections from the portal are merged in after the crawl (and
  // after firstSeenAt is carried over) so a re-crawl can never silently
  // clobber them, and before image caching and the change-set diff so an
  // overridden field — including a status change — shows up in changes.json
  // as an update and ships in the written dataset.
  const overrideResult = portalPayload
    ? applyOverrides(restricted.animals, portalPayload)
    : null;
  const overridden = overrideResult?.animals ?? restricted.animals;
  if (overrideResult) {
    const moved = overrideResult.conflicts.filter((c) => c.kind === "moved");
    logger.log(
      `portal: ${overrideResult.applied.length} overrides applied, ` +
        `${overrideResult.unmatched.length} unmatched, ` +
        `${moved.length} conflicting with the crawl`,
    );
    // The correction goes on winning. This is the only place a moved source
    // shows up in a run, so it is named per animal rather than counted.
    for (const conflict of moved) {
      logger.warn(
        `portal: ${conflict.providerId}/${conflict.animalId} ${conflict.field}: ` +
          `crawl moved from ${JSON.stringify(conflict.baseline)} to ` +
          `${JSON.stringify(conflict.crawled)}, still showing ` +
          `${JSON.stringify(conflict.override)}`,
      );
    }
  }

  // The last check before anything destructive. A parser whose selectors stopped
  // matching returns an empty list without an error, and every step below this
  // line reads that as "the shelter emptied": the photos, the cards and the
  // records go, and firstSeenAt is reset for whatever comes back.
  // Against the crawled snapshot, because this guard is about the crawl: a
  // shelter emptying out is a fact about its site, not about our corrections.
  // The current side stays the merged list, which is the same length and the
  // same providers as crawledSnapshot: applyOverrides edits fields, never adds
  // or drops an animal.
  // A manual shelter is counted like any other, because it is in
  // crawledProviderIds exactly when the listings feed answered for it. Archiving
  // is that shelter's delete, so a feed that suddenly names three of its
  // nineteen animals is the same event as a parser that stopped matching, and it
  // stops here until an operator passes --accept-removals. A feed that did not
  // arrive at all leaves the provider out of crawledProviderIds, so the guard
  // does not read a portal outage as a removal, and neither does a feed that
  // arrived without naming the provider: the guard's minimum is three animals,
  // so it is no help to a manual shelter with one or two, and the provider list
  // is what keeps that case out of here in the first place.
  guardMassRemoval(previousAnimals, overridden, {
    accepted: acceptRemovals,
    crawledProviderIds,
  });

  return { crawledSnapshot, overridden, overrideResult };
}
