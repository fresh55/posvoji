import type { ReactElement, ReactNode, Ref } from "react";
import {
  LoaderCircle,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/portal/portal-button";
import type { PortalListState } from "@/hooks/portal-list";
import {
  PORTAL_LOGIN_PATH,
  PORTAL_PATH,
  type PortalSessionState,
} from "@/hooks/use-portal-session";
import { cn } from "@/lib/utils";

/**
 * The portal's own name, standing in as the page's heading while there is no
 * animal to name.
 *
 * Every terminal state of both editor pages needs one: the header above is a
 * link and not a heading, so without this the page would have no h1 at all.
 */
export function PortalPageHeading() {
  return (
    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
      {portalText.brand}
    </h1>
  );
}

/** The one line the portal shows while it is still reading something. */
export function PortalPending({ label }: { label: string }) {
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </p>
  );
}

/** A page with nothing to show yet: the portal's name and the line. */
export function PortalPendingPage({ label }: { label: string }) {
  return (
    <>
      <PortalPageHeading />
      <PortalPending label={label} />
    </>
  );
}

/**
 * A save that did not go through, said where the shelter would try it again.
 * Announced, because the button they pressed is often off screen by then.
 *
 * A focusable one can also be given the focus by the page that shows it, so
 * a keyboard user lands on the reason and not on a button that did nothing.
 * It is a programmatic stop only, tabIndex -1, and draws no ring: the text
 * itself is what the focus is for.
 */
export function FieldError({
  ref,
  id,
  focusable = false,
  className,
  children,
}: {
  ref?: Ref<HTMLParagraphElement>;
  id?: string;
  focusable?: boolean;
  /** Spacing the row it sits in needs, where the row does not carry it. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      ref={ref}
      id={id}
      role="alert"
      tabIndex={focusable ? -1 : undefined}
      className={cn(
        "flex items-start gap-1.5 text-sm text-destructive",
        focusable && "outline-none",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/**
 * A state the portal has nothing to show for: no session, no list, no animal
 * under that address. The title names what happened and the body says what to
 * do about it, so the two are never the same sentence.
 *
 * Both pages draw these, which is why it is here rather than beside the list.
 */
export function PortalNotice({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: string;
  action?: ReactNode;
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

/**
 * The frame of a one-line notice above the list: a sentence, and the button
 * that acts on it, which drops under the sentence when the line runs out of
 * room. Each notice sets its own gap between the two.
 */
export const LIST_BANNER =
  "flex flex-wrap items-center justify-between gap-x-4 rounded-ui border bg-muted/30 px-3 py-2.5 text-sm";

/**
 * The session check itself did not answer, so the portal knows neither who is
 * here nor that nobody is.
 *
 * Two ways out, because there are two causes and one button only covers one of
 * them. A server that was briefly away answers the retry. A session that has
 * run out never will, and the body already names the login as the other
 * answer; this is the way to it. Both editor pages and the workspace draw the
 * same state, which is why it is one component and not three copies.
 */
export function SessionError({
  offline,
  onRetry,
}: {
  /** The request never reached the API, which is the one cause a shelter can
   *  do something about themselves. */
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <PortalNotice
      icon={TriangleAlert}
      title={portalText.sessionErrorTitle}
      action={
        // Wrapped, because PortalNotice stacks its action as one item: two
        // bare buttons would sit under each other on every width.
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            {portalText.retry}
          </Button>
          {/* Quieter than the retry: it is the second thing to try, and it
              throws away the page the shelter was on. */}
          <Button asChild variant="ghost" size="sm">
            <Link href={PORTAL_LOGIN_PATH}>{portalText.toLogin}</Link>
          </Button>
        </div>
      }
    >
      {/* The title says what failed, so the body is left to say what to do
          about it. Offline is the one cause the shelter can act on
          themselves, and it names its own next step. */}
      {offline ? portalText.networkError : portalText.sessionErrorLead}
    </PortalNotice>
  );
}

/**
 * No animal or listing under this address: a wrong id, a shelter the account
 * does not have, or an address that names neither. A page that is not about
 * one animal says what it could not open in its own words.
 */
export function EditorNotFound({
  icon = SearchX,
  title = portalText.editorNotFoundTitle,
  lead = portalText.editorNotFoundLead,
}: {
  icon?: LucideIcon;
  title?: string;
  lead?: string;
}) {
  return (
    <>
      <PortalPageHeading />
      <PortalNotice
        icon={icon}
        title={title}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={PORTAL_PATH}>{portalText.backToList}</Link>
          </Button>
        }
      >
        {lead}
      </PortalNotice>
    </>
  );
}

/**
 * The list the editor's subject would be in did not arrive, so the page has no
 * way of knowing whether the address is a wrong one. `onReload` asks for the
 * list again, which is the only thing either page can offer.
 */
export function EditorListError({
  message,
  onReload,
}: {
  message: string;
  onReload: () => void;
}) {
  return (
    <>
      <PortalPageHeading />
      <PortalNotice
        icon={TriangleAlert}
        title={portalText.listErrorTitle}
        action={
          <Button variant="outline" size="sm" onClick={onReload}>
            {portalText.retry}
          </Button>
        }
      >
        {message}
      </PortalNotice>
    </>
  );
}

/**
 * What a page draws while there is no session to work under, or null once
 * there is: the line while it is read and while a visitor without one is sent
 * to the login, and the notice when it could not be read.
 */
export function sessionGate(
  session: PortalSessionState,
  onRetry: () => void,
): ReactElement | null {
  if (session.status === "loading" || session.status === "anonymous") {
    return (
      <PortalPendingPage
        label={
          session.status === "anonymous"
            ? portalText.redirecting
            : portalText.loading
        }
      />
    );
  }
  if (session.status === "error") {
    return (
      <>
        <PortalPageHeading />
        <SessionError offline={session.offline} onRetry={onRetry} />
      </>
    );
  }
  return null;
}

/**
 * What a page draws until the list its subject is in has arrived, or null
 * once it has: the notice when the list could not be read, and the line while
 * it is on its way. `showing` is whether the portal is on the shelter the
 * address names yet; until it is, that shelter's list is not the one here.
 */
export function listGate(
  showing: boolean,
  state: PortalListState,
  onReload: () => void,
): ReactElement | null {
  if (showing && state.status === "error") {
    return <EditorListError message={state.message} onReload={onReload} />;
  }
  if (!showing || state.status !== "ready") {
    return <PortalPendingPage label={portalText.loading} />;
  }
  return null;
}
