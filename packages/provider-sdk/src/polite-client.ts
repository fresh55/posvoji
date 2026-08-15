import { request } from "undici";
import robotsParser from "robots-parser";

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;
const RETRY_AFTER_CAP_MS = 600_000;

export interface PoliteClientOptions {
  userAgent: string;
  // Product token matched against robots.txt rules.
  botName?: string;
  minDelayMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface PoliteResponse {
  status: number;
  // null when the server answered 304.
  body: string | null;
  notModified: boolean;
  headers: Record<string, string | string[] | undefined>;
}

export function parseRetryAfter(
  header: string | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header)) return Number(header) * 1_000;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export function computeBackoffMs(
  attempt: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, RETRY_AFTER_CAP_MS);
  }
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ConditionalMeta {
  etag?: string;
  lastModified?: string;
}

// The crawl policy lives here so no provider can get it wrong: robots.txt, one
// request at a time per host, a delay between them, backoff, and revalidation.
export class PoliteClient {
  private readonly userAgent: string;
  private readonly botName: string;
  private readonly minDelayMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  private readonly hostQueue = new Map<string, Promise<void>>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly robots = new Map<string, ReturnType<typeof robotsParser>>();
  private readonly conditional = new Map<string, ConditionalMeta>();

  constructor(options: PoliteClientOptions) {
    this.userAgent = options.userAgent;
    this.botName = options.botName ?? "PosvojiBot";
    this.minDelayMs = options.minDelayMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async get(url: string): Promise<PoliteResponse> {
    const target = new URL(url);
    return this.withHostLock(target.host, async () => {
      await this.ensureRobots(target.origin);
      if (!this.isAllowed(target.origin, url)) {
        throw new Error(`robots.txt disallows fetching ${url}`);
      }
      return this.requestWithRetries(target.host, url);
    });
  }

  private async requestWithRetries(
    host: string,
    url: string,
  ): Promise<PoliteResponse> {
    for (let attempt = 0; ; attempt++) {
      await this.respectDelay(host);
      let res;
      try {
        res = await request(url, {
          method: "GET",
          headers: this.buildHeaders(url),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        this.lastRequestAt.set(host, Date.now());
        if (attempt >= this.maxRetries) throw error;
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      this.lastRequestAt.set(host, Date.now());

      const status = res.statusCode;
      if ((status === 429 || status === 503) && attempt < this.maxRetries) {
        await res.body.text().catch(() => "");
        const retryAfter = parseRetryAfter(
          headerValue(res.headers["retry-after"]),
        );
        await sleep(computeBackoffMs(attempt, retryAfter));
        continue;
      }

      if (status === 304) {
        await res.body.text().catch(() => "");
        return { status, body: null, notModified: true, headers: res.headers };
      }

      const body = await res.body.text();
      if (status === 200) {
        const etag = headerValue(res.headers["etag"]);
        const lastModified = headerValue(res.headers["last-modified"]);
        if (etag || lastModified) {
          this.conditional.set(url, { etag, lastModified });
        }
      }
      return { status, body, notModified: false, headers: res.headers };
    }
  }

  private buildHeaders(url: string): Record<string, string> {
    const headers: Record<string, string> = {
      "user-agent": this.userAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    const meta = this.conditional.get(url);
    if (meta?.etag) headers["if-none-match"] = meta.etag;
    if (meta?.lastModified) headers["if-modified-since"] = meta.lastModified;
    return headers;
  }

  private async respectDelay(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host);
    if (last === undefined) return;
    const wait = this.minDelayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }

  private async withHostLock<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.hostQueue.get(host) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    this.hostQueue.set(host, current);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async ensureRobots(origin: string): Promise<void> {
    if (this.robots.has(origin)) return;
    const robotsUrl = `${origin}/robots.txt`;
    // If a site can't tell us its rules, we don't crawl it.
    const DISALLOW_ALL = "User-agent: *\nDisallow: /";
    let content: string;
    try {
      const res = await request(robotsUrl, {
        method: "GET",
        headers: { "user-agent": this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = await res.body.text().catch(() => "");
      if (res.statusCode >= 200 && res.statusCode < 300) {
        content = body;
      } else if (res.statusCode >= 400 && res.statusCode < 500) {
        content = "";
      } else {
        content = DISALLOW_ALL;
      }
    } catch {
      content = DISALLOW_ALL;
    }
    this.lastRequestAt.set(new URL(origin).host, Date.now());
    this.robots.set(origin, robotsParser(robotsUrl, content));
  }

  private isAllowed(origin: string, url: string): boolean {
    const robots = this.robots.get(origin);
    if (!robots) return false;
    return robots.isAllowed(url, this.botName) !== false;
  }
}
