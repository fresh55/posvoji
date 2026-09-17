import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PoliteClient, PoliteResponse, ProviderContext } from "@posvoji/provider-sdk";
import { guardProviderRequests, isAllowedListingUrl, type CrawlClient } from "./crawl-guard";
import { loadPolicies, validateCrawlAllowlists } from "./policies";
import { providers } from "./registry";

const loaded = loadPolicies();
const byId = new Map(loaded.policies.map((item) => [item.policy.providerId, item]));
const stop = new Error("request reached fixture transport");

function stoppingClient(calls: string[] = []): CrawlClient {
  const request = async (url: string): Promise<never> => {
    calls.push(url);
    throw stop;
  };
  return { get: request, getBytes: request };
}

function discoveryPageCount(providerId: string): number {
  if (providerId === "turk") return 3;
  return ["muri", "mala-hisa", "obalno", "zonzani"].includes(providerId) ? 2 : 1;
}

function discoveryResponse(providerId: string, dir: string, url: URL): PoliteResponse {
  let file = "list.html";
  const headers: Record<string, string> = {};
  if (providerId === "mala-hisa" || providerId === "obalno") {
    file = /psi/.test(url.pathname) ? "list-dogs.html" : "list-cats.html";
  }
  if (providerId === "turk") {
    const dogs = url.searchParams.get("categories") === "4";
    headers["x-wp-totalpages"] = dogs ? "2" : "1";
    file = dogs ? `list-dogs-page-${url.searchParams.get("page")}.json` : "list-cats.json";
  }
  return {
    status: 200,
    body: readFileSync(join(dir, "fixtures", file), "utf8"),
    notModified: false,
    headers,
  };
}

describe("all registered provider allowlists", () => {
  it("requires coverage for every enabled crawler", () => {
    expect(loaded.errors).toEqual([]);
    expect(validateCrawlAllowlists(loaded.policies)).toEqual([]);
  });

  for (const provider of providers) {
    it(`${provider.id}: admits fixture discovery, pagination and detail requests`, async () => {
      const { policy, dir } = byId.get(provider.id)!;
      const discoveryCalls: string[] = [];
      const transport: CrawlClient = {
        async get(input) {
          discoveryCalls.push(input);
          return discoveryResponse(provider.id, dir, new URL(input));
        },
        async getBytes() { throw new Error("unexpected discovery binary request"); },
      };
      const ctx: ProviderContext = { policy, client: guardProviderRequests(transport, policy) as PoliteClient };
      const refs = await provider.discover(ctx);
      expect(refs.length).toBeGreaterThan(0);
      expect(discoveryCalls).toHaveLength(discoveryPageCount(provider.id));
      const detailCalls: string[] = [];
      const detailTransport = stoppingClient(detailCalls);
      for (const ref of refs) {
        expect(isAllowedListingUrl(ref.sourceUrl, policy)).toBe(true);
        const detailCtx = { policy, client: guardProviderRequests(detailTransport, policy, ref.sourceUrl) as PoliteClient };
        // Turk already received each record in its category API response.
        if (provider.id === "turk") await expect(provider.fetch(detailCtx, ref)).resolves.toBeDefined();
        else await expect(provider.fetch(detailCtx, ref)).rejects.toBe(stop);
      }
      if (provider.id === "turk") {
        const ref = { sourceAnimalId: "999999", sourceUrl: "https://zavetisceturk.com/index.php/2026/09/17/fixture/" };
        await expect(provider.fetch({ policy, client: guardProviderRequests(detailTransport, policy, ref.sourceUrl) as PoliteClient }, ref)).rejects.toBe(stop);
        expect(detailCalls[0]).toContain("/wp-json/wp/v2/posts/999999?");
      } else expect(detailCalls).toHaveLength(refs.length);
    });

    it(`${provider.id}: refuses unknown direct paths and redirect targets before fetching`, async () => {
      const { policy } = byId.get(provider.id)!;
      const calls: string[] = [];
      const transport: CrawlClient = {
        async get(url, options) {
          calls.push(url);
          options?.allowRedirect?.(new URL("/unlisted-private-section/fixture", url), new URL(url));
          throw new Error("redirect guard did not refuse the target");
        },
        async getBytes(url) { calls.push(url); throw new Error("unexpected bytes request"); },
      };
      const guarded = guardProviderRequests(transport, policy);
      for (const method of ["get", "getBytes"] as const) {
        await expect(guarded[method]("/unlisted-private-section/fixture")).rejects.toThrow(/outside crawl.allowPaths/);
      }
      expect(calls).toEqual([]);
      const entry = new URL(policy.crawl.allowPaths![0]!, policy.source).href;
      await expect(guarded.get(entry)).rejects.toThrow(/outside crawl.allowPaths/);
      expect(calls).toEqual([entry]);
    });
  }

  it("scopes Horjul's discovered URL to one fetch and refuses unrelated redirects", async () => {
    const { policy } = byId.get("horjul")!;
    const url = new URL("/fixture-animal/", policy.source).href;
    const calls: string[] = [];
    const transport = stoppingClient(calls);
    await expect(guardProviderRequests(transport, policy).get(url)).rejects.toThrow(/outside/);
    await expect(guardProviderRequests(transport, policy, url).get(url)).rejects.toBe(stop);
    const scoped = guardProviderRequests(transport, policy, url);
    await expect(scoped.get("/another-animal/")).rejects.toThrow(/outside/);
    await expect(scoped.get(`${url}?unreviewed=1`)).rejects.toThrow(/outside/);
    const redirecting: CrawlClient = {
      ...transport,
      async get(input, options) {
        options!.allowRedirect!(new URL("/another-animal/", input), new URL(input));
        throw stop;
      },
    };
    await expect(guardProviderRequests(redirecting, policy, url).get(url)).rejects.toThrow(/outside/);
    const excluded = { ...policy, crawl: { ...policy.crawl, excludePaths: ["/fixture-animal/"] } };
    await expect(guardProviderRequests(transport, excluded, url).get(url)).rejects.toThrow(/excludes/);
    expect(calls).toEqual([url]);
  });

  it("never lets a Turk public permalink authorize an HTTP request", async () => {
    const { policy } = byId.get("turk")!;
    const url = new URL("/index.php/2026/09/17/fixture/", policy.source).href;
    const transport = stoppingClient();
    expect(isAllowedListingUrl(url, policy)).toBe(true);
    expect(isAllowedListingUrl("https://unrelated.example/fixture", policy)).toBe(false);
    await expect(guardProviderRequests(transport, policy, url).get(url)).rejects.toThrow(/outside/);
  });
});
