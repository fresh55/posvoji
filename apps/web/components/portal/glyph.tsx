import type { LucideIcon } from "lucide-react";

/**
 * An icon the caller chose at render time, drawn at the portal's stroke.
 *
 * The icon is a prop rather than a component named in place: naming one there
 * would be a component created during render, which react-hooks/static-
 * components rejects because it would remount on every pass.
 */
export function Glyph({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
