"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import { fill, portalText } from "@/components/portal/portal-text";
import { ShelterSwitcher } from "@/components/portal/shelter-switcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NEW_LISTING } from "@/hooks/use-portal-listings";
import { animalCount } from "@/lib/labels";
import { draftIds, subscribeDrafts } from "@/lib/portal-drafts";

// One empty set for every state with no stored drafts, so a re-read that
// finds none does not hand the list a new object to re-render for.
const EMPTY_DRAFTS: ReadonlySet<string> = new Set();

/** Names a card in the page, so a save can scroll back to the one it went to.
 *  The id travels through an attribute, and a crawled one holds a colon. */
function cardDomId(animalId: string): string {
  return `animal-${encodeURIComponent(animalId)}`;
}

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
    account,
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
    lastSaved,
    clearLastSaved,
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

  // The animal the last save went to, when the filters no longer let it
  // through. Read off the whole list, because that is where it still is.
  const hiddenSave =
    lastSaved && !visibleAnimals.some((animal) => animal.id === lastSaved)
      ? (animals.find((animal) => animal.id === lastSaved) ?? null)
      : null;
  const hidden = hiddenSave !== null;

  // Which animals this tab is still holding unsaved work for. Storage is an
  // external store and is read as one, so a draft written or dropped anywhere
  // in this tab reaches the list without an effect that sets state.
  //
  // The snapshot has to be the same object until the answer actually changes,
  // or every render would produce a fresh Set and React would never settle.
  // The two listeners are for a page the browser restored from its cache,
  // which runs no effect of its own to ask again with.
  const draftCache = useRef<{ signature: string; ids: ReadonlySet<string> }>({
    signature: "",
    ids: EMPTY_DRAFTS,
  });
  const subscribeToDrafts = useCallback((onChange: () => void) => {
    const unsubscribe = subscribeDrafts(onChange);
    window.addEventListener("pageshow", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, []);
  const readDrafts = useCallback((): ReadonlySet<string> => {
    if (!account || !active || manual) return EMPTY_DRAFTS;
    const ids = draftIds(account, active);
    // Ids never carry a newline, so it is a safe separator for the join.
    const signature = [...ids].sort().join("\n");
    if (draftCache.current.signature !== signature) {
      draftCache.current = { signature, ids };
    }
    return draftCache.current.ids;
  }, [account, active, manual]);
  const drafts = useSyncExternalStore(
    subscribeToDrafts,
    readDrafts,
    () => EMPTY_DRAFTS,
  );

  // Back from the editor onto a long list, the card that was just saved is
  // somewhere off screen. Once, when the save is known and the card is on the
  // page: while it is filtered away the notice above the list stands in.
  useEffect(() => {
    if (!lastSaved || hidden) return;
    document
      .getElementById(cardDomId(lastSaved))
      ?.scrollIntoView({ block: "center" });
  }, [hidden, lastSaved]);

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
                // Touching a filter is the shelter looking for something
                // else, so the pointer back to the card they last saved has
                // done its job and goes.
                onQueryChange={(next) => {
                  clearLastSaved();
                  setQuery(next);
                }}
                status={status}
                onStatusChange={(next) => {
                  clearLastSaved();
                  setStatus(next);
                }}
              />
            )}

            {/* The save went through, but the animal no longer matches what
                the shelter is looking at, so the card would simply be gone.
                It is named, and the whole list is one tap away. */}
            {hiddenSave && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-ui border bg-muted/30 px-3 py-2 text-sm"
              >
                <p className="min-w-0">
                  {fill(portalText.savedHidden, {
                    name: hiddenSave.name ?? portalText.unnamed,
                  })}
                </p>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  {portalText.showAll}
                </Button>
              </div>
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
                      // Named so a save made on the editor page can bring the
                      // shelter back to the card it belonged to.
                      id={cardDomId(animal.id)}
                    >
                      <PortalAnimalCard
                        animal={animal}
                        shelter={activeShelter}
                        publicName={publicName(animal)}
                        hasDraft={drafts.has(animal.id)}
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
