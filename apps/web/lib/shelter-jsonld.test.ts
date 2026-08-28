import { describe, expect, it } from "vitest";
import {
  type JsonLdNode,
  serializeJsonLd,
  shelterJsonLd,
  shelterListJsonLd,
} from "@/lib/shelter-jsonld";
import { loadShelters, type ShelterRegistryEntry } from "@/lib/shelters";

// The builders return a readonly index type, which is what a caller wants and
// what a test cannot index into. These two read a node back as plain records,
// which is the only casting here, and never widens what the builders emit.
type Node = Record<string, unknown>;

function read(node: JsonLdNode): Node {
  return node as Node;
}

function itemsOf(node: JsonLdNode): Node[] {
  return read(node).itemListElement as Node[];
}

const shelter: ShelterRegistryEntry = {
  id: "muri",
  name: "Zavod Muri",
  city: "Vransko",
  website: "https://zavodmuri.si/",
  email: "zavod.muri@gmail.com",
  phone: "01 234 56 78",
  notes: "Interna opomba, ki ne sme nikoli iz repozitorija.",
};

describe("shelterListJsonLd", () => {
  it("numbers every shelter in the registry from one, in the order given", () => {
    const shelters = loadShelters();
    const list = shelterListJsonLd(shelters, "sl");

    expect(read(list)["@type"]).toBe("ItemList");
    expect(read(list).numberOfItems).toBe(shelters.length);
    expect(itemsOf(list)).toHaveLength(17);
    expect(itemsOf(list).map((item) => item.position)).toEqual(
      shelters.map((_, index) => index + 1),
    );
    expect(itemsOf(list).map((item) => item.url)).toEqual(
      shelters.map((entry) => `https://posvoji.si/zavetisca/${entry.id}`),
    );
  });

  it("keeps the caller's order rather than sorting", () => {
    const list = shelterListJsonLd([{ id: "zonzani" }, { id: "muri" }], "sl");
    expect(itemsOf(list)).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        url: "https://posvoji.si/zavetisca/zonzani",
      },
      {
        "@type": "ListItem",
        position: 2,
        url: "https://posvoji.si/zavetisca/muri",
      },
    ]);
  });

  it("points at the addresses of the language it was asked for", () => {
    const en = shelterListJsonLd([{ id: "muri" }], "en");
    expect(itemsOf(en)[0].url).toBe("https://posvoji.si/en/shelters/muri");
    expect(read(en).mainEntityOfPage).toEqual({
      "@type": "CollectionPage",
      "@id": "https://posvoji.si/en/shelters",
      url: "https://posvoji.si/en/shelters",
      inLanguage: "en",
    });

    const sl = shelterListJsonLd([{ id: "muri" }], "sl");
    expect(read(sl).mainEntityOfPage).toEqual({
      "@type": "CollectionPage",
      "@id": "https://posvoji.si/zavetisca",
      url: "https://posvoji.si/zavetisca",
      inLanguage: "sl",
    });
  });

  it("carries no item beyond its position and its address", () => {
    const list = shelterListJsonLd(loadShelters(), "sl");
    for (const item of itemsOf(list)) {
      expect(Object.keys(item).sort()).toEqual(["@type", "position", "url"]);
    }
  });
});

describe("shelterJsonLd", () => {
  it("describes the shelter at its own address on this site", () => {
    const node = read(shelterJsonLd(shelter, "sl"));
    expect(node["@type"]).toBe("AnimalShelter");
    expect(node.name).toBe("Zavod Muri");
    expect(node.url).toBe("https://posvoji.si/zavetisca/muri");
    expect(node["@id"]).toBe("https://posvoji.si/zavetisca/muri#shelter");
    expect(node.sameAs).toEqual(["https://zavodmuri.si/"]);
    expect(node.telephone).toBe("01 234 56 78");
    expect(node.email).toBe("zavod.muri@gmail.com");
    expect(node.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Vransko",
      addressCountry: "SI",
    });
  });

  it("uses the English address and language on the English page", () => {
    const node = read(shelterJsonLd(shelter, "en"));
    expect(node.url).toBe("https://posvoji.si/en/shelters/muri");
    expect(node.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://posvoji.si/en/shelters/muri",
      url: "https://posvoji.si/en/shelters/muri",
      inLanguage: "en",
    });
  });

  it("leaves out what the registry does not have, rather than emitting it empty", () => {
    const node = read(
      shelterJsonLd(
        { id: "johanca", name: "Zavetišče Johanca", city: "Tolmin" },
        "sl",
      ),
    );
    expect(node).not.toHaveProperty("sameAs");
    expect(node).not.toHaveProperty("telephone");
    expect(node).not.toHaveProperty("email");
    expect(node.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Tolmin",
      addressCountry: "SI",
    });
  });

  it("never carries the registry's internal notes", () => {
    const serialized = serializeJsonLd(shelterJsonLd(shelter, "sl"));
    expect(serialized).not.toContain("Interna opomba");
    expect(serialized).not.toContain("notes");
  });

  it("keeps every real shelter's node free of empty fields", () => {
    for (const entry of loadShelters()) {
      const node = read(shelterJsonLd(entry, "sl"));
      for (const value of Object.values(node)) {
        expect(value).not.toBe("");
        expect(value).not.toBeNull();
      }
    }
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script tag it is written into", () => {
    const serialized = serializeJsonLd(
      shelterJsonLd(
        {
          ...shelter,
          name: 'Zavod </script><script>alert("xss")</script>',
        },
        "sl",
      ),
    );
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });

  it("stays valid JSON that reads back as what was built", () => {
    const node = shelterJsonLd({ ...shelter, name: "A </script> & B" }, "sl");
    expect(JSON.parse(serializeJsonLd(node))).toEqual(node);
  });
});
