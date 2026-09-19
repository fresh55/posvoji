"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentProps } from "react";
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import type { FilterSheet as Sheet } from "./filter-sheet";

const FilterSheet = dynamic(
  () => import("./filter-sheet").then((module) => module.FilterSheet),
  { ssr: false },
);

/** Once loaded, keep the sheet mounted so its breakpoint/history cleanup runs. */
export function ResponsiveFilterSheet(props: ComponentProps<typeof Sheet>) {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => {
      if (!query.matches) setNeeded(true);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return needed ? <FilterSheet {...props} /> : null;
}
