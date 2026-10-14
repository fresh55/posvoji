// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAnimalFilters } from "./use-animal-filters";
import { commitSearch } from "@/lib/location-search";

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

describe("filter identity across query writes", () => {
  it("keeps filters and their actions when only foreign parameters change", () => {
    history.replaceState(null, "", "/?spol=samica&starost=mlad");
    const { result } = renderHook(useAnimalFilters);
    const initial = result.current;

    for (const query of [
      "razvrsti=ime&starost=mlad&spol=samica",
      "starost=mlad&foto=2&spol=samica",
      "zival=test&spol=samica&starost=mlad",
      "najdena=pes&spol=samica&starost=mlad&isci=retired",
    ]) {
      act(() => commitSearch(query, "replace"));
      expect(result.current.search).toBe(window.location.search);
      expect(result.current.filters).toBe(initial.filters);
      expect(result.current.toggle).toBe(initial.toggle);
      expect(result.current.toggleGoodWith).toBe(initial.toggleGoodWith);
      expect(result.current.toggleCare).toBe(initial.toggleCare);
    }
  });

  it("reads repeated and encoded filter parameters, and still follows real changes", () => {
    history.replaceState(null, "", "/?%73pol=samec&spol=samica&starost=mlad");
    const { result } = renderHook(useAnimalFilters);
    const initial = result.current.filters;
    expect(initial.sex).toEqual(["male", "female"]);

    act(() => commitSearch("foto=2&starost=mlad&spol=samec&spol=samica", "replace"));
    expect(result.current.filters).toBe(initial);

    act(() => commitSearch("foto=2&spol=samica&starost=mlad", "replace"));
    expect(result.current.filters).not.toBe(initial);
    expect(result.current.filters.sex).toEqual(["female"]);
    const changed = result.current.filters;

    act(() => {
      history.replaceState(null, "", "/?foto=2&spol=samec&starost=mlad");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.filters).not.toBe(changed);
    expect(result.current.filters.sex).toEqual(["male"]);

    act(() => result.current.toggle("age", "senior"));
    const query = new URLSearchParams(window.location.search);
    expect(query.get("foto")).toBe("2");
    expect(result.current.filters.age).toEqual(["mlad", "senior"]);
  });
});
