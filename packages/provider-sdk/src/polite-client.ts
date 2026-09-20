import { request } from "undici";
import robotsParser from "robots-parser";

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;
export const ROBOTS_FAILURE_TTL_MS = 5 * 60 * 1000;
// Gap between two requests to one host unless robots.txt asks for more.
export const DEFAULT_MIN_DELAY_MS = 3_000;
// Longer waits defer the host instead of blocking this process.
const MAX_INLINE_WAIT_MS = 60_000;
// Large enough for the source photos the ingest pipeline accepts, but finite
// so a bad or hostile endpoint cannot exhaust the crawler's memory.
const DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
// RFC 9309 permits crawlers to impose a robots.txt limit of at least 500 KiB.
// 512 KiB keeps that file deliberately much smaller than fetched content.
const MAX_ROBOTS_BYTES = 512 * 1024;
// RFC 9309 asks crawlers to follow at least five robots.txt redirects. The
// same budget is used for content so a moved page is still reachable.
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface PoliteClientOptions {
  userAgent: string;
  // Product token matched against robots.txt rules.
  botName?: string;
  minDelayMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  cooldowns?: {
    get(host: string): number | undefined;
    set(host: string, notBefore: number): void;
  };
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
  // Overrides the default response-body limit. Must be a positive safe
  // integer; the read is aborted as soon as this many bytes are exceeded.
  maxBytes?: number;
  // Consulted once per same-host redirect hop, before the request for the
  // target is made. Returning false hands the redirect response back to the
  // caller unfollowed, the way a cross-origin redirect already is; throwing
  // aborts the request. The client cannot judge a target on its own: only the
  // caller knows which paths its provider policy excludes from the crawl.
  // Without the hook every same-host redirect is followed, as before.
  allowRedirect?: (target: URL, from: URL) => boolean;
}

export class ResponseBodyTooLargeError extends Error {
  readonly url: string;
  readonly maxBytes: number;

  constructor(url: string, maxBytes: number) {
    super(`response body exceeds ${maxBytes} bytes: ${url}`);
    this.name = "ResponseBodyTooLargeError";
    this.url = url;
    this.maxBytes = maxBytes;
  }
}

export function parseRetryAfter(
  header: string | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!header) return undefined;
  const value = header.replace(/^[ \t]+|[ \t]+$/g, "");
  if (/^\d+$/.test(value)) {
    const ms = Number(value) * 1_000;
    return Number.isSafeInteger(ms) && Number.isFinite(new Date(now + ms).getTime())
      ? ms : undefined;
  }
  // RFC 9110 HTTP-date accepts IMF-fixdate and the two legacy forms. Do not
  // feed arbitrary strings ("-1", "1.5", ISO dates) to Date.parse.
  const day = "(Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
  const month = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
  const time = "(\\d{2}:\\d{2}:\\d{2})";
  let canonical = value;
  if (!new RegExp(`^${day}, \\d{2} ${month} \\d{4} ${time} GMT$`).test(value)) {
    const old = value.match(new RegExp(`^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\\d{2})-${month}-(\\d{2}) ${time} GMT$`));
    const ascii = value.match(new RegExp(`^${day} ${month} ([ \\d]\\d) ${time} (\\d{4})$`));
    if (old) {
      const currentYear = new Date(now).getUTCFullYear();
      let year = Math.floor(currentYear / 100) * 100 + Number(old[4]);
      if (year > currentYear + 50) year -= 100;
      canonical = `${old[1]!.slice(0, 3)}, ${old[2]} ${old[3]} ${year} ${old[5]} GMT`;
    } else if (ascii) {
      canonical = `${ascii[1]}, ${ascii[3]!.trim().padStart(2, "0")} ${ascii[2]} ${ascii[5]} ${ascii[4]} GMT`;
    } else return undefined;
  }
  const date = Date.parse(canonical);
  if (!Number.isFinite(date) || new Date(date).toUTCString() !== canonical) return undefined;
  return Math.max(0, date - now);
}

export function computeBackoffMs(
  attempt: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined && Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0) {
    return retryAfterMs;
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

type ResponseBody = AsyncIterable<Uint8Array> & {
  destroy(error?: Error): unknown;
};

interface ReadBodyOptions {
  collect?: boolean;
  honorContentLength?: boolean;
  truncate?: boolean;
}

function validateMaxBytes(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }
}

function declaredContentLength(
  headers: Record<string, string | string[] | undefined>,
): bigint | undefined {
  const value = headerValue(headers["content-length"])?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  return BigInt(value);
}

function throwBodyTooLarge(
  body: ResponseBody,
  url: string,
  maxBytes: number,
): never {
  // Destroying the stream closes the response immediately instead of draining
  // an attacker-controlled body merely to make the connection reusable.
  body.destroy();
  throw new ResponseBodyTooLargeError(url, maxBytes);
}

async function readBodyWithLimit(
  body: ResponseBody,
  headers: Record<string, string | string[] | undefined>,
  url: string,
  maxBytes: number,
  options: ReadBodyOptions = {},
): Promise<Buffer> {
  if (options.honorContentLength !== false) {
    const declared = declaredContentLength(headers);
    if (
      options.truncate !== true &&
      declared !== undefined &&
      declared > BigInt(maxBytes)
    ) {
      throwBodyTooLarge(body, url, maxBytes);
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    if (total + chunk.byteLength > maxBytes) {
      if (options.truncate === true) {
        const remaining = maxBytes - total;
        if (options.collect !== false && remaining > 0) {
          chunks.push(Buffer.from(chunk.subarray(0, remaining)));
        }
        body.destroy();
        return options.collect === false
          ? Buffer.alloc(0)
          : Buffer.concat(chunks, maxBytes);
      }
      throwBodyTooLarge(body, url, maxBytes);
    }
    total += chunk.byteLength;
    if (options.collect !== false) chunks.push(Buffer.from(chunk));
  }
  return options.collect === false
    ? Buffer.alloc(0)
    : Buffer.concat(chunks, total);
}

// The crawl policy lives here so no provider can get it wrong: robots.txt, one
// request at a time per host, a delay between them, backoff, and revalidation.
export class PoliteClient {
  private readonly userAgent: string;
  private readonly botName: string;
  private readonly minDelayMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly cooldowns: NonNullable<PoliteClientOptions["cooldowns"]>;

  private readonly hostQueue = new Map<string, Promise<void>>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly robots = new Map<string, ReturnType<typeof robotsParser>>();
  private readonly pendingRobots = new Map<string, Promise<void>>();
  private readonly robotsFailures = new Map<string, { until: number; error: Error }>();
  private readonly crawlDelayMs = new Map<string, number>();

  constructor(options: PoliteClientOptions) {
    this.userAgent = options.userAgent;
    this.botName = options.botName ?? "PosvojiBot";
    // 3 seconds, one request at a time per host (see withHostLock). robots.txt
    // Crawl-delay wins whenever it asks for longer (see respectDelay's
    // Math.max). This is the floor, not the ceiling: it is the minimum gap the
    // DATA-POLICY.md promise of "vecsekundni razmik" (a multi-second gap)
    // needs, not the maximum a host can ask for.
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.cooldowns = options.cooldowns ?? new Map<string, number>();
  }

  async get(url: string, options?: GetBytesOptions): Promise<PoliteResponse> {
    const res = await this.getBytes(url, options);
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
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    validateMaxBytes(maxBytes);
    const target = new URL(url);
    await this.ensureRobots(target.origin);
    if (!this.isAllowed(target.origin, url)) {
      throw new Error(`robots.txt disallows fetching ${url}`);
    }
    return this.requestWithRetries(target.host, url, options, maxBytes);
  }

  private async requestWithRetries(
    host: string,
    url: string,
    options: GetBytesOptions,
    maxBytes: number,
  ): Promise<PoliteBytesResponse> {
    let current = url;
    for (let hop = 0; ; hop++) {
      const res = await this.withHostLock(host, () =>
        this.attemptWithRetries(host, current, options, maxBytes),
      );
      const redirect =
        hop < MAX_REDIRECTS ? redirectTarget(current, res) : undefined;
      // A cross-origin redirect is handed back untouched: the caller decides
      // whether that other site is one we are allowed to crawl at all.
      if (!redirect) return res;
      const { target, from } = redirect;
      // A same-host redirect can still land somewhere the caller must not
      // fetch, so it gets the same say before the request for the target is
      // made. A refusal ends the follow and hands the redirect back.
      if (options.allowRedirect && !options.allowRedirect(target, from)) {
        return res;
      }
      await this.ensureRobots(target.origin);
      if (!this.isAllowed(target.origin, target.href)) {
        throw new Error(`robots.txt disallows fetching ${target.href}`);
      }
      current = target.href;
    }
  }

  private async attemptWithRetries(
    host: string,
    url: string,
    options: GetBytesOptions,
    maxBytes: number,
    robots = false,
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
        // Honor headers even when the throttled response's body is oversized
        // or resets halfway through downloading.
        if (status === 429 || status === 503 || (robots && status >= 500)) {
          this.deferHost(host, computeBackoffMs(attempt, parseRetryAfter(headerValue(headers["retry-after"]))));
        }
        // The body read is part of the attempt: a reset or a timeout halfway
        // through the download has to be retried like a failed connect.
        if (status === 304) {
          // A 304 Content-Length describes the selected representation, not
          // a response body, so do not reject on that header. Still bound any
          // bytes a non-conforming peer actually sends.
          await readBodyWithLimit(res.body, headers, url, maxBytes, {
            collect: false,
            honorContentLength: false,
          });
          body = null;
        } else {
          body = await readBodyWithLimit(res.body, headers, url, maxBytes, {
            truncate: robots,
          });
        }
      } catch (error) {
        this.lastRequestAt.set(host, Date.now());
        if (error instanceof ResponseBodyTooLargeError) throw error;
        if (attempt >= this.maxRetries) throw error;
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      this.lastRequestAt.set(host, Date.now());

      if (status === 429 || status === 503 || (robots && status >= 500)) {
        const retryAfter = parseRetryAfter(headerValue(headers["retry-after"]));
        const wait = computeBackoffMs(attempt, retryAfter);
        this.deferHost(host, wait);
        if (attempt >= this.maxRetries) {
          if (robots && status >= 500) {
            return { status, body, notModified: false, headers };
          }
          // Returning the 429 would let callers treat a throttled host as an
          // empty one and ship animals without photos.
          throw new Error(
            `rate limited after ${this.maxRetries} retries: ${url} (status ${status})`,
          );
        }
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
    const delay = Math.max(this.minDelayMs, this.crawlDelayMs.get(host) ?? 0);
    const wait = Math.max(
      last === undefined ? 0 : last + delay - Date.now(),
      (this.cooldowns.get(host) ?? 0) - Date.now(),
    );
    if (wait > MAX_INLINE_WAIT_MS) {
      throw new Error(`host ${host} deferred: requested wait exceeds the inline budget`);
    }
    if (wait > 0) await sleep(wait);
  }

  private deferHost(host: string, wait: number): void {
    const until = Date.now() + wait;
    if (!Number.isSafeInteger(until) || !Number.isFinite(new Date(until).getTime())) {
      throw new Error(`host ${host} requested an unrepresentable cooldown`);
    }
    this.cooldowns.set(host, Math.max(
      this.cooldowns.get(host) ?? 0,
      until,
    ));
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
    const failure = this.robotsFailures.get(origin);
    if (failure && failure.until > Date.now()) throw failure.error;
    this.robotsFailures.delete(origin);
    const pending = this.pendingRobots.get(origin);
    if (pending) return pending;
    const loading = this.loadRobots(origin);
    this.pendingRobots.set(origin, loading);
    try {
      await loading;
    } finally {
      this.pendingRobots.delete(origin);
    }
  }

  private async loadRobots(origin: string): Promise<void> {
    const robotsUrl = `${origin}/robots.txt`;
    // If a site can't tell us its rules, we don't crawl it.
    const DISALLOW_ALL = "User-agent: *\nDisallow: /";
    const host = new URL(origin).host;
    let content: string;
    try {
      const res = await this.fetchRobots(robotsUrl);
      if (res.status >= 200 && res.status < 300) {
        content = res.body;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
        // 429 never reaches here: the shared retry path fails closed.
        content = "";
      } else {
        content = DISALLOW_ALL;
      }
    } catch (error) {
      const failure = new Error(`robots.txt for ${origin} unreachable`, { cause: error });
      const now = Date.now();
      for (const [key, cached] of this.robotsFailures) {
        if (cached.until <= now) this.robotsFailures.delete(key);
      }
      // Bound memory as well as time. Evicting an entry permits a fresh robots
      // attempt; it never grants permission to fetch content without rules.
      if (this.robotsFailures.size >= 256) this.robotsFailures.delete(this.robotsFailures.keys().next().value!);
      this.robotsFailures.set(origin, { until: now + ROBOTS_FAILURE_TTL_MS, error: failure });
      throw failure;
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
      const host = new URL(current).host;
      const res = await this.withHostLock(host, () =>
        this.attemptWithRetries(host, current, {}, MAX_ROBOTS_BYTES, true),
      );
      const status = res.status;
      const body = res.body?.toString("utf8") ?? "";
      if (REDIRECT_STATUSES.has(status) && hop < MAX_REDIRECTS) {
        const location = headerValue(res.headers["location"]);
        const next =
          location === undefined ? undefined : resolve(location, current);
        if (next && ["http:", "https:"].includes(next.protocol) && !next.username && !next.password) {
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
    const delay = seconds * 1_000;
    const previous = this.crawlDelayMs.get(host) ?? 0;
    this.crawlDelayMs.set(host, Math.max(previous, delay));
    this.deferHost(host, delay);
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
): { target: URL; from: URL } | undefined {
  if (!REDIRECT_STATUSES.has(res.status)) return undefined;
  const location = headerValue(res.headers["location"]);
  if (location === undefined) return undefined;
  const target = resolve(location, current);
  if (!target) return undefined;
  const from = new URL(current);
  if (target.host !== from.host) return undefined;
  if (target.protocol !== from.protocol) {
    if (from.protocol !== "http:" || target.protocol !== "https:") {
      return undefined;
    }
  }
  // The parsed origin is handed back with the target: the caller needs it to
  // tell a hook where the redirect came from, and parsing it again there was
  // the same string twice.
  return { target, from };
}
