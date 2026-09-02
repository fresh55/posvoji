"use client";

import { useEffect } from "react";
import { FOUND_ANIMAL_PARAM, FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale } from "@/lib/i18n";

// /?najdena, kept working after the lookup left the homepage dialog for a page
// of its own. Municipality websites published that link and there is no way to
// ask them to change it, so the homepage answers it by sending the visitor to
// the page the flow lives on now.
//
// A client effect because the site is a static export: there is no server to
// read the query with, and the prerendered homepage is what any such link
// opens. location.replace and not a push, so the back button goes where the
// visitor came from rather than to a homepage that would bounce them forward
// again.
//
// Renders nothing. The redirect is the whole of it, and it has to run from the
// homepage rather than from a route of its own, because the parameter hangs
// off the homepage's own address.
export function FoundAnimalRedirect({ locale }: { locale: Locale }) {
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (!search.has(FOUND_ANIMAL_PARAM)) return;
    window.location.replace(FOUND_ANIMAL_PATHS[locale]);
  }, [locale]);

  return null;
}
