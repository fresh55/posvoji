import { Animal } from "@posvoji/schema";
import type { AnimalImage, ProviderPolicy } from "@posvoji/schema";
import { excludedPathFor } from "./crawl-guard";

// What a shelter granted is re-read from its policy.yaml on every run and
// applied to every record about to be published, crawled and carried-over
// alike.
//
// A record only carries the policy as it stood when it was fetched. The
// incremental crawl re-fetches a provider whose policy fingerprint moved (see
// policyFingerprint in incremental-crawl.ts), but that only covers a provider
// this run actually crawled. On a targeted run (--provider X), and for any
// provider whose crawl failed, every other provider's animals come back from
// animals.crawled.json untouched: images keep the rights and the cached copies
// a wider policy allowed, shortDescription keeps a text a narrower policy no
// longer permits, a record under a freshly excluded path is republished, and
// attribution keeps the old wording. retainableAnimals only decides whether a
// provider may publish at all; this decides what of it may ship.
//
// It only ever narrows. Nothing here upgrades image rights, restores a
// description or widens anything else: a record that lost a field to a
// narrower policy gets it back by being crawled again, not by a policy edit.

// The longest excerpt "excerpt-permitted" publishes. One constant, because a
// per-provider limit would be a promise we have nowhere to record.
export const EXCERPT_MAX_CHARS = 200;

const ELLIPSIS = "…";

// A sentence boundary this close to the start leaves a fragment ("Dr.", "1.")
// rather than an excerpt, so the word boundary is the better cut.
const MIN_SENTENCE_EXCERPT = Math.floor(EXCERPT_MAX_CHARS * 0.4);

// Set on an image by the ingest image cache, never by a provider. Twin of
// CACHE_DERIVED_IMAGE_FIELDS in incremental-crawl.ts, which is not exported;
// both list every field withCachedUrls in cache-images.ts grafts on. Change
// one and change the other.
const CACHE_DERIVED_IMAGE_FIELDS = [
  "cachedUrl",
  "width",
  "height",
  "widths",
  "avif",
  "blurDataURL",
] as const;

export interface PublicationDrop {
  providerId: string;
  count: number;
  reason: string;
}

export type PublicationField = "images" | "descriptions" | "attribution";

export interface PublicationAdjustment {
  providerId: string;
  field: PublicationField;
  // The policy value the records were brought back to, for the log line.
  applied: string;
  count: number;
}

export interface PublicationPolicyResult {
  animals: Animal[];
  dropped: PublicationDrop[];
  adjusted: PublicationAdjustment[];
}

// The last word of a text cut to fit is rarely a whole word, so back up to
// the whitespace that starts it. Returns the length to keep.
function wordBoundary(head: string): number {
  const match = /\s+\S*$/u.exec(head);
  return match ? match.index : head.length;
}

// One excerpt of a description a shelter permits us to quote from but not to
// republish whole. Whole sentences where one fits inside the limit, whole
// words otherwise, and a single ellipsis to say the text goes on.
//
// Idempotent: a text already inside the limit is returned as it is, so an
// excerpt carried over from a previous run is not excerpted again.
export function excerptDescription(text: string): string {
  if (text.length <= EXCERPT_MAX_CHARS) return text;

  const head = text.slice(0, EXCERPT_MAX_CHARS);

  // A terminator plus whatever closes the sentence around it, followed by
  // whitespace or the edge of the window.
  const sentences = [...head.matchAll(/[.!?…][)\]"'”’»]*(?=\s|$)/gu)];
  const last = sentences.at(-1);
  const sentenceEnd =
    last?.index === undefined ? -1 : last.index + last[0].length;

  const keep =
    sentenceEnd >= MIN_SENTENCE_EXCERPT ? sentenceEnd : wordBoundary(head);
  const cut = head.slice(0, keep).trimEnd();

  // A text with no boundary at all inside the window (one very long word)
  // still has to yield something.
  const body = cut.length > 0 ? cut : head.trimEnd();
  return body.endsWith(ELLIPSIS) ? body : body + ELLIPSIS;
}

function carriesCachedCopy(image: AnimalImage): boolean {
  return CACHE_DERIVED_IMAGE_FIELDS.some((field) => image[field] !== undefined);
}

// An image under a policy that no longer permits caching: the rights come
// down to display-permitted and the cached copy's fields come off, so nothing
// points at a file the media sweep is free to delete. The fields are stripped
// from every image rather than only from downgraded ones, because under
// "remote" no image may ship a cached copy at all.
function needsRemoteNarrowing(image: AnimalImage): boolean {
  return image.rights === "cache-permitted" || carriesCachedCopy(image);
}

function narrowToRemote(image: AnimalImage): AnimalImage {
  const narrowed: Record<string, unknown> = { ...image };
  for (const field of CACHE_DERIVED_IMAGE_FIELDS) delete narrowed[field];
  if (image.rights === "cache-permitted") {
    narrowed["rights"] = "display-permitted";
  }
  return narrowed as AnimalImage;
}

export function applyPublicationPolicy(
  animals: readonly Animal[],
  policies: ReadonlyMap<string, ProviderPolicy>,
): PublicationPolicyResult {
  const drops = new Map<string, PublicationDrop>();
  const adjustments = new Map<string, PublicationAdjustment>();

  const countDrop = (providerId: string, reason: string): void => {
    const key = `${providerId}\n${reason}`;
    const entry = drops.get(key) ?? { providerId, count: 0, reason };
    entry.count++;
    drops.set(key, entry);
  };

  const countAdjustment = (
    providerId: string,
    field: PublicationField,
    applied: string,
  ): void => {
    const key = `${providerId}\n${field}`;
    const entry = adjustments.get(key) ?? {
      providerId,
      field,
      applied,
      count: 0,
    };
    entry.count++;
    adjustments.set(key, entry);
  };

  const kept: Animal[] = [];
  for (const animal of animals) {
    const providerId = animal.source.providerId;
    const policy = policies.get(providerId);
    // A provider with no policy.yaml has nothing to apply, and
    // retainableAnimals already drops its records. Reporting it here as well
    // would name the same animals twice.
    if (policy === undefined) {
      kept.push(animal);
      continue;
    }

    // Private-owner sections live behind these prefixes. The crawl guard keeps
    // them off the network and refuseExcluded in incremental-crawl.ts keeps
    // them out of a crawled provider's reuse, but a record carried over from
    // an earlier run passes both, so the prefix is checked once more here
    // against the list as it stands now.
    const excluded = excludedPathFor(
      animal.source.sourceUrl,
      policy.crawl.excludePaths,
    );
    if (excluded !== undefined) {
      countDrop(
        providerId,
        `under "${excluded}", which policy.yaml excludes from the crawl`,
      );
      continue;
    }

    const next: Record<string, unknown> = { ...animal };
    let changed = false;

    if (policy.images === "none") {
      // images is required by the schema, so it empties rather than drops,
      // the same way allowedFields handles it.
      if (animal.images.length > 0) {
        next["images"] = [];
        changed = true;
        countAdjustment(providerId, "images", "none");
      }
    } else if (policy.images === "remote") {
      if (animal.images.some(needsRemoteNarrowing)) {
        next["images"] = animal.images.map((image) =>
          needsRemoteNarrowing(image) ? narrowToRemote(image) : image,
        );
        changed = true;
        countAdjustment(providerId, "images", "remote");
      }
    }

    if (policy.descriptions === "facts-only") {
      if (animal.shortDescription !== undefined) {
        // Deleted rather than set to undefined, so the record serializes like
        // one that never carried a description.
        delete next["shortDescription"];
        changed = true;
        countAdjustment(providerId, "descriptions", "facts-only");
      }
    } else if (
      policy.descriptions === "excerpt-permitted" &&
      animal.shortDescription !== undefined
    ) {
      const excerpt = excerptDescription(animal.shortDescription);
      if (excerpt !== animal.shortDescription) {
        next["shortDescription"] = excerpt;
        changed = true;
        countAdjustment(providerId, "descriptions", "excerpt-permitted");
      }
    }

    // Copied verbatim from the policy, which is what every adapter does at
    // normalize time. A shelter that reworded its credit gets the new wording
    // on the next run whether or not it was crawled.
    if (animal.attribution !== policy.attribution) {
      next["attribution"] = policy.attribution;
      changed = true;
      countAdjustment(providerId, "attribution", policy.attribution);
    }

    // Only a record that actually changed is re-parsed: an untouched animal
    // keeps its identity and its place in the change-set diff.
    kept.push(changed ? Animal.parse(next) : animal);
  }

  const dropped = [...drops.values()].sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) ||
      a.reason.localeCompare(b.reason),
  );
  const adjusted = [...adjustments.values()].sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) ||
      a.field.localeCompare(b.field),
  );
  return { animals: kept, dropped, adjusted };
}
