import type { ReactNode, Ref } from "react";
import {
  LoaderCircle,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
import { PORTAL_PATH } from "@/hooks/use-portal-session";
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
 * No animal or listing under this address: a wrong id, a shelter the account
 * does not have, or an address that names neither.
 */
export function EditorNotFound() {
  return (
    <>
      <PortalPageHeading />
      <PortalNotice
        icon={SearchX}
        title={portalText.editorNotFoundTitle}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={PORTAL_PATH}>{portalText.backToList}</Link>
          </Button>
        }
      >
        {portalText.editorNotFoundLead}
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
