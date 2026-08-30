import type {
  GetBytesOptions,
  PoliteBytesResponse,
  PoliteResponse,
} from "@posvoji/provider-sdk";
import type { ProviderPolicy } from "@posvoji/schema";

// The slice of PoliteClient a provider uses. Structural on purpose: the guard
// wraps whatever the SDK hands over without depending on the class.
export interface CrawlClient {
  get(url: string): Promise<PoliteResponse>;
  getBytes(url: string, options?: GetBytesOptions): Promise<PoliteBytesResponse>;
}

function effectivePort(url: URL): string {
  if (url.port !== "") return url.port;
  return url.protocol === "http:" ? "80" : "443";
}

function isAllowedOrigin(source: URL, target: URL): boolean {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return false;
  }
  if (target.origin === source.origin) return true;

  // A site may redirect its old HTTP address to HTTPS. Keep that upgrade
  // narrow: the hostname must be identical and the request must either keep
  // the effective port or move from the normal HTTP port to normal HTTPS.
  if (
    source.protocol !== "http:" ||
    target.protocol !== "https:" ||
    target.hostname !== source.hostname
  ) {
    return false;
  }
  const fromPort = effectivePort(source);
  const toPort = effectivePort(target);
  return fromPort === toPort || (fromPort === "80" && toPort === "443");
}

function canonicalRequestUrl(
  input: string,
  policy: ProviderPolicy,
  source: URL,
): string {
  let target: URL;
  try {
    // Resolving here also lets adapters hand the client a root-relative link
    // without teaching the underlying PoliteClient about provider policy.
    target = new URL(input, source);
  } catch (error) {
    throw new Error(`${policy.providerId}: invalid provider crawl URL`, {
      cause: error,
    });
  }

  try {
    decodeURIComponent(target.pathname);
  } catch (error) {
    throw new Error(
      `${policy.providerId}: provider crawl URL has invalid path encoding`,
      { cause: error },
    );
  }

  if (
    target.username !== "" ||
    target.password !== "" ||
    !isAllowedOrigin(source, target)
  ) {
    const safeTarget =
      target.origin === "null"
        ? `${target.protocol}<non-http-url>`
        : `${target.origin}${target.pathname}${target.search}${target.hash}`;
    throw new Error(
      `${policy.providerId}: refusing to fetch ${safeTarget}; provider crawl ` +
        `requests are limited to ${source.origin}`,
    );
  }

  // Fragments are client-side identifiers, never part of an HTTP request.
  target.hash = "";
  return target.href;
}

// excludePaths entries are path prefixes, e.g. "/privat-oddaja/". The
// comparison is on the decoded pathname so a percent-encoded link to an
// excluded section is caught too.
export function excludedPathFor(
  url: string,
  excludePaths: readonly string[],
): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Not a URL the client could fetch either; let it fail on its own terms.
    return undefined;
  }
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape stays as it is and is compared raw.
  }
  return excludePaths.find((excluded) => decoded.startsWith(excluded));
}

// Both rules are central rather than trusted to every parser: a provider may
// crawl only its policy source origin, and excluded private-owner paths may
// never reach the network even when a link percent-encodes part of the path.
export function guardProviderRequests(
  client: CrawlClient,
  policy: ProviderPolicy,
): CrawlClient {
  const source = new URL(policy.source);
  const excludePaths = policy.crawl.excludePaths;

  const check = (input: string): string => {
    const url = canonicalRequestUrl(input, policy, source);
    const excluded = excludedPathFor(url, excludePaths);
    if (excluded !== undefined) {
      throw new Error(
        `${policy.providerId}: ${url} is under "${excluded}", which ` +
          `policy.yaml excludes from the crawl; refusing to fetch it`,
      );
    }
    return url;
  };

  return {
    async get(url) {
      return client.get(check(url));
    },
    async getBytes(url, options) {
      return client.getBytes(check(url), options);
    },
  };
}
