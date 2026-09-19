"use client";

import { useEffect, useState } from "react";
import type { TypedLocation } from "@/lib/origin";

const EMPTY: TypedLocation = { status: "empty" };

/** The postal catalogue is needed only after someone types a place. */
export function useTypedLocation(query: string): TypedLocation {
  const [answer, setAnswer] = useState<{ query: string; location: TypedLocation }>();
  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    void import("@/lib/origin").then(({ readTypedLocation }) => {
      if (!cancelled) setAnswer({ query, location: readTypedLocation(query) });
    }).catch(() => { /* The shelter-name search remains available offline. */ });
    return () => { cancelled = true; };
  }, [query]);
  return answer?.query === query ? answer.location : EMPTY;
}
