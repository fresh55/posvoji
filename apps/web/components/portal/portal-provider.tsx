"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
import type { PortalListState, PortalSaveState } from "@/hooks/portal-list";
import { usePortalAnimals } from "@/hooks/use-portal-animals";
import {
  usePortalListings,
  type PortalListingActions,
} from "@/hooks/use-portal-listings";
import {
  PORTAL_LOGIN_PATH,
  usePortalSession,
  type PortalSessionState,
} from "@/hooks/use-portal-session";
import {
  isManualShelter,
  type PortalAnimal,
  type PortalAnimalPatch,
  type PortalListing,
  type PortalShelter,
  type PortalStatus,
} from "@/lib/portal-api";

/**
 * Everything both portal pages read: the session, the shelter they are looking
 * at, its list, and the filters over that list.
 *
 * The list page and the editor page are two routes now, and a client
 * navigation between them must not re-fetch the session or the animals, or
 * every edit would cost two round trips and the "Shranjeno" flash would be
 * gone before the shelter is back at the card it saved. The state therefore
 * lives above both, in the layout of the (app) group, and the pages are
 * consumers.
 */
export type PortalContextValue = {
  session: PortalSessionState;
  reloadSession: () => void;
  /** True from the moment the shelter asks to leave until the page is gone. */
  leaving: boolean;
  signOut: () => void;
  shelters: PortalShelter[];
  /** The slug the pages are working under, or null before there is a shelter. */
  active: string | null;
  /** The whole shelter: the public link is built from its name and town too. */
  activeShelter: PortalShelter | null;
  /** A shelter with no catalogue of its own writes its listings here. */
  manual: boolean;
  setActive: (slug: string) => void;
  animals: PortalAnimal[];
  animalState: PortalListState;
  saveStates: Record<string, PortalSaveState>;
  reloadAnimals: () => void;
  save: (animalId: string, patch: PortalAnimalPatch) => Promise<boolean>;
  publicName: (animal: PortalAnimal) => string | null;
  listings: PortalListing[];
  listingState: PortalListState;
  listingSaveStates: Record<string, PortalSaveState>;
  reloadListings: () => void;
  listingActions: PortalListingActions;
  query: string;
  setQuery: (query: string) => void;
  status: PortalStatus | null;
  setStatus: (status: PortalStatus | null) => void;
  clearFilters: () => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

// One array for every state that has no shelters, so the context value is not
// rebuilt on each render only because a fresh [] was allocated for it.
const NO_SHELTERS: PortalShelter[] = [];

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal outside PortalProvider");
  return value;
}

/** The email, the way to the public page and the way out. One header for both
 *  pages, so the way out is in the same place wherever the shelter is. */
function HeaderActions() {
  const { session, active, leaving, signOut } = usePortal();
  if (session.status !== "ready") return null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:inline">
        {session.session.email}
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
      <Button variant="ghost" size="sm" disabled={leaving} onClick={signOut}>
        <LogOut aria-hidden />
        {portalText.logout}
      </Button>
    </div>
  );
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const { state: session, reload: reloadSession, signOut } = usePortalSession();
  const [chosen, setChosen] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PortalStatus | null>(null);

  const shelters =
    session.status === "ready" ? session.session.shelters : NO_SHELTERS;
  const active = chosen ?? shelters[0]?.slug ?? null;
  const activeShelter =
    shelters.find((shelter) => shelter.slug === active) ?? null;
  // No mode means a crawled shelter, which is what every shelter was before
  // the field.
  const manual = activeShelter ? isManualShelter(activeShelter) : false;

  const clearFilters = useCallback(() => {
    setQuery("");
    setStatus(null);
  }, []);

  // A filter set over one shelter's list means nothing over the next one's,
  // so switching starts from the whole list again. Callers only reach for
  // this when the shelter actually changes.
  const setActive = useCallback(
    (slug: string) => {
      setChosen(slug);
      clearFilters();
    },
    [clearFilters],
  );

  // The guard: no session, no portal. replace() so the back button does not
  // walk into a page that will only bounce again.
  useEffect(() => {
    if (session.status === "anonymous")
      window.location.replace(PORTAL_LOGIN_PATH);
  }, [session.status]);

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
    publicName,
  } = usePortalAnimals(manual ? null : active, onUnauthorized);
  const {
    listings,
    state: listingState,
    saveStates: listingSaveStates,
    reload: reloadListings,
    actions: listingActions,
  } = usePortalListings(manual ? active : null, onUnauthorized);

  const leave = useCallback(() => {
    setLeaving(true);
    void signOut();
  }, [signOut]);

  const value = useMemo<PortalContextValue>(
    () => ({
      session,
      reloadSession,
      leaving,
      signOut: leave,
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
    }),
    [
      session,
      reloadSession,
      leaving,
      leave,
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
      status,
      clearFilters,
    ],
  );

  return (
    <PortalContext value={value}>
      <PortalShell actions={<HeaderActions />}>{children}</PortalShell>
    </PortalContext>
  );
}
