"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Clock,
  LoaderCircle,
  Mail,
  MailCheck,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { PortalShell } from "@/components/portal/portal-shell";
import { fill, portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PORTAL_PATH } from "@/hooks/use-portal-session";
import {
  commitSearch,
  getSearchSnapshot,
  getServerSearchSnapshot,
  subscribeToLocation,
} from "@/lib/location-search";
import {
  PortalError,
  isUnauthorized,
  requestLoginLink,
  verifyToken,
} from "@/lib/portal-api";
import { cn } from "@/lib/utils";

// The import sits inside a branch on a compile time literal, so a production
// build folds it away and never emits the picker's chunk. See the component.
const PortalDevLogin =
  process.env.NODE_ENV === "production"
    ? null
    : dynamic(
        () =>
          import("@/components/portal/portal-dev-login").then(
            (module) => module.PortalDevLogin,
          ),
        { ssr: false },
      );

type LoginState =
  | { step: "form"; error?: string }
  | { step: "sending" }
  | { step: "sent"; email: string }
  | { step: "verifying" }
  | { step: "expired" };

function errorMessage(error: unknown): string {
  if (error instanceof PortalError && error.kind === "network") {
    return portalText.networkError;
  }
  return portalText.unknownError;
}

/** The round mark every step opens with. Its tone carries the outcome. */
const MARK_TONES = {
  accent:
    "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
  quiet: "border-border bg-muted/50 text-muted-foreground",
  warn: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
} as const;

function Mark({
  icon: Icon,
  tone,
  spin = false,
}: {
  icon: LucideIcon;
  tone: keyof typeof MARK_TONES;
  spin?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 place-items-center rounded-ui border",
        MARK_TONES[tone],
      )}
    >
      <Icon
        className={cn("size-5", spin && "animate-spin")}
        strokeWidth={1.75}
      />
    </span>
  );
}

export function PortalLogin() {
  const shouldReduceMotion = useReducedMotion();
  // No useSearchParams: the prerendered HTML of a static export carries no
  // query at all, and this store hands the client snapshot over at hydration
  // without a mismatch. Same store the filters and the animal dialog read.
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const token = useMemo(
    () => new URLSearchParams(search).get("token"),
    [search],
  );

  const [state, setState] = useState<LoginState>({ step: "form" });
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState<string | null>(null);

  // A token in the URL switches the card to "verifying" in the same render it
  // becomes visible, so the login form never flashes behind it.
  if (token && token !== checking) {
    setChecking(token);
    setState({ step: "verifying" });
  }

  useEffect(() => {
    if (!token) return;
    let live = true;

    verifyToken(token).then(
      () => {
        // replace, not assign: the token never becomes a history entry the
        // back button can walk into.
        if (live) window.location.replace(PORTAL_PATH);
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) {
          setState({ step: "expired" });
          return;
        }
        setState({ step: "form", error: errorMessage(error) });
      },
    );

    return () => {
      live = false;
    };
  }, [token]);

  function backToForm() {
    // Drops the spent token from the address bar before the form returns.
    if (token) commitSearch("", "replace");
    setState({ step: "form" });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setState({ step: "form", error: portalText.emailRequired });
      return;
    }

    setState({ step: "sending" });
    try {
      await requestLoginLink(address);
      setState({ step: "sent", email: address });
    } catch (error) {
      setState({ step: "form", error: errorMessage(error) });
    }
  }

  const sending = state.step === "sending";
  const error = state.step === "form" ? state.error : undefined;
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: "easeOut" as const };

  return (
    <PortalShell narrow>
      {/* The key remounts the card on every step, so each one fades in on its
          own. No AnimatePresence: a login step must never be held back
          waiting for the previous one to finish leaving. */}
      <m.section
        key={state.step === "sending" ? "form" : state.step}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className="space-y-5 rounded-ui border bg-card p-6 shadow-xs"
      >
        {state.step === "verifying" && (
          <div className="space-y-4" aria-live="polite">
            <Mark icon={LoaderCircle} tone="quiet" spin />
            <h1 className="text-lg font-medium tracking-tight">
              {portalText.verifying}
            </h1>
          </div>
        )}

        {state.step === "expired" && (
          <div className="space-y-4" aria-live="polite">
            <Mark icon={Clock} tone="warn" />
            <div className="space-y-1.5">
              <h1 className="text-lg font-medium tracking-tight">
                {portalText.expiredTitle}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {portalText.expiredLead}
              </p>
            </div>
            <Button onClick={backToForm} className="w-full">
              {portalText.requestNewLink}
            </Button>
          </div>
        )}

        {state.step === "sent" && (
          <div className="space-y-4" aria-live="polite">
            <Mark icon={MailCheck} tone="accent" />
            <div className="space-y-1.5">
              <h1 className="text-lg font-medium tracking-tight">
                {portalText.sentTitle}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {fill(portalText.sentLead, { email: state.email })}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {portalText.sentHint}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={backToForm}
              className="w-full"
            >
              {portalText.sendAgain}
            </Button>
          </div>
        )}

        {(state.step === "form" || sending) && (
          <>
            <div className="space-y-4">
              <Mark icon={Mail} tone="accent" />
              <div className="space-y-1.5">
                <h1 className="text-lg font-medium tracking-tight">
                  {portalText.loginTitle}
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {portalText.loginLead}
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="portal-email">
                  {portalText.emailLabel}
                </Label>
                <Input
                  id="portal-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  required
                  disabled={sending}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "portal-email-error" : undefined}
                  placeholder={portalText.emailPlaceholder}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setState({ step: "form" });
                  }}
                />
              </div>

              {error && (
                <p
                  id="portal-email-error"
                  role="alert"
                  className="flex items-start gap-1.5 text-sm text-destructive"
                >
                  <TriangleAlert
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                  {error}
                </p>
              )}

              <Button type="submit" disabled={sending} className="w-full">
                {sending ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <Send aria-hidden />
                )}
                {sending ? portalText.sending : portalText.sendLink}
              </Button>
            </form>
          </>
        )}
      </m.section>

      {/* Nothing in a production build, and nothing when the API runs
          without PORTAL_DEV_LOGIN. */}
      {PortalDevLogin && <PortalDevLogin />}
    </PortalShell>
  );
}
