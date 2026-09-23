"use client";

import { LazyMotion as Features, MotionConfig } from "motion/react";
import {
  createContext,
  memo,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";

type FeaturesProps = ComponentProps<typeof Features>;

// What the scope wraps, handed past the frame below rather than through it.
const ScopeChildren = createContext<ReactNode>(null);

function ScopedChildren() {
  return useContext(ScopeChildren);
}

// Motion's LazyMotion provides its context as a fresh object on every render,
// and every m.* component beneath it reads that context. So each time the
// scope re-rendered, which is whenever its parent did, every motion component
// in it rendered again as well, memo or no memo: a filter press re-rendered
// the whole panel's icons and ears whether or not anything about them had
// changed. The frame takes only the features, which are a module constant at
// every call site, so it renders once and its context keeps its identity; the
// children reach the tree through a context of their own and re-render only
// as their own parents do.
const Frame = memo(function Frame({
  features,
  strict,
}: Omit<FeaturesProps, "children">) {
  return (
    <MotionConfig reducedMotion="user">
      <Features features={features} strict={strict}>
        <ScopedChildren />
      </Features>
    </MotionConfig>
  );
});

/** Keep animation policy with animated surfaces, out of static-page roots. */
export function LazyMotion({ children, features, strict }: FeaturesProps) {
  return (
    <ScopeChildren.Provider value={children}>
      <Frame features={features} strict={strict} />
    </ScopeChildren.Provider>
  );
}
