import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
