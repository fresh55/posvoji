"use client";

import { useEffect, useMemo, useState } from "react";
import type { TypedLocation } from "@/lib/origin";

type Reader = (query: string) => TypedLocation;
const EMPTY: TypedLocation = { status: "empty" };

/** Warm the postal catalogue when the picker opens, before its first keystroke. */
export function useTypedLocation(query: string, open: boolean): TypedLocation {
  const [read, setRead] = useState<Reader>();
  useEffect(() => {
    if (!open || read) return;
    let cancelled = false;
    void import("@/lib/origin").then(({ readTypedLocation }) => {
      if (!cancelled) setRead(() => readTypedLocation);
    }).catch(() => { /* Shelter-name search remains available offline. */ });
    return () => { cancelled = true; };
  }, [open, read]);
  return useMemo(() => read ? read(query) : EMPTY, [query, read]);
}
