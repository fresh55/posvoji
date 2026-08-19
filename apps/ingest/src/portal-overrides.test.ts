import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  applyOverrides,
  baselineFieldKeys,
  buildOverrideReport,
  fetchPortalOverrides,
  overrideFieldKeys,
  PortalExportPayload,
} from "./portal-overrides";

function animal(overrides: Partial<Animal> & { id: string }): Animal {
  return {
    source: {
      providerId: "macja-hisa",
      sourceUrl: `https://example.si/${overrides.id}`,
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: "macja-hisa", name: "Zavetišče", city: "Celje" },
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...overrides,
  };
}

function payload(
  overrides: PortalExportPayload["overrides"],
): PortalExportPayload {
  return { generatedAt: "2026-08-18T06:00:00Z", overrides };
}

describe("PortalExportPayload", () => {
  it("accepts a valid payload", () => {
    const result = PortalExportPayload.safeParse(
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { name: "Luna", status: "reserved" },
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("accepts the good-with keys", () => {
    const result = PortalExportPayload.safeParse(
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: {
            goodWithKids: "yes",
            goodWithDogs: "no",
            goodWithCats: "unknown",
          },
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an energy level and rejects one outside the enum", () => {
    expect(
      PortalExportPayload.safeParse(
        payload([
          {
            providerId: "macja-hisa",
            animalId: "macja-hisa:luna",
            fields: { energy: "calm" },
          },
        ]),
      ).success,
    ).toBe(true);

    const raw: unknown = {
      generatedAt: "2026-08-18T06:00:00Z",
      overrides: [
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { energy: "hyper" },
        },
      ],
    };
    expect(PortalExportPayload.safeParse(raw).success).toBe(false);
  });

  it("rejects a good-with value outside yes/no/unknown", () => {
    const raw: unknown = {
      generatedAt: "2026-08-18T06:00:00Z",
      overrides: [
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { goodWithKids: "maybe" },
        },
      ],
    };
    expect(PortalExportPayload.safeParse(raw).success).toBe(false);
  });

  it("rejects an unknown key inside fields", () => {
    const raw: unknown = {
      generatedAt: "2026-08-18T06:00:00Z",
      overrides: [
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { name: "Luna", ownerPhone: "041 000 000" },
        },
      ],
    };
    const result = PortalExportPayload.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe("applyOverrides", () => {
  it("merges override fields over the matching animal and keeps untouched fields", () => {
    const luna = animal({ id: "macja-hisa:luna", name: "Luna", breed: "domača" });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { status: "reserved", shortDescription: "Rezervirana." },
        },
      ]),
    );

    expect(result.applied).toBe(1);
    expect(result.unmatched).toHaveLength(0);
    expect(result.animals[0]).toMatchObject({
      status: "reserved",
      shortDescription: "Rezervirana.",
      name: "Luna",
      breed: "domača",
    });
  });

  it("applies the shelter's energy level over whatever the crawl found", () => {
    const luna = animal({ id: "macja-hisa:luna", energy: "lively" });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { energy: "calm" },
        },
      ]),
    );

    expect(result.applied).toBe(1);
    expect(result.animals[0]?.energy).toBe("calm");
  });

  it("leaves animals without a matching override unchanged", () => {
    const luna = animal({ id: "macja-hisa:luna" });
    const result = applyOverrides([luna], payload([]));
    expect(result.applied).toBe(0);
    expect(result.animals).toEqual([luna]);
  });

  it("throws when an override would produce an animal the schema rejects", () => {
    const luna = animal({ id: "macja-hisa:luna" });
    expect(() =>
      applyOverrides(
        [luna],
        payload([
          {
            providerId: "macja-hisa",
            animalId: "macja-hisa:luna",
            fields: { approximateAgeMonths: -1 },
          },
        ]),
      ),
    ).toThrow();
  });

  it("folds the flat good-with keys into the nested goodWith block", () => {
    const luna = animal({ id: "macja-hisa:luna" });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { goodWithKids: "yes", goodWithDogs: "no" },
        },
      ]),
    );

    expect(result.applied).toBe(1);
    expect(result.animals[0]?.goodWith).toEqual({ kids: "yes", dogs: "no" });
  });

  it("applies an explicit unknown over a scraped answer", () => {
    const luna = animal({
      id: "macja-hisa:luna",
      goodWith: { kids: "yes", cats: "yes" },
    });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { goodWithKids: "unknown" },
        },
      ]),
    );

    // "unknown" is the shelter answering, not the field being absent, so it
    // replaces the crawled "yes" and leaves the group it did not answer.
    expect(result.animals[0]?.goodWith).toEqual({ kids: "unknown", cats: "yes" });
  });

  it("leaves a scraped good-with answer alone when the override omits it", () => {
    const luna = animal({
      id: "macja-hisa:luna",
      goodWith: { dogs: "no" },
    });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { name: "Luna" },
        },
      ]),
    );

    expect(result.animals[0]?.goodWith).toEqual({ dogs: "no" });
  });

  it("throws on a good-with value outside yes/no/unknown", () => {
    const luna = animal({ id: "macja-hisa:luna" });
    const raw: unknown = { goodWithCats: "maybe" };
    expect(() =>
      applyOverrides(
        [luna],
        payload([
          {
            providerId: "macja-hisa",
            animalId: "macja-hisa:luna",
            fields: raw as never,
          },
        ]),
      ),
    ).toThrow();
  });

  it("reports overrides whose animal is not in the dataset as unmatched, without failing", () => {
    const luna = animal({ id: "macja-hisa:luna" });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:mia",
          fields: { name: "Mia" },
        },
      ]),
    );

    expect(result.applied).toBe(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]?.animalId).toBe("macja-hisa:mia");
    expect(result.animals).toEqual([luna]);
  });

  it("does not match an animal id across a different providerId", () => {
    const luna = animal({ id: "shared-id" });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "other-shelter",
          animalId: "shared-id",
          fields: { name: "Not Luna" },
        },
      ]),
    );

    expect(result.applied).toBe(0);
    expect(result.unmatched).toHaveLength(1);
  });
});

describe("fetchPortalOverrides", () => {
  const originalUrl = process.env["PORTAL_EXPORT_URL"];
  const originalToken = process.env["PORTAL_EXPORT_TOKEN"];
  const originalFixture = process.env["PORTAL_EXPORT_FIXTURE"];

  beforeEach(() => {
    delete process.env["PORTAL_EXPORT_URL"];
    delete process.env["PORTAL_EXPORT_TOKEN"];
    delete process.env["PORTAL_EXPORT_FIXTURE"];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("fetch should not be called in this test");
      }),
    );
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env["PORTAL_EXPORT_URL"];
    else process.env["PORTAL_EXPORT_URL"] = originalUrl;
    if (originalToken === undefined) delete process.env["PORTAL_EXPORT_TOKEN"];
    else process.env["PORTAL_EXPORT_TOKEN"] = originalToken;
    if (originalFixture === undefined)
      delete process.env["PORTAL_EXPORT_FIXTURE"];
    else process.env["PORTAL_EXPORT_FIXTURE"] = originalFixture;
    vi.unstubAllGlobals();
  });

  it("returns null without making a network call when env vars are unset", async () => {
    const result = await fetchPortalOverrides();
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when only the URL is set", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";
    const result = await fetchPortalOverrides();
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a saved export from disk instead of the network", async () => {
    process.env["PORTAL_EXPORT_FIXTURE"] = join(
      import.meta.dirname,
      "..",
      "fixtures",
      "portal-export.example.json",
    );

    const result = await fetchPortalOverrides();

    // The whole override path has to be exercisable offline, so a saved
    // payload stands in for a Django deployment.
    expect(fetch).not.toHaveBeenCalled();
    expect(result?.overrides).toHaveLength(2);
    expect(result?.overrides[0]?.baseline).toEqual({
      status: "available",
      energy: null,
    });
  });

  it("prefers the fixture over a configured URL", async () => {
    process.env["PORTAL_EXPORT_URL"] = "https://portal.posvoji.si";
    process.env["PORTAL_EXPORT_TOKEN"] = "secret";
    process.env["PORTAL_EXPORT_FIXTURE"] = join(
      import.meta.dirname,
      "..",
      "fixtures",
      "portal-export.example.json",
    );

    await fetchPortalOverrides();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when the saved export does not match the contract", async () => {
    const path = join(tmpdir(), "posvoji-bad-portal-export.json");
    writeFileSync(path, JSON.stringify({ generatedAt: "2026-08-18T06:00:00Z" }));
    process.env["PORTAL_EXPORT_FIXTURE"] = path;

    await expect(fetchPortalOverrides()).rejects.toThrow(/failed validation/);
  });
});

describe("baseline contract", () => {
  it("covers exactly the fields an override can carry", () => {
    // A field added to OverrideFields without a matching baseline key would
    // silently never be checked for conflicts, and the portal sending its
    // baseline would fail strict validation of the whole payload.
    expect(baselineFieldKeys).toEqual(overrideFieldKeys);
  });

  it("accepts a null baseline value and rejects an unknown key", () => {
    expect(
      PortalExportPayload.safeParse(
        payload([
          {
            providerId: "macja-hisa",
            animalId: "macja-hisa:luna",
            fields: { energy: "calm" },
            baseline: { energy: null },
            recordedAt: "2026-08-17T09:30:00Z",
          },
        ]),
      ).success,
    ).toBe(true);

    const raw: unknown = {
      generatedAt: "2026-08-18T06:00:00Z",
      overrides: [
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { name: "Luna" },
          baseline: { ownerPhone: "041 000 000" },
        },
      ],
    };
    expect(PortalExportPayload.safeParse(raw).success).toBe(false);
  });

  it("accepts an override with no baseline at all", () => {
    expect(
      PortalExportPayload.safeParse(
        payload([
          {
            providerId: "macja-hisa",
            animalId: "macja-hisa:luna",
            fields: { name: "Luna" },
          },
        ]),
      ).success,
    ).toBe(true);
  });
});

describe("conflict detection", () => {
  function withBaseline(
    fields: PortalExportPayload["overrides"][number]["fields"],
    baseline: PortalExportPayload["overrides"][number]["baseline"],
  ): PortalExportPayload {
    return payload([
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:luna",
        fields,
        baseline,
        recordedAt: "2026-08-17T09:30:00Z",
      },
    ]);
  }

  it("reports nothing while the crawl still says what it said", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "available" });
    const result = applyOverrides(
      [luna],
      withBaseline({ status: "reserved" }, { status: "available" }),
    );

    // The override and the crawl disagree, which is the point of an
    // override. Only a source that has moved is a conflict.
    expect(result.conflicts).toEqual([]);
    expect(result.animals[0]?.status).toBe("reserved");
  });

  it("reports a moved source and still ships the correction", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "adopted" });
    const result = applyOverrides(
      [luna],
      withBaseline({ status: "reserved" }, { status: "available" }),
    );

    expect(result.conflicts).toEqual([
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:luna",
        field: "status",
        kind: "moved",
        baseline: "available",
        crawled: "adopted",
        override: "reserved",
        recordedAt: "2026-08-17T09:30:00Z",
      },
    ]);
    // The policy is that the shelter keeps winning until a human says
    // otherwise, so the conflict changes what is reported, not what ships.
    expect(result.animals[0]?.status).toBe("reserved");
  });

  it("tells a crawl that caught up apart from one that moved away", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "reserved" });
    const result = applyOverrides(
      [luna],
      withBaseline({ status: "reserved" }, { status: "available" }),
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("caught-up");
  });

  it("treats a crawl that starts stating a field as a moved source", () => {
    const luna = animal({ id: "macja-hisa:luna", energy: "lively" });
    const result = applyOverrides(
      [luna],
      withBaseline({ energy: "calm" }, { energy: null }),
    );

    expect(result.conflicts[0]).toMatchObject({
      field: "energy",
      kind: "moved",
      baseline: null,
      crawled: "lively",
    });
  });

  it("reads the nested good-with block for the flat wire key", () => {
    const luna = animal({
      id: "macja-hisa:luna",
      goodWith: { dogs: "unknown" },
    });
    const result = applyOverrides(
      [luna],
      withBaseline({ goodWithDogs: "yes" }, { goodWithDogs: "no" }),
    );

    expect(result.conflicts[0]).toMatchObject({
      field: "goodWithDogs",
      baseline: "no",
      crawled: "unknown",
    });
  });

  it("reports nothing for a field with no recorded baseline", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "adopted", breed: "x" });
    const result = applyOverrides(
      [luna],
      withBaseline({ status: "reserved", breed: "domača" }, { breed: "y" }),
    );

    // status has no baseline, so there is nothing to say it moved from.
    expect(result.conflicts.map((c) => c.field)).toEqual(["breed"]);
  });

  it("reports nothing when the payload carries no baseline", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "adopted" });
    const result = applyOverrides(
      [luna],
      payload([
        {
          providerId: "macja-hisa",
          animalId: "macja-hisa:luna",
          fields: { status: "reserved" },
        },
      ]),
    );

    expect(result.conflicts).toEqual([]);
  });

  it("reports each moved field of one animal separately", () => {
    const luna = animal({
      id: "macja-hisa:luna",
      status: "adopted",
      breed: "mešanec",
    });
    const result = applyOverrides(
      [luna],
      withBaseline(
        { status: "reserved", breed: "mešanec" },
        { status: "available", breed: "domača" },
      ),
    );

    expect(
      Object.fromEntries(result.conflicts.map((c) => [c.field, c.kind])),
    ).toEqual({ status: "moved", breed: "caught-up" });
  });
});

describe("buildOverrideReport", () => {
  const generatedAt = "2026-08-19T06:00:00Z";

  it("says so when no portal is configured", () => {
    const report = buildOverrideReport(generatedAt, null, null);

    // An empty report with enabled false cannot be read as "the shelters
    // have corrected nothing".
    expect(report).toEqual({
      generatedAt,
      enabled: false,
      applied: [],
      unmatched: [],
      conflicts: [],
    });
  });

  it("separates what landed from what matched no animal", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "available" });
    const input = payload([
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:luna",
        fields: { status: "reserved", name: "Luna" },
        baseline: { status: "available" },
        recordedAt: "2026-08-17T09:30:00Z",
      },
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:mia",
        fields: { name: "Mia" },
        recordedAt: "2026-06-01T09:30:00Z",
      },
    ]);
    const result = applyOverrides([luna], input);

    const report = buildOverrideReport(generatedAt, input, result);

    expect(report.enabled).toBe(true);
    expect(report.portalGeneratedAt).toBe("2026-08-18T06:00:00Z");
    expect(report.applied).toEqual([
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:luna",
        fields: ["name", "status"],
        recordedAt: "2026-08-17T09:30:00Z",
      },
    ]);
    // An override that matches nothing keeps its age in the report, which is
    // how one that has quietly outlived its animal becomes visible.
    expect(report.unmatched).toEqual([
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:mia",
        fields: ["name"],
        recordedAt: "2026-06-01T09:30:00Z",
      },
    ]);
  });

  it("carries the conflicts through", () => {
    const luna = animal({ id: "macja-hisa:luna", status: "adopted" });
    const input = payload([
      {
        providerId: "macja-hisa",
        animalId: "macja-hisa:luna",
        fields: { status: "reserved" },
        baseline: { status: "available" },
      },
    ]);

    const report = buildOverrideReport(generatedAt, input, applyOverrides([luna], input));

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]?.kind).toBe("moved");
  });
});
