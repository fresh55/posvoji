import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MAX_RETRY_AFTER_MS } from "@posvoji/provider-sdk";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import { CrawlSchedule, hostCooldowns } from "./crawl-schedule";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function directory() { const root = mkdtempSync(join(tmpdir(), "crawl-schedule-")); roots.push(root); return root; }
const policy = ProviderPolicy.parse({ providerId: "fixture", source: "https://shelter.example", enabled: true, ingestion: "scrape", images: "none", descriptions: "facts-only", permission: { status: "granted", date: "2026-09-01" }, attribution: "Fixture", crawl: { intervalHours: 48 } });

it("persists recorded attempts, including failures, and admits at the exact interval", () => {
  const root = directory();
  let at = Date.parse("2026-09-01T06:00:00Z");
  const now = () => new Date(at);
  expect(new CrawlSchedule(root, now).check(policy)).toEqual({ admit: true });
  // What a failed crawl leaves behind: an attempt and no observation.
  new CrawlSchedule(root, now).begin(policy)();
  at += 47 * 3600000;
  expect(new CrawlSchedule(root, now).check(policy)).toEqual({
    admit: false,
    // Only a recorded attempt can hold off a provider we hold no check for.
    heldBy: "attempt",
    nextAllowedAt: Date.parse("2026-09-03T06:00:00Z"),
  });
  at += 3600000;
  expect(new CrawlSchedule(root, now).check(policy)).toEqual({ admit: true });
});

// The 2026-09-03 crash: the run died after the schedule had admitted the
// provider and before it fetched anything, and the attempt written up front
// held the provider off for a whole interval for no work at all.
it("records nothing for a run that dies between the check and the crawl", () => {
  const root = directory();
  const at = Date.parse("2026-09-01T06:00:00Z");
  expect(new CrawlSchedule(root, () => new Date(at)).check(policy).admit).toBe(true);
  expect(existsSync(join(root, "crawl-schedule.json"))).toBe(false);
  const hourLater = new CrawlSchedule(root, () => new Date(at + 3600000));
  expect(hourLater.check(policy).admit).toBe(true);
  // Beginning the crawl writes nothing. Only the recorder does.
  const attempt = hourLater.begin(policy);
  expect(existsSync(join(root, "crawl-schedule.json"))).toBe(false);
  attempt();
  expect(existsSync(join(root, "crawl-schedule.json"))).toBe(true);
  expect(new CrawlSchedule(root, () => new Date(at + 2 * 3600000)).check(policy).admit).toBe(false);
});

it("uses saved observations on upgrade and respects a widened policy interval", () => {
  const at = "2026-09-03T06:00:00Z";
  const schedule = new CrawlSchedule(directory(), () => new Date(at));
  expect(schedule.check(policy, "2026-09-02T06:00:00Z")).toEqual({
    admit: false,
    // The check is what is holding it off, so the skip is the interval doing
    // its job.
    heldBy: "check",
    nextAllowedAt: Date.parse("2026-09-04T06:00:00Z"),
  });
  expect(schedule.check({ ...policy, crawl: { ...policy.crawl, intervalHours: 12 } }, "2026-09-02T06:00:00Z").admit).toBe(true);
});

// Widening an interval leaves an attempt on record that was admitted under the
// old one, so the attempt outruns the check although the check is now well
// inside the interval. The provider is held off, but nothing about it is
// stale, and calling that run degraded would be a false alarm every hour until
// the next crawl.
it("holds a provider off on its check when a widened interval makes that check fresh", () => {
  const root = directory();
  let at = Date.parse("2026-09-01T06:00:00Z");
  const narrow = { ...policy, crawl: { ...policy.crawl, intervalHours: 1 } };
  const now = () => new Date(at);
  expect(new CrawlSchedule(root, now).check(narrow, "2026-09-01T05:00:00Z").admit).toBe(true);
  new CrawlSchedule(root, now).begin(narrow)();
  at += 1800000;
  expect(new CrawlSchedule(root, now).check(policy, "2026-09-01T05:00:00Z")).toEqual({
    admit: false,
    heldBy: "check",
    nextAllowedAt: Date.parse("2026-09-03T06:00:00Z"),
  });
});

it("rejects corrupt scheduling state instead of resetting permission limits", () => {
  const root = directory();
  writeFileSync(join(root, "crawl-schedule.json"), '{"fixture":"bad"}');
  expect(() => new CrawlSchedule(root)).toThrow(/invalid crawl scheduling/);
});

it("preserves server cooldowns across exports", () => {
  const root = directory();
  const until = Date.now() + 3600000;
  hostCooldowns(root).set("shelter.example", until);
  expect(hostCooldowns(root).get("shelter.example")).toBe(until);
});

it("repairs a legacy extreme deferral once and removes it after expiry", () => {
  const root = directory();
  const at = Date.now();
  const path = join(root, "host-cooldowns.json");
  writeFileSync(path, JSON.stringify({ "shelter.example": Number.MAX_SAFE_INTEGER }));
  expect(hostCooldowns(root, at).get("shelter.example")).toBe(at + MAX_RETRY_AFTER_MS);
  expect(hostCooldowns(root, at + 1000).get("shelter.example")).toBe(at + MAX_RETRY_AFTER_MS);
  expect(hostCooldowns(root, at + MAX_RETRY_AFTER_MS).get("shelter.example")).toBeUndefined();
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({});
});

it("keeps a short cooldown inside the successful check interval clean", () => {
  const root = directory();
  const checked = Date.parse("2026-09-08T10:00:00Z");
  const at = checked + 3600000;
  hostCooldowns(root, at).set("shelter.example", checked + 6 * 3600000);
  const verdict = new CrawlSchedule(root, () => new Date(at)).check(policy, new Date(checked).toISOString());
  expect(verdict).toMatchObject({ admit: false, heldBy: "check" });
});
