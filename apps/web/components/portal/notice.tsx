import type { ReactNode } from "react";
import { LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { portalText } from "@/components/portal/portal-text";

/**
 * The portal's own name, standing in as the page's heading while there is no
 * animal to name.
 *
 * Every terminal state of both editor pages needs one: the header above is a
 * link and not a heading, so without this the page would have no h1 at all.
 */
export function PortalPageHeading() {
  return (
    <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
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
 */
export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-sm text-destructive"
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
