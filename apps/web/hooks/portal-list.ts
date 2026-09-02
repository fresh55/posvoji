// What usePortalAnimals and usePortalListings both keep: the two states a
// shelter's list can be in, the per-record save slot, and what a failure says.
// One copy, because the two hooks answer for the same screen and a fix applied
// to one and not the other is a silent difference in what a shelter is told.

import { portalText } from "@/components/portal/portal-text";
import { PortalError, type PortalErrorKind } from "@/lib/portal-api";

export const SAVED_FLASH_MS = 1800;

export type PortalListState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type PortalSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export const IDLE: PortalSaveState = { status: "idle" };

// What each failure says to a shelter. A kind that is not here says only
// what the caller was doing, which is all a server fault can honestly say.
const MESSAGES: Partial<Record<PortalErrorKind, string>> = {
  forbidden: portalText.forbidden,
  network: portalText.networkError,
  invalid: portalText.invalidError,
};

export function message(error: unknown, fallback: string): string {
  if (error instanceof PortalError) {
    const known = MESSAGES[error.kind];
    if (known) return known;
  }
  return fallback;
}
