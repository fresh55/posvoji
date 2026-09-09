import { VIEW_TRANSITION_SCRIPT } from "@/lib/view-transition-script";

/** A classic head script: a client effect is too late for pagereveal. */
export function ViewTransitionScript() {
  return <script dangerouslySetInnerHTML={{ __html: VIEW_TRANSITION_SCRIPT }} />;
}
