import { describe, expect, it } from "vitest";
import { computeBackoffMs, parseRetryAfter } from "./polite-client";

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("7")).toBe(7_000);
  });

  it("parses an HTTP date relative to now", () => {
    const now = Date.parse("2026-08-15T12:00:00Z");
    const header = new Date(now + 30_000).toUTCString();
    expect(parseRetryAfter(header, now)).toBe(30_000);
  });

  it("never returns a negative delay for past dates", () => {
    const now = Date.parse("2026-08-15T12:00:00Z");
    const header = new Date(now - 30_000).toUTCString();
    expect(parseRetryAfter(header, now)).toBe(0);
  });

  it("returns undefined for missing or garbage values", () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("computeBackoffMs", () => {
  it("grows exponentially", () => {
    expect(computeBackoffMs(0)).toBe(2_000);
    expect(computeBackoffMs(1)).toBe(4_000);
    expect(computeBackoffMs(2)).toBe(8_000);
  });

  it("caps exponential backoff at one minute", () => {
    expect(computeBackoffMs(10)).toBe(60_000);
  });

  it("prefers the server's Retry-After when present", () => {
    expect(computeBackoffMs(0, 45_000)).toBe(45_000);
  });

  it("caps Retry-After at ten minutes", () => {
    expect(computeBackoffMs(0, 3_600_000)).toBe(600_000);
  });
});
