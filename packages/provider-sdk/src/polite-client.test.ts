import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PoliteClientOptions } from "./polite-client";
import {
  PoliteClient,
  ResponseBodyTooLargeError,
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

const ORIGIN = "https://img.example";

// A charset that needs full ICU. Node ships it, but skip rather than fail on a
// small-icu build.
function hasWindows1250(): boolean {
  try {
    new TextDecoder("windows-1250");
    return true;
  } catch {
    return false;
  }
}

describe("PoliteClient", () => {
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

  function client(options: Partial<PoliteClientOptions> = {}): PoliteClient {
    return new PoliteClient({
      userAgent: "PosvojiBot/test (+https://posvoji.si/bot)",
      minDelayMs: 0,
      ...options,
    });
  }

  describe("getBytes", () => {
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
        // A 304 may advertise the size of the selected representation even
        // though it has no response body. That header must not trip the cap.
        .reply(304, "", { headers: { "content-length": "999" } });

      const res = await client().getBytes(`${ORIGIN}/cat.jpg`, {
        validators: { etag: '"v1"' },
        maxBytes: 1,
      });

      expect(res.notModified).toBe(true);
      expect(res.body).toBeNull();
    });

    it("accepts a body exactly at the caller's byte limit", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "12345", {
        headers: { "content-length": "5" },
      });

      const res = await client().getBytes(`${ORIGIN}/cat.jpg`, {
        maxBytes: 5,
      });

      expect(res.body?.toString("utf8")).toBe("12345");
    });

    it("rejects an oversized Content-Length without retrying", async () => {
      let requests = 0;
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool
        .intercept({ path: "/cat.jpg" })
        .reply(
          200,
          () => {
            requests += 1;
            return "123456";
          },
          { headers: { "content-length": "6" } },
        )
        .persist();

      const result = client({ maxRetries: 1 }).getBytes(
        `${ORIGIN}/cat.jpg`,
        { maxBytes: 5 },
      );

      await expect(result).rejects.toMatchObject({
        name: "ResponseBodyTooLargeError",
        url: `${ORIGIN}/cat.jpg`,
        maxBytes: 5,
      });
      expect(requests).toBe(1);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects invalid maxBytes %s before making a request",
      async (maxBytes) => {
        await expect(
          client().getBytes(`${ORIGIN}/cat.jpg`, { maxBytes }),
        ).rejects.toThrow("maxBytes must be a positive safe integer");
      },
    );

    it("never revalidates on its own after seeing an ETag", async () => {
      const seen: Array<Record<string, string>> = [];
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool
        .intercept({ path: "/cat.jpg" })
        .reply(
          200,
          (opts) => {
            seen.push(opts.headers as Record<string, string>);
            return "one";
          },
          { headers: { etag: '"v1"' } },
        )
        .times(2);

      const c = client();
      await c.getBytes(`${ORIGIN}/cat.jpg`);
      const second = await c.getBytes(`${ORIGIN}/cat.jpg`);

      expect(second.status).toBe(200);
      expect(seen).toHaveLength(2);
      expect(seen[1]?.["if-none-match"]).toBeUndefined();
      expect(seen[1]?.["if-modified-since"]).toBeUndefined();
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

    it("retries a 429 and returns the response that follows", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool
        .intercept({ path: "/cat.jpg" })
        .reply(429, "slow down", { headers: { "retry-after": "0" } });
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const res = await client().getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(200);
      expect(res.body?.toString("utf8")).toBe("cat");
    });

    it("throws instead of returning a 429 once the retries are spent", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool
        .intercept({ path: "/cat.jpg" })
        .reply(429, "slow down", { headers: { "retry-after": "0" } })
        .times(2);

      await expect(
        client({ maxRetries: 1 }).getBytes(`${ORIGIN}/cat.jpg`),
      ).rejects.toThrow(/rate limited after 1 retries: .*\/cat\.jpg/);
    });

    it("throws when a 503 outlives the retries", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool.intercept({ path: "/cat.jpg" }).reply(503, "down");

      await expect(
        client({ maxRetries: 0 }).getBytes(`${ORIGIN}/cat.jpg`),
      ).rejects.toThrow(/rate limited after 0 retries/);
    });

    it("follows a same-origin redirect", async () => {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(200, "User-agent: *\nDisallow: /private/");
      pool
        .intercept({ path: "/cat.jpg" })
        .reply(301, "", { headers: { location: "/photos/cat.jpg" } });
      pool.intercept({ path: "/photos/cat.jpg" }).reply(200, "cat");

      const res = await client().getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(200);
      expect(res.body?.toString("utf8")).toBe("cat");
    });

    it("re-checks robots.txt on every redirect hop", async () => {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(200, "User-agent: *\nDisallow: /private/");
      pool
        .intercept({ path: "/cat.jpg" })
        .reply(302, "", { headers: { location: "/private/cat.jpg" } });

      await expect(client().getBytes(`${ORIGIN}/cat.jpg`)).rejects.toThrow(
        /robots\.txt disallows fetching .*\/private\/cat\.jpg/,
      );
    });

    it("hands a cross-origin redirect back to the caller", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool.intercept({ path: "/cat.jpg" }).reply(302, "", {
        headers: { location: "https://other.example/cat.jpg" },
      });

      const res = await client().getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(302);
      expect(res.headers["location"]).toBe("https://other.example/cat.jpg");
    });

    it("serializes requests to one host", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool.intercept({ path: "/a.jpg" }).reply(200, "a").delay(60);
      pool.intercept({ path: "/b.jpg" }).reply(200, "b");

      const c = client();
      const order: string[] = [];
      await Promise.all([
        c.getBytes(`${ORIGIN}/a.jpg`).then(() => order.push("a")),
        c.getBytes(`${ORIGIN}/b.jpg`).then(() => order.push("b")),
      ]);

      expect(order).toEqual(["a", "b"]);
    });
  });

  describe("robots.txt handling", () => {
    it("uses and caches the first 512 KiB of an oversized robots.txt", async () => {
      let requests = 0;
      const header = "User-agent: *\n";
      const rule = "Disallow: /private/\n";
      const padding = "#".repeat(512 * 1024 - header.length - rule.length - 1);
      const robots = `${header}${padding}\n${rule}Allow: /private/\n`;
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(
          200,
          () => {
            requests += 1;
            return robots;
          },
          { headers: { "content-length": String(robots.length) } },
        )
        .persist();
      pool.intercept({ path: "/public/cat.jpg" }).reply(200, "cat");

      const c = client({ maxRetries: 1 });
      await expect(
        c.getBytes(`${ORIGIN}/private/cat.jpg`),
      ).rejects.toThrow(/robots\.txt disallows/);
      const allowed = await c.getBytes(`${ORIGIN}/public/cat.jpg`);

      expect(allowed.body?.toString("utf8")).toBe("cat");
      expect(requests).toBe(1);
    });

    it("follows a redirected robots.txt", async () => {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(301, "", { headers: { location: "/robots-real.txt" } });
      pool
        .intercept({ path: "/robots-real.txt" })
        .reply(200, "User-agent: *\nDisallow: /private/");

      await expect(
        client().getBytes(`${ORIGIN}/private/cat.jpg`),
      ).rejects.toThrow(/robots\.txt disallows/);
    });

    it("treats 403 as a refusal to crawl", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(403, "nope");

      await expect(client().getBytes(`${ORIGIN}/cat.jpg`)).rejects.toThrow(
        /robots\.txt disallows/,
      );
    });

    it("still allows everything on a 404", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(404, "");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const res = await client().getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(200);
    });

    it("retries a 5xx robots.txt and crawls on the answer that follows", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(500, "bad gateway");
      pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const res = await client({ maxRetries: 1 }).getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(200);
      expect(res.body?.toString("utf8")).toBe("cat");
    });

    it("disallows and caches a robots.txt that keeps answering 5xx", async () => {
      let robotsRequests = 0;
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(500, () => {
          robotsRequests++;
          return "bad gateway";
        })
        .times(2);

      const c = client({ maxRetries: 1 });
      await expect(c.getBytes(`${ORIGIN}/cat.jpg`)).rejects.toThrow(
        /robots\.txt disallows/,
      );
      // The second call reads the cached refusal: a site that 5xx'd through
      // every retry is genuinely unavailable, so it is not asked again.
      await expect(c.getBytes(`${ORIGIN}/dog.jpg`)).rejects.toThrow(
        /robots\.txt disallows/,
      );
      expect(robotsRequests).toBe(2);
    });

    it("throws on an unreachable robots.txt and retries it next time", async () => {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .replyWithError(new Error("socket hang up"));

      const c = client({ maxRetries: 0 });
      await expect(c.getBytes(`${ORIGIN}/cat.jpg`)).rejects.toThrow(
        `robots.txt for ${ORIGIN} unreachable`,
      );

      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const res = await c.getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(200);
    });

    it("waits out a Crawl-delay before the first fetch", async () => {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(200, "User-agent: *\nCrawl-delay: 0.25");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const started = Date.now();
      const res = await client().getBytes(`${ORIGIN}/cat.jpg`);

      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    });

    it("does not wait when robots.txt sets no Crawl-delay", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const started = Date.now();
      await client().getBytes(`${ORIGIN}/cat.jpg`);

      expect(Date.now() - started).toBeLessThan(200);
    });

    // The next two tests use the real constructor default instead of the
    // client() helper's minDelayMs: 0, so they pay for an actual multi-second
    // wait. That cost is the point: it is the only way to prove the default
    // is 3s, not the old 10s, and that a longer robots Crawl-delay still wins
    // via Math.max(minDelayMs, crawlDelayMs) in respectDelay().

    it("defaults minDelayMs to 3 seconds when robots.txt sets no Crawl-delay", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const started = Date.now();
      await new PoliteClient({
        userAgent: "PosvojiBot/test (+https://posvoji.si/bot)",
      }).getBytes(`${ORIGIN}/cat.jpg`);
      const elapsed = Date.now() - started;

      expect(elapsed).toBeGreaterThanOrEqual(2_900);
      // Well under the old 10s default: catches a regression the other way.
      expect(elapsed).toBeLessThan(5_000);
    }, 10_000);

    it("still honors a robots Crawl-delay longer than the 3s default", async () => {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: "/robots.txt" })
        .reply(200, "User-agent: *\nCrawl-delay: 3.5");
      pool.intercept({ path: "/cat.jpg" }).reply(200, "cat");

      const started = Date.now();
      await new PoliteClient({
        userAgent: "PosvojiBot/test (+https://posvoji.si/bot)",
      }).getBytes(`${ORIGIN}/cat.jpg`);
      const elapsed = Date.now() - started;

      // If Math.max ever regressed to picking minDelayMs, this would stop at
      // ~3s instead of the declared 3.5s.
      expect(elapsed).toBeGreaterThanOrEqual(3_300);
    }, 10_000);
  });

  describe("get", () => {
    it("decodes utf8 by default", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool
        .intercept({ path: "/pes.html" })
        .reply(200, Buffer.from("ščž", "utf8"), {
          headers: { "content-type": "text/html" },
        });

      const res = await client().get(`${ORIGIN}/pes.html`);

      expect(res.body).toBe("ščž");
    });

    it.skipIf(!hasWindows1250())(
      "decodes a windows-1250 body by its declared charset",
      async () => {
        const pool = agent.get(ORIGIN);
        pool.intercept({ path: "/robots.txt" }).reply(200, "");
        pool
          .intercept({ path: "/pes.html" })
          .reply(200, Buffer.from([0x9a, 0xe8, 0x9e]), {
            headers: { "content-type": "text/html; charset=windows-1250" },
          });

        const res = await client().get(`${ORIGIN}/pes.html`);

        expect(res.body).toBe("ščž");
      },
    );

    it("falls back to utf8 for a charset nobody knows", async () => {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: "/robots.txt" }).reply(200, "");
      pool
        .intercept({ path: "/pes.html" })
        .reply(200, Buffer.from("ščž", "utf8"), {
          headers: { "content-type": "text/html; charset=nonsense-9" },
        });

      const res = await client().get(`${ORIGIN}/pes.html`);

      expect(res.body).toBe("ščž");
    });
  });
});

// The mock agent cannot cut a connection halfway through a body, so this one
// talks to a real socket. It costs one backoff (2s) on purpose.
describe("PoliteClient body reads", () => {
  it("aborts an oversized chunked body without retrying", async () => {
    let hits = 0;
    let chunksSent = 0;
    let firstResponseClosed!: () => void;
    const responseClosed = new Promise<void>((resolve) => {
      firstResponseClosed = resolve;
    });
    const server = createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("");
        return;
      }

      hits += 1;
      res.writeHead(200, { "content-type": "application/octet-stream" });
      const timer = setInterval(() => {
        chunksSent += 1;
        res.write("1234");
        if (chunksSent === 50) res.end();
      }, 5);
      res.on("close", () => {
        clearInterval(timer);
        firstResponseClosed();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/stream`;

    try {
      await expect(
        new PoliteClient({
          userAgent: "PosvojiBot/test (+https://posvoji.si/bot)",
          minDelayMs: 0,
          maxRetries: 1,
        }).getBytes(url, { maxBytes: 5 }),
      ).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
      await responseClosed;

      expect(hits).toBe(1);
      expect(chunksSent).toBeLessThan(50);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("retries a download that dies mid-body", async () => {
    let hits = 0;
    const server = createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("");
        return;
      }
      hits += 1;
      if (hits === 1) {
        // Headers and a first chunk have to reach the client before the socket
        // dies, otherwise this never reaches the body read.
        res.writeHead(200, { "content-length": "64" });
        res.write("half a body", () => {
          setTimeout(() => res.socket?.destroy(), 50);
        });
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("a whole body");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;

    try {
      const res = await new PoliteClient({
        userAgent: "PosvojiBot/test (+https://posvoji.si/bot)",
        minDelayMs: 0,
        maxRetries: 1,
      }).get(`http://127.0.0.1:${port}/pes.html`);

      expect(res.body).toBe("a whole body");
      expect(hits).toBe(2);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }, 15_000);
});
