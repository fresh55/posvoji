import { describe, expect, it } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import type {
  GetBytesOptions,
  PoliteClient,
  PoliteBytesResponse,
  PoliteResponse,
} from "@posvoji/provider-sdk";
import { excludedPathFor, guardProviderRequests } from "./crawl-guard";
import { loadPolicies } from "./policies";
import { providers } from "./registry";

function policy(excludePaths: string[]): ProviderPolicy {
  return ProviderPolicy.parse({
    providerId: "ljubljana",
    source: "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu",
    enabled: true,
    ingestion: "scrape",
    images: "cache-permitted",
    descriptions: "facts-only",
    permission: { status: "granted", date: "2026-08-18" },
    attribution: "Vir: Zavetišče Ljubljana",
    crawl: { intervalHours: 12, excludePaths },
  });
}

class StubClient {
  calls: string[] = [];

  async get(
    url: string,
    _options?: GetBytesOptions,
  ): Promise<PoliteResponse> {
    this.calls.push(url);
    return { status: 200, body: "<html></html>", notModified: false, headers: {} };
  }

  async getBytes(
    url: string,
    _options?: GetBytesOptions,
  ): Promise<PoliteBytesResponse> {
    this.calls.push(url);
    return {
      status: 200,
      body: Buffer.alloc(0),
      notModified: false,
      headers: {},
    };
  }
}

// Stands in for PoliteClient's internal redirect follow: it asks the caller's
// hook about the target the way requestWithRetries does, and records the URLs
// it would have gone on to request.
class RedirectingClient extends StubClient {
  constructor(private readonly location: string) {
    super();
  }

  override async get(
    url: string,
    options?: GetBytesOptions,
  ): Promise<PoliteResponse> {
    this.calls.push(url);
    const target = new URL(this.location, url);
    if (options?.allowRedirect?.(target, new URL(url)) === false) {
      return {
        status: 302,
        body: null,
        notModified: false,
        headers: { location: this.location },
      };
    }
    this.calls.push(target.href);
    return { status: 200, body: "<html></html>", notModified: false, headers: {} };
  }
}

class StopAfterFirstRequestClient extends StubClient {
  readonly stop = new Error("stop after the guarded request");

  override async get(url: string): Promise<PoliteResponse> {
    this.calls.push(url);
    throw this.stop;
  }

  override async getBytes(url: string): Promise<PoliteBytesResponse> {
    this.calls.push(url);
    throw this.stop;
  }
}

describe("excludedPathFor", () => {
  it("matches an excluded prefix", () => {
    expect(
      excludedPathFor("https://shelter.si/privat-oddaja/muca-1", [
        "/privat-oddaja/",
      ]),
    ).toBe("/privat-oddaja/");
  });

  it("matches through percent encoding", () => {
    expect(
      excludedPathFor("https://shelter.si/oddajo%20lastniki/1", [
        "/oddajo lastniki/",
      ]),
    ).toBe("/oddajo lastniki/");
  });

  it("leaves a path that only looks similar", () => {
    expect(
      excludedPathFor("https://shelter.si/privat", ["/privatno/"]),
    ).toBeUndefined();
  });
});

describe("guardProviderRequests", () => {
  const excluded = policy(["/posvoji-zival/oddajo-lastniki"]);

  it("refuses a fetch under an excluded path", async () => {
    const client = new StubClient();
    const guarded = guardProviderRequests(client, excluded);

    await expect(
      guarded.get(
        "/posvoji-zival/oddajo%2Dlastniki/rex",
      ),
    ).rejects.toThrow(/oddajo-lastniki/);
    await expect(
      guarded.getBytes(
        "https://www.zavetisce-ljubljana.si/posvoji-zival/oddajo-lastniki/rex.jpg",
      ),
    ).rejects.toThrow(/refusing to fetch/);
    expect(client.calls).toEqual([]);
  });

  it("passes everything else straight through", async () => {
    const client = new StubClient();
    const guarded = guardProviderRequests(client, excluded);
    const url = "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu";

    const res = await guarded.get(url);
    await guarded.getBytes(`${url}/rex.jpg`, { accept: "image/*" });

    expect(res.status).toBe(200);
    expect(client.calls).toEqual([url, `${url}/rex.jpg`]);
  });

  it("rejects cross-origin page and image requests before the client sees them", async () => {
    const client = new StubClient();
    const guarded = guardProviderRequests(client, policy([]));

    await expect(guarded.get("https://unrelated.example/animals")).rejects.toThrow(
      /provider crawl requests are limited to https:\/\/www\.zavetisce-ljubljana\.si/,
    );
    await expect(
      guarded.getBytes("https://cdn.unrelated.example/rex.jpg"),
    ).rejects.toThrow(/refusing to fetch/);
    expect(client.calls).toEqual([]);
  });

  it("resolves relative URLs and forwards one canonical request URL", async () => {
    const client = new StubClient();
    const guarded = guardProviderRequests(client, policy([]));

    await guarded.get(
      "/posvoji-zival/v-zavetiscu/../rex?view=full#biography",
    );
    await guarded.getBytes("./photos/../rex.jpg", { accept: "image/*" });

    expect(client.calls).toEqual([
      "https://www.zavetisce-ljubljana.si/posvoji-zival/rex?view=full",
      "https://www.zavetisce-ljubljana.si/posvoji-zival/rex.jpg",
    ]);
  });

  it("allows a same-host HTTP to HTTPS upgrade but never a downgrade", async () => {
    const client = new StubClient();
    const httpPolicy = ProviderPolicy.parse({
      ...policy([]),
      source: "http://shelter.si/animals",
    });
    await guardProviderRequests(client, httpPolicy).get(
      "https://shelter.si/animals/rex",
    );

    await expect(
      guardProviderRequests(client, policy([])).get(
        "http://www.zavetisce-ljubljana.si/animals/rex",
      ),
    ).rejects.toThrow(/refusing to fetch/);
    expect(client.calls).toEqual(["https://shelter.si/animals/rex"]);
  });

  it("refuses a redirect into an excluded path before it is followed", async () => {
    const client = new RedirectingClient("/posvoji-zival/oddajo-lastniki/rex");
    const guarded = guardProviderRequests(client, excluded);
    const url = "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu";

    await expect(guarded.get(url)).rejects.toThrow(
      /oddajo-lastniki.*refusing to fetch it/,
    );
    // The listing itself was fetched; the excluded target never was.
    expect(client.calls).toEqual([url]);
  });

  it("refuses a redirect that leaves the policy origin", async () => {
    const client = new RedirectingClient("https://unrelated.example/rex");
    const guarded = guardProviderRequests(client, policy([]));
    const url = "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu";

    await expect(guarded.get(url)).rejects.toThrow(
      /refusing to fetch https:\/\/unrelated\.example\/rex/,
    );
    expect(client.calls).toEqual([url]);
  });

  it("follows a redirect that stays inside the policy origin", async () => {
    const client = new RedirectingClient("/posvoji-zival/rex");
    const guarded = guardProviderRequests(client, excluded);
    const url = "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu";

    const res = await guarded.get(url);

    expect(res.status).toBe(200);
    expect(client.calls).toEqual([
      url,
      "https://www.zavetisce-ljubljana.si/posvoji-zival/rex",
    ]);
  });

  it("keeps a caller's own redirect hook", async () => {
    const client = new RedirectingClient("/posvoji-zival/rex");
    const guarded = guardProviderRequests(client, excluded);
    const url = "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu";

    const res = await guarded.get(url, { allowRedirect: () => false });

    expect(res.status).toBe(302);
    expect(client.calls).toEqual([url]);
  });

  it("keeps a custom port fixed across an HTTP to HTTPS upgrade", async () => {
    const client = new StubClient();
    const customPortPolicy = ProviderPolicy.parse({
      ...policy([]),
      source: "http://shelter.si:8080/animals",
    });
    const guarded = guardProviderRequests(client, customPortPolicy);

    await guarded.get("https://shelter.si:8080/animals/rex");
    await expect(
      guarded.get("https://shelter.si:8443/animals/rex"),
    ).rejects.toThrow(/refusing to fetch/);
    expect(client.calls).toEqual(["https://shelter.si:8080/animals/rex"]);
  });
});

describe("current provider entry requests", () => {
  const loaded = loadPolicies();
  const policyById = new Map(
    loaded.policies.map(({ policy: loadedPolicy }) => [
      loadedPolicy.providerId,
      loadedPolicy,
    ]),
  );

  it("loads the repository policies used by the provider registry", () => {
    expect(loaded.errors).toEqual([]);
    expect(
      providers.every((provider) => policyById.get(provider.id)?.enabled),
    ).toBe(true);
  });

  for (const provider of providers) {
    it(`${provider.id} starts its crawl on its policy origin`, async () => {
      const currentPolicy = policyById.get(provider.id);
      expect(currentPolicy).toBeDefined();
      if (currentPolicy === undefined) return;

      const client = new StopAfterFirstRequestClient();
      const guarded = guardProviderRequests(
        client,
        currentPolicy,
      ) as unknown as PoliteClient;

      await expect(
        provider.discover({ client: guarded, policy: currentPolicy }),
      ).rejects.toBe(client.stop);
      expect(client.calls).toHaveLength(1);
      expect(new URL(client.calls[0]!).origin).toBe(
        new URL(currentPolicy.source).origin,
      );
    });
  }
});
