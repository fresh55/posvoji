import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ChangeEntry, ChangeSet, Dataset } from "@posvoji/schema";
import { cacheImages } from "./cache-images";
import { loadPolicies, type LoadedPolicy } from "./policies";
import { normalizeAnimalOrigin } from "./normalize-origin";
import { providers } from "./registry";
import { writeShareCards } from "./share-cards";
import { datasetDir } from "./paths";

const USER_AGENT = "PosvojiBot/0.1 (+https://posvoji.si/bot; bot@posvoji.si)";

// A targeted export refreshes one provider while preserving every other
// provider's last validated records. This is useful when onboarding a new
// remote-image provider without re-crawling hundreds of unrelated animals.
const providerFlag = process.argv.indexOf("--provider");
const requestedProviderId =
  providerFlag === -1 ? undefined : process.argv[providerFlag + 1];
if (providerFlag !== -1 && !requestedProviderId) {
  throw new Error("--provider requires a provider id");
}

function readPreviousDataset(): Dataset | undefined {
  const path = join(datasetDir, "animals.json");
  if (!existsSync(path)) return undefined;
  const result = Dataset.safeParse(JSON.parse(readFileSync(path, "utf8")));
  return result.success ? result.data : undefined;
}

// fetchedAt and lastSeenAt change on every run, so they can't count as a change.
function stableView(animal: Animal): string {
  const { source, ...rest } = animal;
  const { fetchedAt: _f, lastSeenAt: _l, ...stableSource } = source;
  return JSON.stringify({ ...rest, source: stableSource });
}

function toChangeEntry(animal: Animal): ChangeEntry {
  return {
    id: animal.id,
    providerId: animal.source.providerId,
    sourceUrl: animal.source.sourceUrl,
    species: animal.species,
    name: animal.name,
  };
}

function loadValidPolicies(): LoadedPolicy[] {
  const { policies, errors } = loadPolicies();
  if (errors.length > 0) {
    for (const { dir, message } of errors) {
      console.error(`invalid  ${dir}: ${message}`);
    }
    throw new Error("refusing to crawl with invalid provider policies");
  }
  return policies;
}

async function crawl(
  client: PoliteClient,
  policies: LoadedPolicy[],
): Promise<Animal[]> {
  const animals: Animal[] = [];

  for (const { policy } of policies) {
    if (!policy.enabled) continue;
    const provider = providers.find((p) => p.id === policy.providerId);
    if (!provider) {
      throw new Error(
        `policy ${policy.providerId} is enabled but no provider is registered`,
      );
    }
    const ctx = { client, policy };
    const refs = await provider.discover(ctx);
    console.log(`${provider.id}: discovered ${refs.length} animals`);
    for (const ref of refs) {
      const raw = await provider.fetch(ctx, ref);
      animals.push(Animal.parse(await provider.normalize(ctx, raw)));
    }
  }

  return animals;
}

const previous = readPreviousDataset();
const previousById = new Map(
  (previous?.animals ?? []).map((a) => [a.id, a] as const),
);

const policies = loadValidPolicies();
const crawlPolicies = requestedProviderId
  ? policies.filter(({ policy }) => policy.providerId === requestedProviderId)
  : policies;
if (requestedProviderId && crawlPolicies.length === 0) {
  throw new Error(`unknown provider: ${requestedProviderId}`);
}
const client = new PoliteClient({ userAgent: USER_AGENT });
const crawled = await crawl(client, crawlPolicies);

// A re-crawled animal is not a new one, so keep the date we first saw it.
const refreshed = crawled.map((animal) => {
  const before = previousById.get(animal.id);
  if (!before) return animal;
  return {
    ...animal,
    source: { ...animal.source, firstSeenAt: before.source.firstSeenAt },
  };
});

const refreshedProviderIds = new Set(
  crawlPolicies.map(({ policy }) => policy.providerId),
);
const preserved = requestedProviderId
  ? (previous?.animals ?? []).filter(
      (animal) => !refreshedProviderIds.has(animal.source.providerId),
    )
  : [];
// Preserved animals go through the same normalization as freshly crawled
// ones, so a bad value already in the previous dataset is cleaned up even
// by a targeted run that does not re-crawl its provider.
const seeded = [...preserved, ...refreshed].map(normalizeAnimalOrigin);

// Cache permitted photos before the dataset is written so cachedUrl ships
// with it; the same sync deletes copies that fell out of the dataset.
const imagePolicies = new Map(
  policies.map(({ policy }) => [policy.providerId, policy.images] as const),
);
mkdirSync(datasetDir, { recursive: true });
// A targeted run deliberately leaves the global image cache untouched. The
// selected provider's source URLs remain usable, while cached files and URLs
// belonging to preserved providers cannot be deleted or needlessly rechecked.
const { animals, fetched, reused, deleted } = requestedProviderId
  ? { animals: seeded, fetched: 0, reused: 0, deleted: 0 }
  : await cacheImages(seeded, client, imagePolicies);
if (requestedProviderId) {
  console.log("images: unchanged (targeted provider export)");
}
console.log(
  `images: ${fetched} fetched, ${reused} revalidated, ${deleted} deleted`,
);

const currentIds = new Set(animals.map((a) => a.id));
const generatedAt = new Date().toISOString();

// Share cards are drawn from the cached photos, so they come after the image
// sync and read the dataset's own build time: an age on a card and the same
// age on the page are measured from one clock.
const cards = await writeShareCards(animals, {
  reference: new Date(generatedAt),
});
console.log(
  `share cards: ${cards.written} drawn, ${cards.reused} reused, ${cards.deleted} deleted`,
);

const changes: ChangeSet = {
  generatedAt,
  added: animals.filter((a) => !previousById.has(a.id)).map(toChangeEntry),
  updated: animals
    .filter((a) => {
      const before = previousById.get(a.id);
      return before !== undefined && stableView(before) !== stableView(a);
    })
    .map(toChangeEntry),
  removed: (previous?.animals ?? [])
    .filter((a) => !currentIds.has(a.id))
    .map(toChangeEntry),
};

const dataset: Dataset = { generatedAt, animals };

writeFileSync(
  join(datasetDir, "animals.json"),
  JSON.stringify(Dataset.parse(dataset), null, 2),
);
writeFileSync(
  join(datasetDir, "changes.json"),
  JSON.stringify(ChangeSet.parse(changes), null, 2),
);

console.log(
  `exported ${animals.length} animals ` +
    `(+${changes.added.length} ~${changes.updated.length} -${changes.removed.length}) to ${datasetDir}`,
);
