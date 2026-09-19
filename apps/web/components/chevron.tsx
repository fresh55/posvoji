import { cn } from "@/lib/utils";
import styles from "./chevron.module.css";

/** Repeated card icons share one CSS mask instead of an SVG tree per card. */
export function Chevron({
  left = false,
  className,
}: {
  left?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-4", styles.chevron, left && styles.left, className)}
    />
  );
}
