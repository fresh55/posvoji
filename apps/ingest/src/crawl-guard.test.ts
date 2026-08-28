import { describe, expect, it } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
  PoliteResponse,
} from "@posvoji/provider-sdk";
import { excludedPathFor, guardExcludedPaths } from "./crawl-guard";

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

  async get(url: string): Promise<PoliteResponse> {
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

describe("guardExcludedPaths", () => {
  const excluded = policy(["/posvoji-zival/oddajo-lastniki"]);

  it("refuses a fetch under an excluded path", async () => {
    const client = new StubClient();
    const guarded = guardExcludedPaths(client, excluded);

    await expect(
      guarded.get(
        "https://www.zavetisce-ljubljana.si/posvoji-zival/oddajo-lastniki/rex",
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
    const guarded = guardExcludedPaths(client, excluded);
    const url = "https://www.zavetisce-ljubljana.si/posvoji-zival/v-zavetiscu";

    const res = await guarded.get(url);
    await guarded.getBytes(`${url}/rex.jpg`, { accept: "image/*" });

    expect(res.status).toBe(200);
    expect(client.calls).toEqual([url, `${url}/rex.jpg`]);
  });

  it("hands back the client itself when nothing is excluded", () => {
    const client = new StubClient();
    expect(guardExcludedPaths(client, policy([]))).toBe(client);
  });
});
