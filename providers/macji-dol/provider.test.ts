import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, { parseDetail, parseIntakeDate, parseList } from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

describe("policy.yaml", () => {
  it("records permission for descriptions and cacheable photos", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission.status).toBe("granted");
    expect(policy.permission.date).toBe("2026-08-19");
    expect(policy.images).toBe("cache-permitted");
    expect(policy.descriptions).toBe("full-permitted");
  });
});

describe("parseList", () => {
  it("extracts product cards and ignores duplicates, filters, and off-site links", () => {
    expect(parseList(loadFixture(import.meta.url, "list.html"))).toEqual([
      {
        sourceAnimalId: "3031",
        sourceUrl: "https://www.macji-dol.si/mucki-iscejo-dom/misa/",
      },
      {
        sourceAnimalId: "2635",
        sourceUrl: "https://www.macji-dol.si/mucki-iscejo-dom/lejla/",
      },
    ]);
  });
});

describe("parseIntakeDate", () => {
  it.each([
    ["V zavetišče je prišla 7. 5. 2025.", "2025-05-07"],
    ["Sprejet je bil dne 29. 10. 2019.", "2019-10-29"],
    ["V zavetišču je od maja 2025.", undefined],
    ["Sprejeta sta bila pozimi 2022.", undefined],
    ["V letu 2019 je bil sprejet kot mladič.", undefined],
    ["Sprejet je bil 32. 13. 2025.", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseIntakeDate(input)).toBe(expected);
  });
});

describe("parseDetail", () => {
  it("preserves a multi-cat title without inferring a joint adoption", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-pair-separate.html")),
    ).toEqual({
      name: "Iris in Melisa",
      // WooCommerce marks the product in stock, which is the site saying the
      // cats are still to be had.
      status: "available",
      sex: "female",
      apartmentOk: undefined,
      intakeDate: undefined,
      description:
        "Iris in Melisa sta v zavetišču od maja 2025. Ni nujno, da odideta v skupen dom.",
      // "Mačke" maps; the hedged "verjetno tudi psi" does not.
      goodWith: { cats: "yes" },
      imageUrls: [
        "https://www.macji-dol.si/wp-content/uploads/example/iris-melisa.jpg",
      ],
    });
  });

  it("reads the stock flag WooCommerce writes on the product", () => {
    const html = loadFixture(import.meta.url, "detail-no-terms.html");

    expect(parseDetail(html).status).toBe("available");
    // The one state the live site was never seen in. A cat marked out of
    // stock is not to be had, which is "hold": nothing here claims it was
    // adopted, only that it is not on offer.
    expect(parseDetail(html.replace(/\binstock\b/, "outofstock")).status).toBe(
      "hold",
    );
    // A container with no flag leaves the reading to normalize().
    expect(parseDetail(html.replace(/\binstock\b/, "")).status).toBeUndefined();
  });

  it("also preserves a title whose text explicitly requires adoption together", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-pair-together.html")),
    ).toMatchObject({
      name: "Igor in Vladimir",
      sex: "male",
      intakeDate: undefined,
      description: "Sprejeta sta bila pozimi 2022. Oddajamo ju skupaj.",
      // "Brez mačk" and bare "psi" are both exact, unqualified terms.
      goodWith: { cats: "no", dogs: "yes" },
    });
  });

  it("omits goodWith entirely when the page has no Družabnost field", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-no-terms.html"))
        .goodWith,
    ).toBeUndefined();
  });

  it("never substring-matches a qualified or housing term", () => {
    const html = `
      <div class="summary"><article><div class="entry-content">
        <p><strong>DRUŽABNOST:</strong> Ljudje, z določenimi mačkami, poznani mačji prijatelji, bivanje samo v stanovanju</p>
      </div></article></div>`;
    expect(parseDetail(html).goodWith).toBeUndefined();
  });

  it("reads the housing term as an apartment cat", () => {
    const html = `
      <div class="summary"><article><div class="entry-content">
        <p><strong>DRUŽABNOST:</strong> Ljudje, bivanje samo v stanovanju</p>
      </div></article></div>`;
    expect(parseDetail(html).apartmentOk).toBe("yes");
  });

  it("leaves apartmentOk unset when the term is qualified or absent", () => {
    const qualified = `
      <div class="summary"><article><div class="entry-content">
        <p><strong>DRUŽABNOST:</strong> Mačke, po možnosti bivanje samo v stanovanju</p>
      </div></article></div>`;
    expect(parseDetail(qualified).apartmentOk).toBeUndefined();
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-pair-separate.html"))
        .apartmentOk,
    ).toBeUndefined();
  });
});

describe("normalize", () => {
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };
  const raw = {
    ref: {
      sourceAnimalId: "2635",
      sourceUrl: "https://www.macji-dol.si/mucki-iscejo-dom/lejla/",
    },
    fetchedAt: "2026-08-19T06:00:00Z",
    data: parseDetail(
      loadFixture(import.meta.url, "detail-pair-separate.html"),
    ),
  };

  it("produces one schema-valid listing with the permitted content", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.id).toBe("macji-dol:2635");
    expect(animal.name).toBe("Iris in Melisa");
    expect(animal.species).toBe("cat");
    expect(animal.status).toBe("available");
    expect(animal.intakeDate).toBeUndefined();
    expect(animal.images).toEqual([
      {
        sourceUrl:
          "https://www.macji-dol.si/wp-content/uploads/example/iris-melisa.jpg",
        rights: "cache-permitted",
      },
    ]);
    expect(animal.shortDescription).toContain(
      "Ni nujno, da odideta v skupen dom.",
    );
    expect(animal.goodWith).toEqual({ cats: "yes" });
  });

  it("carries the housing term through to the listing", async () => {
    const html = `
      <div class="summary"><article><div class="entry-content">
        <p><strong>DRUŽABNOST:</strong> Ljudje, bivanje samo v stanovanju</p>
      </div></article></div>`;
    const animal = Animal.parse(
      await provider.normalize(ctx, { ...raw, data: parseDetail(html) }),
    );
    expect(animal.apartmentOk).toBe("yes");
  });

  it("keeps the shelter block in sync with data/shelters.yaml", async () => {
    const registry = parse(
      readFileSync(
        new URL("../../data/shelters.yaml", import.meta.url),
        "utf8",
      ),
    ) as { shelters: Array<{ id: string; name: string; city: string }> };
    const entry = registry.shelters.find((s) => s.id === provider.id);
    expect(entry).toBeDefined();

    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.shelter).toEqual({
      id: entry!.id,
      name: entry!.name,
      city: entry!.city,
    });
  });
});
