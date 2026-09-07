"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import {
  PORTAL_ERROR_NO_SESSION,
  PORTAL_ERROR_PARAM,
  landAfterLogin,
  peekPortalReturn,
} from "@/hooks/use-portal-session";
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
import { mailtoHref } from "@/lib/contact-links";
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

// A failure the address is to blame for and a failure it is not are two
// different messages: only the first may mark the field invalid.
type LoginState =
  | { step: "form"; error?: { text: string; onField: boolean } }
  | { step: "sending" }
  | { step: "sent"; email: string }
  | { step: "verifying" }
  | { step: "expired" };

/**
 * The wait, said in minutes. The API states it in seconds and rounds nothing,
 * so anything under a minute still reads as one: "0 min" would tell a shelter
 * to press the button again straight away, which is what got them here.
 */
function throttledMessage(seconds: number | undefined): string {
  if (seconds === undefined) return portalText.throttledHour;
  return fill(portalText.throttledMinutes, {
    minutes: Math.max(1, Math.ceil(seconds / 60)),
  });
}

// The one place the card picks the words for a failure. Throttling is the
// failure a shelter meets by retrying, so it may never read as "nekaj je šlo
// narobe": that sentence asks for the very retry that is being refused.
function errorMessage(error: unknown): string {
  if (error instanceof PortalError) {
    if (error.kind === "network") return portalText.networkError;
    if (error.kind === "throttled") {
      return throttledMessage(error.retryAfterSeconds);
    }
  }
  return portalText.unknownError;
}

// The help line, cut around the address once: the sentence never changes.
// Split rather than interpolated, because what goes in the gap is a link and
// not a word: shelter staff read this on a phone, where an address that is
// only text has to be copied out by hand.
const [HELP_BEFORE, HELP_AFTER] = portalText.helpLine.split("{email}");

// The character class is copied from lib/shelters.ts, which is the rule the
// register is validated against: no character that turns one recipient into a
// list or a header. That file reads node:fs, so it cannot be imported here.
const EMAIL_SHAPE = /^[^\s<>()[\]\\,;:@"]+@[^\s<>()[\]\\,;:@"]+\.[a-z]{2,}$/i;

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

/**
 * The heading every step opens with. A step that moves the reader to its
 * heading passes the ref, and only that heading takes focus.
 */
function StepHeading({
  children,
  ref,
}: {
  children: React.ReactNode;
  ref?: React.Ref<HTMLHeadingElement>;
}) {
  const focusable = ref !== undefined;
  return (
    <h1
      ref={ref}
      tabIndex={focusable ? -1 : undefined}
      className={cn(
        "text-lg font-medium tracking-tight",
        focusable && "outline-none",
      )}
    >
      {children}
    </h1>
  );
}

export function PortalLogin() {
  const shouldReduceMotion = useReducedMotion();
  // No useSearchParams: the prerendered HTML of a static export carries no
  // query at all, and this store hands the client snapshot over at hydration
  // without a mismatch.
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  // What the address the card was opened on says: the token of a link from
  // the mail, the page that link was asked to come back to, and the guard's
  // reason for sending a visitor here.
  const link = useMemo(() => {
    const params = new URLSearchParams(search);
    return {
      token: params.get("token"),
      back: params.get("nazaj"),
      // The workspace's guard sends a visitor back with this when a
      // verification that worked left no session cookie behind.
      noSession:
        params.get(PORTAL_ERROR_PARAM) === PORTAL_ERROR_NO_SESSION,
    };
  }, [search]);

  const [state, setState] = useState<LoginState>({ step: "form" });
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState<{
    token: string;
    back: string | null;
  } | null>(null);
  const [bounced, setBounced] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A token in the URL switches the card to "verifying" in the same render it
  // becomes visible, so the login form never flashes behind it.
  if (link.token && link.token !== checking?.token) {
    setChecking({ token: link.token, back: link.back });
    setState({ step: "verifying" });
  }

  // The bounce is read the same way and in the same render, so the form is
  // never on screen without the reason it is there. A token wins: the visitor
  // is arriving with a link, not coming back from a workspace.
  if (link.noSession && !link.token && !bounced) {
    setBounced(true);
    setState({
      step: "form",
      error: { text: portalText.sessionNotStored, onField: false },
    });
  }

  // Keyed on the captured token, not on the one still in the URL: the effect
  // takes the token out of the address bar itself, and reading it from the
  // location would then cancel the very request it just started.
  useEffect(() => {
    if (!checking) return;
    let live = true;

    // A login link is single use. Once it has been read it has no business in
    // the address bar, in the history, or in a referer. The whole query goes,
    // so the page it named goes with it.
    commitSearch("", "replace");

    verifyToken(checking.token).then(
      () => {
        if (!live) return;
        // The page the link named, when it named one. Where that lands, and
        // what it does to the page this tab remembers, is the hook's to say.
        landAfterLogin(checking.back);
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) {
          setState({ step: "expired" });
          return;
        }
        setState({
          step: "form",
          error: { text: errorMessage(error), onField: false },
        });
      },
    );

    return () => {
      live = false;
    };
  }, [checking]);

  // The reason has been said on the card, so it has no business in the address
  // bar: a reload or a shared link would otherwise carry the same notice to a
  // page that is only asking for an address.
  useEffect(() => {
    if (!bounced) return;
    commitSearch("", "replace");
  }, [bounced]);

  // Every step but the form replaces the card's whole content, so the reader
  // is moved to the new heading rather than left on a button that is gone.
  useEffect(() => {
    if (state.step === "form" || state.step === "sending") return;
    headingRef.current?.focus();
  }, [state.step]);

  function backToForm() {
    setState({ step: "form" });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setState({
        step: "form",
        error: { text: portalText.emailRequired, onField: true },
      });
      return;
    }
    if (!EMAIL_SHAPE.test(address)) {
      setState({
        step: "form",
        error: { text: portalText.emailInvalid, onField: true },
      });
      return;
    }

    setState({ step: "sending" });
    try {
      // Along with the address goes the page the shelter was sent here from,
      // for the link to bring back: the mail opens it in a tab of its own,
      // which has no storage of ours to read that page from. Peeked, not
      // taken: a login that follows in this tab still lands there.
      await requestLoginLink(address, peekPortalReturn());
      setState({ step: "sent", email: address });
    } catch (cause) {
      // The address is not what failed, so it keeps its valid state and the
      // form carries the message.
      setState({
        step: "form",
        error: { text: errorMessage(cause), onField: false },
      });
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
            <StepHeading ref={headingRef}>{portalText.verifying}</StepHeading>
          </div>
        )}

        {state.step === "expired" && (
          <div className="space-y-4" aria-live="polite">
            <Mark icon={Clock} tone="warn" />
            <div className="space-y-1.5">
              <StepHeading ref={headingRef}>
                {portalText.expiredTitle}
              </StepHeading>
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
              <StepHeading ref={headingRef}>
                {portalText.sentTitle}
              </StepHeading>
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
                <StepHeading>{portalText.loginTitle}</StepHeading>
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
                  aria-invalid={error?.onField ? true : undefined}
                  aria-describedby={
                    error?.onField ? "portal-email-error" : undefined
                  }
                  placeholder={portalText.emailPlaceholder}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setState({ step: "form" });
                  }}
                />
              </div>

              {/* A server or a network that did not answer says nothing about
                  the address, so it carries no id the field points at. */}
              {error && (
                <p
                  id={error.onField ? "portal-email-error" : undefined}
                  role="alert"
                  className="flex items-start gap-1.5 text-sm text-destructive"
                >
                  <TriangleAlert
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                  {error.text}
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

            {/* Under the form, where a shelter that cannot get past it is
                already looking. The address is a link and not text: on a
                phone it has to open the mail app rather than be copied out
                by hand. */}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {HELP_BEFORE}
              <a
                href={mailtoHref(portalText.contactEmail)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {portalText.contactEmail}
              </a>
              {HELP_AFTER}
            </p>
          </>
        )}
      </m.section>

      {/* Nothing in a production build, and nothing when the API runs
          without PORTAL_DEV_LOGIN. */}
      {PortalDevLogin && <PortalDevLogin />}
    </PortalShell>
  );
}
