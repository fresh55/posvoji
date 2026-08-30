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

// policy.crawl.excludePaths is a permission boundary (private-owner listings
// live behind those paths), so it is enforced here rather than trusted to
// every parser. Everything else passes straight through.
export function guardExcludedPaths(
  client: CrawlClient,
  policy: ProviderPolicy,
): CrawlClient {
  const excludePaths = policy.crawl.excludePaths;
  if (excludePaths.length === 0) return client;

  const check = (url: string): void => {
    const excluded = excludedPathFor(url, excludePaths);
    if (excluded === undefined) return;
    throw new Error(
      `${policy.providerId}: ${url} is under "${excluded}", which ` +
        `policy.yaml excludes from the crawl; refusing to fetch it`,
    );
  };

  return {
    async get(url) {
      check(url);
      return client.get(url);
    },
    async getBytes(url, options) {
      check(url);
      return client.getBytes(url, options);
    },
  };
}
