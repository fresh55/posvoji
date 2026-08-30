"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FlaskConical, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PORTAL_PATH } from "@/hooks/use-portal-session";
import { slugify } from "@/lib/animal-path";
import { portalUrl } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

/**
 * A shelter picker that opens the portal as any shelter without waiting for a
 * mail, so the workspace can be looked at from every shelter's side while it
 * is being built.
 *
 * Two things keep it out of production, either of which is enough. The module
 * is only ever imported from inside a branch on `process.env.NODE_ENV`, which
 * the bundler folds, so a production build never emits it. And the API it
 * calls answers 404 unless the portal runs with PORTAL_DEV_LOGIN, which
 * Django's DEBUG gates.
 *
 * Nothing here is imported by the rest of the portal: the fetches are written
 * out rather than added to lib/portal-api.ts, which every page loads. The
 * strings stay here too, out of portal-text.ts, for the same reason.
 */

/** One shelter and the login the picker would open it as. */
type DevShelter = {
  slug: string;
  name: string;
  city: string;
  email: string;
  /** False when the registry lists no address and the portal stands one in. */
  registered: boolean;
};

async function fetchDevShelters(): Promise<DevShelter[]> {
  const response = await fetch(portalUrl("/api/auth/dev/shelters"), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as DevShelter[];
}

async function devLogin(slug: string): Promise<void> {
  const response = await fetch(portalUrl("/api/auth/dev/login"), {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!response.ok) throw new Error(String(response.status));
}

export function PortalDevLogin() {
  const [shelters, setShelters] = useState<DevShelter[] | null>(null);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    // A 404 is the portal saying the shortcut is off. Nothing is rendered and
    // nothing is reported: that is the normal answer, not a failure.
    fetchDevShelters().then(
      (rows) => {
        if (live) setShelters(rows);
      },
      () => {
        if (live) setShelters([]);
      },
    );

    return () => {
      live = false;
    };
  }, []);

  const matches = useMemo(() => {
    if (!shelters) return [];
    // slugify, so "macji" and "sencur" find what the shelter is actually
    // called. Same folding the public search and the register use.
    const needle = slugify(query);
    if (!needle) return shelters;
    return shelters.filter((shelter) =>
      slugify(`${shelter.name} ${shelter.city} ${shelter.slug}`).includes(
        needle,
      ),
    );
  }, [shelters, query]);

  if (!shelters || shelters.length === 0) return null;

  async function open(slug: string) {
    setOpening(slug);
    setError(null);
    try {
      await devLogin(slug);
      window.location.replace(PORTAL_PATH);
    } catch {
      setOpening(null);
      setError(`Prijava kot ${slug} ni uspela. Teče portal na vratih 8000?`);
    }
  }

  return (
    <section className="space-y-3 rounded-ui border border-dashed bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <FlaskConical
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <h2 className="text-sm font-medium tracking-tight">Razvojna prijava</h2>
        <span className="ml-auto rounded-ui border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          samo dev
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Odpre portal kot izbrano zavetišče, brez pošte. V produkcijski gradnji
        tega ni.
      </p>

      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Poišči zavetišče"
        aria-label="Poišči zavetišče"
        className="h-8"
      />

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {matches.map((shelter) => (
          <li key={shelter.slug}>
            <button
              type="button"
              disabled={opening !== null}
              onClick={() => open(shelter.slug)}
              className={cn(
                "flex w-full items-center gap-2 rounded-ui border border-transparent px-2 py-1.5 text-left",
                "hover:border-border hover:bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{shelter.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shelter.email}
                  {!shelter.registered && " (brez naslova v registru)"}
                </span>
              </span>
              {opening === shelter.slug ? (
                <LoaderCircle
                  className="size-4 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-muted-foreground">
            Ni zadetkov.
          </li>
        )}
      </ul>
    </section>
  );
}
