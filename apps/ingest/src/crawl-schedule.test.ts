import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import { CrawlSchedule, hostCooldowns } from "./crawl-schedule";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function directory() { const root = mkdtempSync(join(tmpdir(), "crawl-schedule-")); roots.push(root); return root; }
const policy = ProviderPolicy.parse({ providerId: "fixture", source: "https://shelter.example", enabled: true, ingestion: "scrape", images: "none", descriptions: "facts-only", permission: { status: "granted", date: "2026-09-01" }, attribution: "Fixture", crawl: { intervalHours: 48 } });

it("persists attempts before work, including failures, and admits at the exact interval", () => {
  const root = directory();
  let at = Date.parse("2026-09-01T06:00:00Z");
  const now = () => new Date(at);
  expect(new CrawlSchedule(root, now).admit(policy)).toBe(true);
  at += 47 * 3600000;
  expect(new CrawlSchedule(root, now).admit(policy)).toBe(false);
  at += 3600000;
  expect(new CrawlSchedule(root, now).admit(policy)).toBe(true);
});

it("uses saved observations on upgrade and respects a widened policy interval", () => {
  const at = "2026-09-03T06:00:00Z";
  const schedule = new CrawlSchedule(directory(), () => new Date(at));
  expect(schedule.admit(policy, "2026-09-02T06:00:00Z")).toBe(false);
  expect(schedule.admit({ ...policy, crawl: { ...policy.crawl, intervalHours: 12 } }, "2026-09-02T06:00:00Z")).toBe(true);
});

it("rejects corrupt scheduling state instead of resetting permission limits", () => {
  const root = directory();
  writeFileSync(join(root, "crawl-schedule.json"), '{"fixture":"bad"}');
  expect(() => new CrawlSchedule(root)).toThrow(/invalid crawl scheduling/);
});

it("preserves server cooldowns across exports", () => {
  const root = directory();
  hostCooldowns(root).set("shelter.example", 1900000000000);
  expect(hostCooldowns(root).get("shelter.example")).toBe(1900000000000);
});
