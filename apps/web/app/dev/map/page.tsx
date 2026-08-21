"use client";

import { notFound } from "next/navigation";
import { ShelterMap } from "@/components/filters/shelter-map";
import { I18nProvider } from "@/components/i18n-provider";
import { cityAt, type LatLon } from "@/lib/geo";
import type { ShelterPin } from "@/lib/map-layout";

// Every visual state the map can be in, side by side, so a marker or region
// style change can be eyeballed in one glance instead of hunting real data
// for each case. Dev-only: production builds 404 here, see the guard below.

function pin(
  value: string,
  label: string,
  city: string,
  count: number,
): ShelterPin {
  const at = cityAt(city);
  if (!at) throw new Error(`dev/map: missing coordinates for "${city}"`);
  return { value, label, city, count, at };
}

type Demo = {
  title: string;
  pins: ShelterPin[];
  selected?: string[];
  origin?: LatLon;
  highlightedValue?: string;
};

// Five cities in five different statistical regions, with five distinct
// animal totals, so the rank-based density scale lands on all five steps.
const DEMOS: Demo[] = [
  {
    title: "Density steps 0-4 across five regions",
    pins: [
      pin("density-ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("density-celje", "Zavetišče Celje", "Celje", 20),
      pin("density-novo-mesto", "Zavetišče Novo mesto", "Novo mesto", 45),
      pin("density-maribor", "Zavetišče Maribor", "Maribor", 70),
      pin("density-koper", "Zavetišče Koper", "Koper", 100),
    ],
  },
  {
    title: "Selected region (one shelter, fully picked)",
    pins: [pin("region-selected", "Zavetišče Kranj", "Kranj", 12)],
    selected: ["region-selected"],
  },
  {
    title: "Mixed region (one of two shelters picked)",
    // Kranj and Bled both fall in Gorenjska, so picking only one of the two
    // leaves the region itself in the "mixed" state.
    pins: [
      pin("region-mixed-kranj", "Zavetišče Kranj", "Kranj", 12),
      pin("region-mixed-bled", "Zavetišče Bled", "Bled", 8),
    ],
    selected: ["region-mixed-kranj"],
  },
  {
    title: "Idle marker",
    pins: [pin("marker-idle", "Zavetišče Idrija", "Idrija", 6)],
  },
  {
    title: "Selected marker",
    pins: [pin("marker-selected", "Zavetišče Postojna", "Postojna", 9)],
    selected: ["marker-selected"],
  },
  {
    title: "Empty (not live) marker",
    pins: [pin("marker-empty", "Zavetišče brez živali", "Sežana", 0)],
  },
  {
    // The real Celje: the largest shelter in the country beside an 11-animal
    // one. The discs are sized by their own counts, capped at 2:1 in radius.
    title: "Two-shelter cluster, lopsided, one selected",
    pins: [
      pin("cluster2-a", "Zavetišče Mačja hiša", "Celje", 185),
      pin("cluster2-b", "Zavetišče Sia in Lu", "Celje", 11),
    ],
    selected: ["cluster2-b"],
  },
  {
    // Equal counts, which is what the uniform layout drew at every split
    // before, and still draws.
    title: "Two-shelter cluster, even split",
    pins: [
      pin("cluster2e-a", "Zavetišče Vzhod", "Ptuj", 20),
      pin("cluster2e-b", "Zavetišče Zahod", "Ptuj", 20),
    ],
  },
  {
    title: "Three-shelter cluster",
    pins: [
      pin("cluster3-a", "Zavetišče A", "Trbovlje", 10),
      pin("cluster3-b", "Zavetišče B", "Trbovlje", 10),
      pin("cluster3-c", "Zavetišče C", "Trbovlje", 10),
    ],
  },
  {
    // The worst split three discs can be handed: the cap holds the small two
    // at half the big one's radius, and the packing shrinks the set a little
    // so no disc eats its neighbour.
    title: "Three-shelter cluster, lopsided",
    pins: [
      pin("cluster3x-a", "Zavetišče Veliko", "Murska Sobota", 180),
      pin("cluster3x-b", "Zavetišče Srednje", "Murska Sobota", 20),
      pin("cluster3x-c", "Zavetišče Majhno", "Murska Sobota", 6),
    ],
  },
  {
    title: "Four-plus shelters (counted disc)",
    pins: [
      pin("cluster4-a", "Zavetišče D1", "Krško", 10),
      pin("cluster4-b", "Zavetišče D2", "Krško", 10),
      pin("cluster4-c", "Zavetišče D3", "Krško", 10),
      pin("cluster4-d", "Zavetišče D4", "Krško", 10),
    ],
  },
  {
    title: "Origin dot",
    pins: [pin("origin-marker", "Zavetišče Velenje", "Velenje", 15)],
    origin: cityAt("Žalec"),
  },
  {
    title: "Highlighted from a list row hover",
    pins: [
      pin("highlighted-skofja-loka", "Zavetišče Škofja Loka", "Škofja Loka", 18),
      pin("highlighted-radovljica", "Zavetišče Radovljica", "Radovljica", 4),
    ],
    highlightedValue: "highlighted-skofja-loka",
  },
];

function DemoGrid() {
  return (
    <div className="grid grid-cols-1 gap-8 p-8 sm:grid-cols-2 lg:grid-cols-3">
      {DEMOS.map((demo) => (
        <div
          key={demo.title}
          className="space-y-2 rounded-ui border border-border p-4"
        >
          <p className="text-sm font-medium">{demo.title}</p>
          <ShelterMap
            pins={demo.pins}
            selected={demo.selected ?? []}
            onPick={() => undefined}
            origin={demo.origin}
            highlightedValue={demo.highlightedValue}
          />
        </div>
      ))}
    </div>
  );
}

export default function DevMapStatesPage() {
  // Dev-only. The static export still writes a file for this route, so make
  // sure it is the 404 page rather than the real content.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <I18nProvider locale="sl">
      <div className="space-y-12 pb-16">
        <div>
          <h1 className="p-8 pb-0 text-lg font-semibold">
            Map states, light
          </h1>
          <DemoGrid />
        </div>

        <div className="dark bg-background text-foreground">
          <h1 className="p-8 pb-0 text-lg font-semibold">
            Map states, dark
          </h1>
          <DemoGrid />
        </div>
      </div>
    </I18nProvider>
  );
}
