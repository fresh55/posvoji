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

export class CrawlSchedule {
  private readonly path: string;
  private readonly attempts: Record<string, number>;

  constructor(directory: string, private readonly now: () => Date = () => new Date()) {
    this.path = join(directory, "crawl-schedule.json");
    this.attempts = readTimes(this.path);
  }

  nextAllowedAt(policy: ProviderPolicy, checkedAt?: string | null): number {
    const observed = checkedAt ? Date.parse(checkedAt) : 0;
    if (!Number.isFinite(observed)) throw new Error("invalid provider check time");
    const attempted = Object.hasOwn(this.attempts, policy.providerId) ? this.attempts[policy.providerId]! : 0;
    const last = Math.max(attempted, observed);
    return last === 0 ? 0 : last + policy.crawl.intervalHours * 3600000;
  }

  // A pure check. Admitting a provider used to record the attempt as well, so
  // a run killed mid-crawl held the provider off for a whole interval although
  // it had done no work. The caller records the attempt once the crawl has
  // settled instead.
  admit(policy: ProviderPolicy, checkedAt?: string | null): boolean {
    return this.now().getTime() >= this.nextAllowedAt(policy, checkedAt);
  }

  // Called after the crawl settles, on success and on a thrown failure alike: a
  // shelter whose site is down must not be fetched again every hour. A process
  // that dies before this runs records nothing, so the next run retries the
  // provider instead of skipping it and reporting the run as clean.
  record(policy: ProviderPolicy, at: number = this.now().getTime()): void {
    if (!Number.isSafeInteger(at) || at < 0) {
      throw new Error("invalid crawl attempt time");
    }
    this.attempts[policy.providerId] = at;
    writeFileAtomic(this.path, JSON.stringify(this.attempts));
  }
}
