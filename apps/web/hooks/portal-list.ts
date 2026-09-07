// What usePortalAnimals and usePortalListings both keep: the two states a
// shelter's list can be in, the per-record save slot, and what a failure says.
// One copy, because the two hooks answer for the same screen and a fix applied
// to one and not the other is a silent difference in what a shelter is told.

import { fieldLabel } from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
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

// What each failure says to a shelter. null says only what the caller was
// doing, which is all a server fault can honestly say. Total rather than
// partial on purpose: a new kind on PortalError is then a compile error here,
// so it cannot be worded on the login card and forgotten in the workspace.
const MESSAGES: Record<PortalErrorKind, string | null> = {
  forbidden: portalText.forbidden,
  network: portalText.networkError,
  invalid: portalText.invalidError,
  // No route the workspace calls is rate limited yet. When one is, this is
  // where its wait is worded; the login card words its own.
  throttled: null,
  unauthorized: null,
  notFound: null,
  server: null,
};

/** "Ime", "Ime in Pasma", "Ime, Pasma in Spol". */
function listFields(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} in ${labels[labels.length - 1]}`;
}

/** The invalid message, naming the fields when the API did. */
export function invalidMessage(fields: readonly string[]): string {
  if (fields.length === 0) return portalText.invalidError;
  const template =
    fields.length === 1
      ? portalText.invalidFieldOne
      : fields.length === 2
        ? portalText.invalidFieldTwo
        : portalText.invalidFieldMany;
  return fill(template, { fields: listFields(fields.map(fieldLabel)) });
}

export function message(error: unknown, fallback: string): string {
  if (error instanceof PortalError) {
    if (error.kind === "invalid") return invalidMessage(error.fields);
    const known = MESSAGES[error.kind];
    if (known) return known;
  }
  return fallback;
}
