"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Inbox,
  LoaderCircle,
  LogOut,
  Plus,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { PortalAnimalCard } from "@/components/portal/animal-card";
import {
  PortalListTools,
  filterPortalAnimals,
  type PortalListEntry,
} from "@/components/portal/list-tools";
import { PortalListingCard } from "@/components/portal/listing-card";
import { ListingForm } from "@/components/portal/listing-form";
import { PortalShell } from "@/components/portal/portal-shell";
import { portalText } from "@/components/portal/portal-text";
import { ShelterSwitcher } from "@/components/portal/shelter-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalAnimals } from "@/hooks/use-portal-animals";
import {
  NEW_LISTING,
  usePortalListings,
} from "@/hooks/use-portal-listings";
import {
  PORTAL_LOGIN_PATH,
  usePortalSession,
} from "@/hooks/use-portal-session";
import { animalCount } from "@/lib/labels";
import { isManualShelter, type PortalStatus } from "@/lib/portal-api";

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
  // The "Dodaj žival" dialog, and the listing it made once it has: the form
  // keeps editing that one while its photos go up, so it is read back off
  // the live list rather than off the answer to the POST.
  const [adding, setAdding] = useState(false);
  const [newListingId, setNewListingId] = useState<string | null>(null);

  const shelters = state.status === "ready" ? state.session.shelters : [];
  const active = chosen ?? shelters[0]?.slug ?? null;
  // The card needs the whole shelter, not its slug: the public link it draws
  // is built from the name and the town as well.
  const activeShelter = shelters.find((shelter) => shelter.slug === active);
  // A shelter with no catalogue of its own writes its animals here, so it
  // gets the listing form instead of the override editor. No mode means a
  // crawled shelter, which is what every shelter was before the field.
  const manual = activeShelter ? isManualShelter(activeShelter) : false;

  const clearFilters = useCallback(() => {
    setQuery("");
    setStatus(null);
  }, []);

  // The guard: no session, no workspace. replace() so the back button does
  // not walk into a page that will only bounce again.
  useEffect(() => {
    if (state.status === "anonymous")
      window.location.replace(PORTAL_LOGIN_PATH);
  }, [state.status]);

  const onUnauthorized = useCallback(() => {
    window.location.replace(PORTAL_LOGIN_PATH);
  }, []);

  // Both hooks always run, as hooks must; the one the shelter does not use
  // gets no slug and stays idle without a request.
  const {
    animals,
    state: animalState,
    saveStates,
    reload: reloadAnimals,
    save,
  } = usePortalAnimals(manual ? null : active, onUnauthorized);
  const {
    listings,
    state: listingState,
    saveStates: listingSaveStates,
    reload: reloadListings,
    actions: listingActions,
  } = usePortalListings(manual ? active : null, onUnauthorized);

  const listState = manual ? listingState : animalState;
  const reloadList = manual ? reloadListings : reloadAnimals;
  // The tools read the four fields a crawled animal and a manual listing both
  // carry under the same names, so each list goes through them as it is.
  const all: PortalListEntry[] = manual ? listings : animals;
  const visibleAnimals = useMemo(
    () => filterPortalAnimals(animals, query, status),
    [animals, query, status],
  );
  const visibleListings = useMemo(
    () => filterPortalAnimals(listings, query, status),
    [listings, query, status],
  );
  const visibleCount = manual ? visibleListings.length : visibleAnimals.length;
  const newListing =
    listings.find((listing) => listing.id === newListingId) ?? null;

  const openAdd = useCallback(() => {
    setNewListingId(null);
    setAdding(true);
  }, []);

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
                setAdding(false);
                setNewListingId(null);
              }}
            />
          )}

          <section className="space-y-4">
            <div className="space-y-2 border-b pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
                  {portalText.animalsTitle}
                </h1>
                {listState.status === "ready" &&
                  all.length > 0 &&
                  (manual ? (
                    // The count and the one action a manual shelter has up
                    // here. While the list is empty the notice below carries
                    // the same button, so it is never on screen twice.
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        {animalCount(all.length, "sl")}
                      </p>
                      <Button size="sm" onClick={openAdd}>
                        <Plus aria-hidden />
                        {portalText.listingAdd}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {animalCount(all.length, "sl")}
                    </p>
                  ))}
              </div>
              {/* The only line up here. What the marks on the cards mean is
                  said on the card that draws them, at the moment the shelter
                  meets one; a key up here explains three things nobody has
                  seen yet and says nothing about where they live. */}
              <p className="text-sm text-muted-foreground">
                {portalText.animalsLead}
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
                  <Button variant="outline" size="sm" onClick={reloadList}>
                    {portalText.retry}
                  </Button>
                }
              >
                {listState.message}
              </Notice>
            )}

            {listState.status === "ready" &&
              all.length === 0 &&
              (manual ? (
                <Notice
                  icon={Inbox}
                  title={portalText.emptyTitle}
                  action={
                    <Button size="sm" onClick={openAdd}>
                      <Plus aria-hidden />
                      {portalText.listingAdd}
                    </Button>
                  }
                >
                  {portalText.listingsEmptyLead}
                </Notice>
              ) : (
                <Notice icon={Inbox} title={portalText.emptyTitle}>
                  {portalText.emptyLead}
                </Notice>
              ))}

            {listState.status === "ready" && all.length > 0 && (
              <PortalListTools
                animals={all}
                query={query}
                onQueryChange={setQuery}
                status={status}
                onStatusChange={setStatus}
              />
            )}

            {listState.status === "ready" &&
              all.length > 0 &&
              visibleCount === 0 && (
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
              manual &&
              visibleListings.length > 0 && (
                <div className="space-y-3">
                  {visibleListings.map((listing, index) => (
                    <m.div
                      key={listing.id}
                      initial={
                        shouldReduceMotion ? false : { opacity: 0, y: 8 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.22,
                        ease: "easeOut",
                        delay: Math.min(index, 8) * 0.03,
                      }}
                    >
                      <PortalListingCard
                        listing={listing}
                        saveState={
                          listingSaveStates[listing.id] ?? { status: "idle" }
                        }
                        actions={listingActions}
                      />
                    </m.div>
                  ))}
                </div>
              )}

            {listState.status === "ready" &&
              !manual &&
              visibleAnimals.length > 0 &&
              activeShelter && (
                <div className="space-y-3">
                  {visibleAnimals.map((animal, index) => (
                    <m.div
                      key={animal.id}
                      initial={
                        shouldReduceMotion ? false : { opacity: 0, y: 8 }
                      }
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

          {/* One form for every new listing, kept mounted so its dialog can
              close on its own terms. Once the POST has gone through it edits
              what came back, read off the live list so the photos it uploads
              next show up as they land. */}
          {manual && (
            <ListingForm
              listing={newListing}
              open={adding}
              onOpenChange={(open) => {
                setAdding(open);
                if (!open) setNewListingId(null);
              }}
              actions={listingActions}
              saveState={
                listingSaveStates[newListingId ?? NEW_LISTING] ?? {
                  status: "idle",
                }
              }
              onCreated={(saved) => setNewListingId(saved.id)}
            />
          )}
        </>
      )}
    </PortalShell>
  );
}
