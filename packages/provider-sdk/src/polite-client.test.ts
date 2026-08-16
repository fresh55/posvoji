import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PoliteClient,
  computeBackoffMs,
  parseRetryAfter,
} from "./polite-client";

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

describe("PoliteClient.getBytes", () => {
  const ORIGIN = "https://img.example";
  let agent: MockAgent;
  let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeEach(() => {
    previousDispatcher = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    setGlobalDispatcher(previousDispatcher);
    await agent.close();
  });

  function client(): PoliteClient {
    return new PoliteClient({
      userAgent: "PosvojiBot/test (+https://posvoji.si/bot)",
      minDelayMs: 0,
    });
  }

  it("returns binary bodies untouched", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/robots.txt" }).reply(200, "");
    pool.intercept({ path: "/cat.jpg" }).reply(200, bytes, {
      headers: { etag: '"v1"' },
    });

    const res = await client().getBytes(`${ORIGIN}/cat.jpg`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(bytes);
  });

  it("sends caller-provided validators and reports 304 as notModified", async () => {
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/robots.txt" }).reply(200, "");
    pool
      .intercept({
        path: "/cat.jpg",
        headers: { "if-none-match": '"v1"' },
      })
      .reply(304, "");

    const res = await client().getBytes(`${ORIGIN}/cat.jpg`, {
      validators: { etag: '"v1"' },
    });

    expect(res.notModified).toBe(true);
    expect(res.body).toBeNull();
  });

  it("still refuses paths robots.txt disallows", async () => {
    const pool = agent.get(ORIGIN);
    pool
      .intercept({ path: "/robots.txt" })
      .reply(200, "User-agent: *\nDisallow: /private/");

    await expect(
      client().getBytes(`${ORIGIN}/private/cat.jpg`),
    ).rejects.toThrow(/robots\.txt/);
  });
});
