"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Inbox,
  LoaderCircle,
  LogOut,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { PortalAnimalCard } from "@/components/portal/animal-card";
import {
  PortalListTools,
  filterPortalAnimals,
} from "@/components/portal/list-tools";
import { PortalShell } from "@/components/portal/portal-shell";
import { portalText } from "@/components/portal/portal-text";
import { ShelterSwitcher } from "@/components/portal/shelter-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalAnimals } from "@/hooks/use-portal-animals";
import {
  PORTAL_LOGIN_PATH,
  usePortalSession,
} from "@/hooks/use-portal-session";
import { animalCount } from "@/lib/labels";
import type { PortalStatus } from "@/lib/portal-api";

function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-ui border p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-16 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof Inbox;
  title: string;
  children: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-ui border bg-muted/30 px-4 py-6 text-sm sm:items-center sm:text-center">
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-ui border bg-background text-muted-foreground sm:mx-auto"
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-prose leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
      {action}
    </div>
  );
}

export function PortalWorkspace() {
  const shouldReduceMotion = useReducedMotion();
  const { state, reload: reloadSession, signOut } = usePortalSession();
  const [chosen, setChosen] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PortalStatus | null>(null);

  const shelters = state.status === "ready" ? state.session.shelters : [];
  const active = chosen ?? shelters[0]?.slug ?? null;
  // The card needs the whole shelter, not its slug: the public link it draws
  // is built from the name and the town as well.
  const activeShelter = shelters.find((shelter) => shelter.slug === active);

  const clearFilters = useCallback(() => {
    setQuery("");
    setStatus(null);
  }, []);

  // The guard: no session, no workspace. replace() so the back button does
  // not walk into a page that will only bounce again.
  useEffect(() => {
    if (state.status === "anonymous") window.location.replace(PORTAL_LOGIN_PATH);
  }, [state.status]);

  const onUnauthorized = useCallback(() => {
    window.location.replace(PORTAL_LOGIN_PATH);
  }, []);

  const {
    animals,
    state: listState,
    saveStates,
    reload: reloadAnimals,
    save,
  } = usePortalAnimals(active, onUnauthorized);

  const visible = useMemo(
    () => filterPortalAnimals(animals, query, status),
    [animals, query, status],
  );

  const actions =
    state.status === "ready" ? (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:inline">
          {state.session.email}
        </span>
        {active && (
          <Button asChild variant="outline" size="sm">
            {/* A new tab, so a shelter checking the public page does not
                lose the workspace it was halfway through. */}
            <a
              href={`/zavetisca/${active}`}
              target="_blank"
              rel="noreferrer"
              title={portalText.publicPage}
            >
              <ExternalLink aria-hidden />
              {/* The label collapses on a phone but stays readable to a
                  screen reader, so the icon is never the only name. */}
              <span className="sr-only sm:not-sr-only">
                {portalText.publicPage}
              </span>
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void signOut();
          }}
        >
          <LogOut aria-hidden />
          {portalText.logout}
        </Button>
      </div>
    ) : null;

  return (
    <PortalShell actions={actions}>
      {(state.status === "loading" || state.status === "anonymous") && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {state.status === "anonymous"
            ? portalText.redirecting
            : portalText.loading}
        </p>
      )}

      {state.status === "error" && (
        <Notice
          icon={TriangleAlert}
          title={portalText.unknownError}
          action={
            <Button variant="outline" size="sm" onClick={reloadSession}>
              {portalText.retry}
            </Button>
          }
        >
          {state.offline ? portalText.networkError : portalText.unknownError}
        </Notice>
      )}

      {state.status === "ready" && shelters.length === 0 && (
        <Notice icon={Inbox} title={portalText.noSheltersTitle}>
          {portalText.noSheltersLead}
        </Notice>
      )}

      {state.status === "ready" && shelters.length > 0 && (
        <>
          {shelters.length > 1 && (
            <ShelterSwitcher
              shelters={shelters}
              active={active}
              onSelect={(slug) => {
                // A filter set over one shelter's list means nothing over the
                // next one's, so switching starts from the whole list again.
                setChosen(slug);
                clearFilters();
              }}
            />
          )}

          <section className="space-y-4">
            <div className="space-y-1 border-b pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
                  {portalText.animalsTitle}
                </h1>
                {listState.status === "ready" && animals.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {animalCount(animals.length, "sl")}
                  </p>
                )}
              </div>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {portalText.animalsLead}
              </p>
              {/* Said once here rather than in a per-card tooltip, which a
                  touch user never opens. */}
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {portalText.statusInheritedLead}
              </p>
            </div>

            {listState.status === "loading" && (
              <div className="space-y-3" aria-hidden>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            )}

            {listState.status === "error" && (
              <Notice
                icon={TriangleAlert}
                title={portalText.listError}
                action={
                  <Button variant="outline" size="sm" onClick={reloadAnimals}>
                    {portalText.retry}
                  </Button>
                }
              >
                {listState.message}
              </Notice>
            )}

            {listState.status === "ready" && animals.length === 0 && (
              <Notice icon={Inbox} title={portalText.emptyTitle}>
                {portalText.emptyLead}
              </Notice>
            )}

            {listState.status === "ready" && animals.length > 0 && (
              <PortalListTools
                animals={animals}
                query={query}
                onQueryChange={setQuery}
                status={status}
                onStatusChange={setStatus}
              />
            )}

            {listState.status === "ready" &&
              animals.length > 0 &&
              visible.length === 0 && (
                <Notice
                  icon={SearchX}
                  title={portalText.noMatchesTitle}
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      {portalText.showAll}
                    </Button>
                  }
                >
                  {portalText.noMatchesLead}
                </Notice>
              )}

            {listState.status === "ready" &&
              visible.length > 0 &&
              activeShelter && (
                <div className="space-y-3">
                  {visible.map((animal, index) => (
                    <m.div
                      key={animal.id}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.22,
                        ease: "easeOut",
                        // Explicit per-card delay rather than a variant
                        // stagger, and capped so a long list does not keep the
                        // last cards waiting.
                        delay: Math.min(index, 8) * 0.03,
                      }}
                    >
                      <PortalAnimalCard
                        animal={animal}
                        shelter={activeShelter}
                        saveState={saveStates[animal.id] ?? { status: "idle" }}
                        onSave={(patch) => save(animal.id, patch)}
                      />
                    </m.div>
                  ))}
                </div>
              )}
          </section>
        </>
      )}
    </PortalShell>
  );
}
