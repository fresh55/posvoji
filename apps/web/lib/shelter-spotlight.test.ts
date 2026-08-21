// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  requestShelterSpotlight,
  SHELTER_SPOTLIGHT_EVENT,
  type ShelterSpotlightDetail,
} from "./shelter-spotlight";

describe("requestShelterSpotlight", () => {
  it("carries the shelter id to whoever is listening on window", () => {
    const seen: string[] = [];
    const listener = (event: Event) => {
      seen.push(
        (event as CustomEvent<ShelterSpotlightDetail>).detail.shelterId,
      );
    };
    window.addEventListener(SHELTER_SPOTLIGHT_EVENT, listener);
    try {
      requestShelterSpotlight("zavetisce-ljubljana");
    } finally {
      window.removeEventListener(SHELTER_SPOTLIGHT_EVENT, listener);
    }

    expect(seen).toEqual(["zavetisce-ljubljana"]);
  });
});
