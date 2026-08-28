import { request } from "undici";
import robotsParser from "robots-parser";

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;
const RETRY_AFTER_CAP_MS = 600_000;
// RFC 9309 asks crawlers to follow at least five robots.txt redirects. The
// same budget is used for content so a moved page is still reachable.
const MAX_REDIRECTS = 5;
// A hostile or mistyped Crawl-delay must not stall the whole export.
const CRAWL_DELAY_CAP_MS = 60_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

export interface PoliteBytesResponse {
  status: number;
  // null when the server answered 304.
  body: Buffer | null;
  notModified: boolean;
  headers: Record<string, string | string[] | undefined>;
}

// Validators persisted by a caller across runs. The client never invents
// them: a conditional request happens only when a caller passes these.
export interface ConditionalValidators {
  etag?: string;
  lastModified?: string;
}

export interface GetBytesOptions {
  accept?: string;
  validators?: ConditionalValidators;
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

function parseCharset(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match?.[1]?.toLowerCase();
}

// Slovenian shelter pages are still served as windows-1250 or iso-8859-2 here
// and there. Decoding those as utf8 mangles c, s and z with diacritics.
function decodeBody(body: Buffer, contentType: string | undefined): string {
  const charset = parseCharset(contentType);
  if (!charset || charset === "utf-8" || charset === "utf8") {
    return body.toString("utf8");
  }
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString("utf8");
  }
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
  private readonly crawlDelayMs = new Map<string, number>();

  constructor(options: PoliteClientOptions) {
    this.userAgent = options.userAgent;
    this.botName = options.botName ?? "PosvojiBot";
    this.minDelayMs = options.minDelayMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async get(url: string): Promise<PoliteResponse> {
    const res = await this.getBytes(url);
    const contentType = headerValue(res.headers["content-type"]);
    return {
      ...res,
      body: res.body === null ? null : decodeBody(res.body, contentType),
    };
  }

  // Same crawl policy as get(), but the body stays binary (images). Callers
  // that persist validators across runs pass them via options.validators.
  async getBytes(
    url: string,
    options: GetBytesOptions = {},
  ): Promise<PoliteBytesResponse> {
    const target = new URL(url);
    return this.withHostLock(target.host, async () => {
      await this.ensureRobots(target.origin);
      if (!this.isAllowed(target.origin, url)) {
        throw new Error(`robots.txt disallows fetching ${url}`);
      }
      return this.requestWithRetries(target.host, url, options);
    });
  }

  private async requestWithRetries(
    host: string,
    url: string,
    options: GetBytesOptions,
  ): Promise<PoliteBytesResponse> {
    let current = url;
    for (let hop = 0; ; hop++) {
      const res = await this.attemptWithRetries(host, current, options);
      const next =
        hop < MAX_REDIRECTS ? redirectTarget(current, res) : undefined;
      // A cross-origin redirect is handed back untouched: the caller decides
      // whether that other site is one we are allowed to crawl at all.
      if (!next) return res;
      await this.ensureRobots(next.origin);
      if (!this.isAllowed(next.origin, next.href)) {
        throw new Error(`robots.txt disallows fetching ${next.href}`);
      }
      current = next.href;
    }
  }

  private async attemptWithRetries(
    host: string,
    url: string,
    options: GetBytesOptions,
  ): Promise<PoliteBytesResponse> {
    for (let attempt = 0; ; attempt++) {
      await this.respectDelay(host);
      let status: number;
      let headers: Record<string, string | string[] | undefined>;
      let body: Buffer | null;
      try {
        const res = await request(url, {
          method: "GET",
          headers: this.buildHeaders(options),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        status = res.statusCode;
        headers = res.headers;
        // The body read is part of the attempt: a reset or a timeout halfway
        // through the download has to be retried like a failed connect.
        if (status === 304) {
          await res.body.arrayBuffer();
          body = null;
        } else {
          body = Buffer.from(await res.body.arrayBuffer());
        }
      } catch (error) {
        this.lastRequestAt.set(host, Date.now());
        if (attempt >= this.maxRetries) throw error;
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      this.lastRequestAt.set(host, Date.now());

      if (status === 429 || status === 503) {
        if (attempt >= this.maxRetries) {
          // Returning the 429 would let callers treat a throttled host as an
          // empty one and ship animals without photos.
          throw new Error(
            `rate limited after ${this.maxRetries} retries: ${url} (status ${status})`,
          );
        }
        const retryAfter = parseRetryAfter(headerValue(headers["retry-after"]));
        await sleep(computeBackoffMs(attempt, retryAfter));
        continue;
      }

      return { status, body, notModified: status === 304, headers };
    }
  }

  private buildHeaders(options: GetBytesOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "user-agent": this.userAgent,
      accept:
        options.accept ??
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    const meta = options.validators;
    if (meta?.etag) headers["if-none-match"] = meta.etag;
    if (meta?.lastModified) headers["if-modified-since"] = meta.lastModified;
    return headers;
  }

  private async respectDelay(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host);
    if (last === undefined) return;
    const delay = Math.max(this.minDelayMs, this.crawlDelayMs.get(host) ?? 0);
    const wait = delay - (Date.now() - last);
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
    const host = new URL(origin).host;
    let content: string;
    for (let attempt = 0; ; attempt++) {
      await this.respectDelay(host);
      try {
        const res = await this.fetchRobots(robotsUrl);
        this.lastRequestAt.set(host, Date.now());
        if (res.status >= 200 && res.status < 300) {
          content = res.body;
        } else if (res.status === 401 || res.status === 403) {
          // The site is refusing this bot, not failing to answer.
          content = DISALLOW_ALL;
        } else if (res.status >= 400 && res.status < 500) {
          content = "";
        } else if (res.status >= 500) {
          // A 5xx is the site failing to answer, not answering "no", so it is
          // retried like a network error. RFC 9309 still asks us to read a
          // robots.txt we cannot get as "unavailable", but only once the site
          // has kept failing: a single bad gateway is not that.
          if (attempt < this.maxRetries) {
            await sleep(computeBackoffMs(attempt));
            continue;
          }
          content = DISALLOW_ALL;
        } else {
          content = DISALLOW_ALL;
        }
        break;
      } catch (error) {
        this.lastRequestAt.set(host, Date.now());
        if (attempt >= this.maxRetries) {
          // Nothing is cached, so a later call gets a fresh chance instead of
          // the origin staying denied for the rest of the process.
          throw new Error(`robots.txt for ${origin} unreachable`, {
            cause: error,
          });
        }
        await sleep(computeBackoffMs(attempt));
      }
    }
    const robots = robotsParser(robotsUrl, content);
    this.robots.set(origin, robots);
    this.recordCrawlDelay(host, robots.getCrawlDelay(this.botName));
  }

  private async fetchRobots(
    robotsUrl: string,
  ): Promise<{ status: number; body: string }> {
    let current = robotsUrl;
    for (let hop = 0; ; hop++) {
      const res = await request(current, {
        method: "GET",
        headers: { "user-agent": this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const status = res.statusCode;
      const body = await res.body.text();
      if (REDIRECT_STATUSES.has(status) && hop < MAX_REDIRECTS) {
        const location = headerValue(res.headers["location"]);
        const next =
          location === undefined ? undefined : resolve(location, current);
        if (next) {
          current = next.href;
          continue;
        }
      }
      return { status, body };
    }
  }

  private recordCrawlDelay(host: string, seconds: number | undefined): void {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    const delay = Math.min(seconds * 1_000, CRAWL_DELAY_CAP_MS);
    const previous = this.crawlDelayMs.get(host) ?? 0;
    this.crawlDelayMs.set(host, Math.max(previous, delay));
  }

  private isAllowed(origin: string, url: string): boolean {
    const robots = this.robots.get(origin);
    if (!robots) return false;
    return robots.isAllowed(url, this.botName) !== false;
  }
}

function resolve(location: string, base: string): URL | undefined {
  try {
    return new URL(location, base);
  } catch {
    return undefined;
  }
}

// Only a redirect that stays on the same host is followed, and a scheme change
// only as an http to https upgrade. Anything else is the caller's call.
function redirectTarget(
  current: string,
  res: PoliteBytesResponse,
): URL | undefined {
  if (!REDIRECT_STATUSES.has(res.status)) return undefined;
  const location = headerValue(res.headers["location"]);
  if (location === undefined) return undefined;
  const next = resolve(location, current);
  if (!next) return undefined;
  const from = new URL(current);
  if (next.host !== from.host) return undefined;
  if (next.protocol !== from.protocol) {
    if (from.protocol !== "http:" || next.protocol !== "https:") {
      return undefined;
    }
  }
  return next;
}
