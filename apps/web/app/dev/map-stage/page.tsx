"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import {
  Cat,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Dog,
  Moon,
  PawPrint,
  Search,
  Sun,
} from "lucide-react";
import { ShelterMap } from "@/components/filters/shelter-map";
import { I18nProvider } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cityAt } from "@/lib/geo";
import type { ShelterPin } from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// A static-but-navigable mock of the map-stage redesign: the shelter picker
// as a full-bleed map with a collapsible panel, rather than a map squeezed
// into a dialog's left column. Layout only, no real filter state. Dev-only,
// see the production guard below. Pins and helper copied from dev/map.

function pin(value: string, label: string, city: string, count: number): ShelterPin {
  const at = cityAt(city);
  if (!at) throw new Error(`dev/map-stage: missing coordinates for "${city}"`);
  return { value, label, city, count, at };
}

const PINS: ShelterPin[] = [
  pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 42),
  pin("celje", "Zavetišče Mačja hiša", "Celje", 18),
  pin("maribor", "Zavetišče Maribor", "Maribor", 27),
  pin("koper", "Zavetišče Koper", "Koper", 9),
  pin("novo-mesto", "Zavetišče Novo mesto", "Novo mesto", 15),
  pin("kranj", "Zavetišče Kranj", "Kranj", 12),
  pin("murska-sobota", "Zavetišče Murska Sobota", "Murska Sobota", 6),
  pin("nova-gorica", "Zavetišče Nova Gorica", "Nova Gorica", 8),
];

const SELECTED = ["ljubljana"];

// Fake rows for the panel's shelter list, in the shape shelter-rows.tsx
// draws (see that file's row markup): a check slot, name + count badge,
// city/distance sub-line. Static markup, not the real component, so this
// mock carries no state requirements.
const FAKE_ROWS = [
  { value: "ljubljana", label: "Zavetišče Ljubljana", city: "Ljubljana", km: 0, count: 42, checked: true },
  { value: "celje", label: "Zavetišče Mačja hiša", city: "Celje", km: 78, count: 18, checked: false },
  { value: "maribor", label: "Zavetišče Maribor", city: "Maribor", km: 128, count: 27, checked: false },
  { value: "kranj", label: "Zavetišče Kranj", city: "Kranj", km: 32, count: 12, checked: false },
  { value: "koper", label: "Zavetišče Koper", city: "Koper", km: 102, count: 9, checked: false },
];

// Half the open panel's own width (see PANEL_WIDTH_REM), which is the
// recenter trick: the map's content shifts west by that much so Slovenia
// keeps its footing in whatever area is left once the panel eats the east
// side of the stage. See the comment on MapStage for the full account.
const PANEL_WIDTH_REM = 24;
const RECENTER_SHIFT_REM = PANEL_WIDTH_REM / 2;

// The plate furniture this page used to preview as an overlay of its own —
// the neighbours, the sea, the town anchors — now lives in shelter-map.tsx as
// a real always-on layer, tuned against the live plate rather than by eye. The
// overlay is gone from here so the mock does not draw a second set of labels
// over the real ones; everything else on this page is unchanged.

// The map plate. The wrapper is a plain CSS transform (translateX), animated
// with transition-transform, which was this mock's recenter trick. The shipped
// dialog does it differently: it transitions the width of the map's container
// so the picture is never drawn under the panel at all (see the recenter
// container in components/filters/location-picker.tsx).
function MapStage({ panelOpen }: { panelOpen: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-ui border bg-muted/40">
      <div
        className="absolute inset-0 flex items-center justify-center p-6 transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{
          transform: panelOpen
            ? `translateX(-${RECENTER_SHIFT_REM}rem)`
            : "translateX(0)",
        }}
      >
        <div className="relative w-full max-w-[80rem]">
          <ShelterMap
            pins={PINS}
            selected={SELECTED}
            onPick={(values) => console.log("dev/map-stage pick", values)}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

function SpeciesCount({
  icon: Icon,
  count,
}: {
  icon: typeof Cat;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {count}
    </span>
  );
}

// The mocked shelter card at the top of the panel: Phase 1 (find a shelter)
// and Phase 2 (see who is waiting there) in one glance, which is the thing
// this whole redesign is meant to let a reviewer judge. Static markup in the
// site's card language (rounded-ui, border, bg-card, shadow-xs), imitating
// components/shelter-card.tsx rather than importing it, since that component
// wants real registry data this mock has no business faking that deeply.
function MockShelterCard() {
  return (
    <div className="flex flex-col gap-3 rounded-ui border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">Zavetišče Ljubljana</h2>
          <p className="text-xs text-muted-foreground">Ljubljana</p>
        </div>
        <div className="flex items-center gap-2">
          <SpeciesCount icon={Dog} count={24} />
          <SpeciesCount icon={Cat} count={16} />
          <SpeciesCount icon={PawPrint} count={2} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Najdlje čaka: <span className="text-foreground">Mila, 10 let</span>
      </p>
      <Button
        size="sm"
        className="w-full"
        onClick={() => console.log("dev/map-stage: Prikaži živali")}
      >
        Prikaži živali
      </Button>
    </div>
  );
}

// The two tab pills the real dialog opens on (see location-picker.tsx),
// mocked as inert markup: this page is about layout, not about wiring a
// second mode into a stage that has no municipality data to hand it.
function MockTabs() {
  const [tab, setTab] = useState<"zavetisca" | "obcina">("zavetisca");
  return (
    <div className="flex gap-1">
      {(
        [
          { key: "zavetisca", label: "Zavetišča" },
          { key: "obcina", label: "Najdena žival" },
        ] as const
      ).map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={tab === key}
          onClick={() => setTab(key)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-ui px-2.5 py-1 text-sm transition-colors",
            tab === key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// A cheap imitation of shelter-rows.tsx's row markup (check slot, name, count
// badge, sub-line), not the component itself: the real one wants refs, hover
// wiring and a live counts map that a static mock has no reason to carry.
function MockShelterRows() {
  return (
    <div className="space-y-0.5">
      {FAKE_ROWS.map((row) => (
        <button
          key={row.value}
          type="button"
          onClick={() => console.log("dev/map-stage row", row.value)}
          className={cn(
            "flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left transition-colors",
            row.checked
              ? "bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
              : "hover:bg-muted/50",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 rounded-[3px] border",
              row.checked ? "border-current bg-current/20" : "border-transparent",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  !row.checked && "text-muted-foreground",
                )}
              >
                {row.label}
              </span>
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-normal tabular-nums text-muted-foreground">
                {row.count}
              </span>
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/80">
              {row.city} · {row.km === 0 ? "manj kot 1 km" : `${row.km} km`}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

// The floating panel docked right: the site's card language (rounded-ui,
// border, bg-background/95 + backdrop-blur, shadow) holding a mocked version
// of the dialog's current right column. Collapsing it to a slim rail is the
// button that drives MapStage's recenter transform above.
function DockedPanel({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
    return (
      <div className="absolute top-1/2 right-4 -translate-y-1/2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Odpri seznam zavetišč"
          onClick={onToggle}
          className="rounded-ui border bg-background/95 shadow-md backdrop-blur"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{ width: `${PANEL_WIDTH_REM}rem` }}
      className="absolute top-4 right-4 bottom-4 flex flex-col gap-3 overflow-hidden rounded-ui border bg-background/95 p-4 shadow-md backdrop-blur"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <MockTabs />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Skrči seznam"
          onClick={onToggle}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <MockShelterCard />

      <div className="relative shrink-0">
        <Search
          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Išči zavetišče"
          disabled
          className="h-8 w-full rounded-ui border bg-background pl-8 text-sm text-muted-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <MockShelterRows />
      </div>
    </div>
  );
}

// The phone rendering: a bottom sheet instead of a docked panel. Collapsed to
// a peek bar naming the count, tappable to expand over the lower half. Kept
// to one boolean, no drag gesture, since the point being judged is the
// layout, not a sheet's physics.
function MobileSheet() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-ui border bg-background/95 shadow-md backdrop-blur transition-[height] duration-300 motion-reduce:transition-none",
        expanded ? "h-1/2" : "h-14",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex shrink-0 items-center justify-between gap-2 px-4 py-3"
      >
        <span className="text-sm font-medium">8 zavetišč</span>
        <ChevronUp
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <MockShelterCard />
          <MockShelterRows />
        </div>
      )}
    </div>
  );
}

function StageContent() {
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background p-3">
      {/* Full-bleed stage: the page itself is treated as the dialog, so the
          map plate fills the whole viewport edge to edge rather than sitting
          in a fixed-height card inside one. */}
      <div className="relative h-full w-full">
        <MapStage panelOpen={panelOpen} />

        {/* Floating title, top-left on the paper, echoing the dialog's own
            DialogTitle (see location-picker.tsx: messages.whereSearching). */}
        <div className="pointer-events-none absolute top-4 left-4">
          <h1 className="rounded-ui bg-background/80 px-3 py-1.5 text-lg font-semibold shadow-xs backdrop-blur">
            Kje iščeš?
          </h1>
        </div>

        {/* md+: docked panel and its recenter trick. Below md: bottom sheet
            instead, and the docked panel never mounts there. */}
        <div className="hidden md:contents">
          <DockedPanel open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
        </div>
        <div className="md:hidden">
          <MobileSheet />
        </div>
      </div>
    </div>
  );
}

// The dev gallery's trick for both themes: the same content twice, the
// second time under .dark. A full-viewport stage has no room to stack two
// copies, so this is a toggle instead, flipping the class on the stage
// container itself.
export default function DevMapStagePage() {
  const [dark, setDark] = useState(false);

  // Dev-only. The static export still writes a file for this route, so make
  // sure it is the 404 page rather than the real content.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <I18nProvider locale="sl">
      <div
        className={cn(
          "h-dvh w-dvw",
          dark && "dark",
        )}
      >
        <div className="relative h-full w-full bg-background text-foreground">
          <div className="absolute top-4 right-4 z-10">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={dark ? "Preklopi na svetlo temo" : "Preklopi na temno temo"}
              onClick={() => setDark((v) => !v)}
              className="bg-background/95 shadow-md backdrop-blur"
            >
              {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </Button>
          </div>
          <StageContent />
        </div>
      </div>
    </I18nProvider>
  );
}
