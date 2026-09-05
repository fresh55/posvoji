"use client";

import { useCallback, useMemo, useState } from "react";
import { Inbox, LoaderCircle, Plus, SearchX, TriangleAlert } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { PortalAnimalCard } from "@/components/portal/animal-card";
import {
  PortalListTools,
  filterPortalAnimals,
  type PortalListEntry,
} from "@/components/portal/list-tools";
import { PortalListingCard } from "@/components/portal/listing-card";
import { ListingForm } from "@/components/portal/listing-form";
import { PortalNotice } from "@/components/portal/notice";
import { usePortal } from "@/components/portal/portal-provider";
import { portalText } from "@/components/portal/portal-text";
import { ShelterSwitcher } from "@/components/portal/shelter-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NEW_LISTING } from "@/hooks/use-portal-listings";
import { animalCount } from "@/lib/labels";

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

export function PortalWorkspace() {
  const shouldReduceMotion = useReducedMotion();
  const {
    session: state,
    reloadSession,
    shelters,
    active,
    activeShelter,
    manual,
    setActive,
    animals,
    animalState,
    saveStates,
    reloadAnimals,
    save,
    publicName,
    listings,
    listingState,
    listingSaveStates,
    reloadListings,
    listingActions,
    query,
    setQuery,
    status,
    setStatus,
    clearFilters,
  } = usePortal();
  // The "Dodaj žival" dialog, and the listing it made once it has: the form
  // keeps editing that one while its photos go up, so it is read back off
  // the live list rather than off the answer to the POST.
  const [adding, setAdding] = useState(false);
  const [newListingId, setNewListingId] = useState<string | null>(null);

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

  // The workspace names itself "Vaše živali" below, and that is the page's
  // heading once there is a list to name. Every state before it is the same
  // page with nothing to name yet, and the header's brand line is a link, not
  // a heading, so without this the page would have no h1 at all.
  const hasOwnHeading = state.status === "ready" && shelters.length > 0;

  return (
    <>
      {!hasOwnHeading && (
        <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
          {portalText.brand}
        </h1>
      )}

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
        <PortalNotice
          icon={TriangleAlert}
          title={portalText.sessionErrorTitle}
          action={
            <Button variant="outline" size="sm" onClick={reloadSession}>
              {portalText.retry}
            </Button>
          }
        >
          {/* The title says what failed, so the body is left to say what to
              do about it. Offline is the one cause the shelter can act on
              themselves, and it names its own next step. */}
          {state.offline
            ? portalText.networkError
            : portalText.sessionErrorLead}
        </PortalNotice>
      )}

      {state.status === "ready" && shelters.length === 0 && (
        <PortalNotice icon={Inbox} title={portalText.noSheltersTitle}>
          {portalText.noSheltersLead}
        </PortalNotice>
      )}

      {state.status === "ready" && shelters.length > 0 && (
        <>
          {shelters.length > 1 && (
            <ShelterSwitcher
              shelters={shelters}
              active={active}
              onSelect={(slug) => {
                if (slug === active) return;
                // The provider drops the filters with the shelter; the half
                // that is this page's own is the add form, which is about a
                // listing that would belong to the shelter being left.
                setActive(slug);
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
              <PortalNotice
                icon={TriangleAlert}
                title={portalText.listErrorTitle}
                action={
                  <Button variant="outline" size="sm" onClick={reloadList}>
                    {portalText.retry}
                  </Button>
                }
              >
                {listState.message}
              </PortalNotice>
            )}

            {listState.status === "ready" &&
              all.length === 0 &&
              (manual ? (
                <PortalNotice
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
                </PortalNotice>
              ) : (
                <PortalNotice icon={Inbox} title={portalText.emptyTitle}>
                  {portalText.emptyLead}
                </PortalNotice>
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
                <PortalNotice
                  icon={SearchX}
                  title={portalText.noMatchesTitle}
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      {portalText.showAll}
                    </Button>
                  }
                >
                  {portalText.noMatchesLead}
                </PortalNotice>
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
                        publicName={publicName(animal)}
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
    </>
  );
}
