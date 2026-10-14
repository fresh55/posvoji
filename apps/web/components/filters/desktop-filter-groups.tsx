"use client";

import { useSyncExternalStore } from "react";
import { DESKTOP_QUERY } from "@/lib/viewport-queries";
import {
  FilterGroupsContent,
  useFilterGroupSections,
  type FilterGroupListProps,
} from "./filter-groups";

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia?.(DESKTOP_QUERY);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

function isDesktop(): boolean {
  return window.matchMedia?.(DESKTOP_QUERY).matches ?? true;
}

function serverDesktop(): boolean {
  return true;
}

/** Keep the exported sidebar and its first hydration render identical. Once
 *  hydrated, a phone has its own sheet and needs none of these hidden groups.
 *  Only the controls unmount: their section decisions stay here, and the
 *  sidebar's location picker keeps its state and history ownership too. */
export function DesktopFilterGroups(
  props: Omit<FilterGroupListProps, "layout">,
) {
  const sections = useFilterGroupSections(props.filters);
  const desktop = useSyncExternalStore(subscribe, isDesktop, serverDesktop);
  return desktop ? <FilterGroupsContent {...props} sections={sections} /> : null;
}
