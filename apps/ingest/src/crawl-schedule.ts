import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoliteClientOptions } from "@posvoji/provider-sdk";
import type { ProviderPolicy } from "@posvoji/schema";
import { writeFileAtomic } from "./write-atomic";

// Both stores are protected by the export's artifact lock. Invalid state must
// stop requests, not silently reset the limits a shelter already imposed.
function readTimes(path: string): Record<string, number> {
  if (!existsSync(path)) return {};
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.values(value).some((time) => !Number.isSafeInteger(time) || time < 0)) {
    throw new Error(`invalid crawl scheduling state: ${path}`);
  }
  return value as Record<string, number>;
}

export function hostCooldowns(directory: string): NonNullable<PoliteClientOptions["cooldowns"]> {
  const path = join(directory, "host-cooldowns.json");
  const times = readTimes(path);
  return {
    get: (host) => Object.hasOwn(times, host) ? times[host] : undefined,
    set(host, at) {
      if (!Number.isSafeInteger(at) || at < 0) throw new Error("invalid host cooldown");
      Object.defineProperty(times, host, { value: at, enumerable: true, writable: true, configurable: true });
      writeFileAtomic(path, JSON.stringify(times));
    },
  };
}

/**
 * Whether a provider may be crawled now, and when it may not, which of the two
 * times the schedule tracks is holding it off.
 */
export type CrawlVerdict =
  | { admit: true }
  | { admit: false; heldBy: "check" | "attempt"; nextAllowedAt: number };

/** Records an attempt stamped with the moment its crawl began. */
export type CrawlAttempt = () => void;

export class CrawlSchedule {
  private readonly path: string;
  private readonly attempts: Record<string, number>;

  constructor(directory: string, private readonly now: () => Date = () => new Date()) {
    this.path = join(directory, "crawl-schedule.json");
    this.attempts = readTimes(this.path);
  }

  private attemptedAt(policy: ProviderPolicy): number {
    return Object.hasOwn(this.attempts, policy.providerId) ? this.attempts[policy.providerId]! : 0;
  }

  private observedAt(checkedAt?: string | null): number {
    const observed = checkedAt ? Date.parse(checkedAt) : 0;
    if (!Number.isFinite(observed)) throw new Error("invalid provider check time");
    return observed;
  }

  private nextAllowedAt(policy: ProviderPolicy, checkedAt?: string | null): number {
    const last = Math.max(this.attemptedAt(policy), this.observedAt(checkedAt));
    return last === 0 ? 0 : last + policy.crawl.intervalHours * 3600000;
  }

  // A pure check. Admitting a provider used to record the attempt as well, so
  // a run killed mid-crawl held the provider off for a whole interval although
  // it had done no work. The caller records the attempt through begin() once
  // the crawl has settled instead.
  //
  // The refusal carries its own reason rather than leaving the caller to
  // re-derive one. Next-allowed is max(attempted, observed) + interval, so the
  // term that won the max is the term holding the provider off: a check that
  // won is a successful check inside the interval, which is what the interval
  // is for, and an attempt that won is a crawl that produced no check. A
  // provider we hold no check for lands in the second case, because with no
  // attempt either there is nothing to hold it off and it is admitted.
  check(policy: ProviderPolicy, checkedAt?: string | null): CrawlVerdict {
    const nextAllowedAt = this.nextAllowedAt(policy, checkedAt);
    if (this.now().getTime() >= nextAllowedAt) return { admit: true };
    return {
      admit: false,
      heldBy: this.observedAt(checkedAt) >= this.attemptedAt(policy) ? "check" : "attempt",
      nextAllowedAt,
    };
  }

  // Called when the crawl starts. Invoke what it returns after the crawl
  // settles, on success and on a thrown failure alike: a shelter whose site is
  // down must not be fetched again every hour. Nothing is written until then,
  // so a process that dies mid-crawl records nothing and the next run retries
  // the provider instead of skipping it and reporting the run as clean.
  //
  // The attempt is stamped here, at the start of the crawl, not where it is
  // written. The listing check is taken right after discovery, so an attempt
  // stamped at the end would postdate the check by the whole detail phase. The
  // next run would then hold the provider off past its own interval, read that
  // skip as the attempt's doing, and walk the provider's crawl time forward by
  // a detail phase every interval. Minting the timestamp here leaves the caller
  // no timestamp to get wrong.
  begin(policy: ProviderPolicy): CrawlAttempt {
    const at = this.now().getTime();
    return () => {
      this.attempts[policy.providerId] = at;
      writeFileAtomic(this.path, JSON.stringify(this.attempts));
    };
  }
}
