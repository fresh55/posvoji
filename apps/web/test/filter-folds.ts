import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { resetFilterSectionsStore } from "@/components/filters/use-filter-sections";

/**
 * The seams every suite that renders a filter list needs.
 *
 * The sections fold, and all but Starost, and Velikost on Psi, start closed
 * (use-filter-sections.ts): the options a test is about are not in the
 * document until the section holding them is opened, and opening one runs a
 * reveal and a height measurement that jsdom has neither of.
 *
 * Not a `.test.` file, so vitest does not collect it.
 */

/**
 * The stored folds, dropped around every test, and the two DOM seams the fold
 * itself needs.
 *
 * The fold is stored per section and the store outlives a render, so a test
 * that opened a section would hand it to the next one. Three suites had each
 * copied this block out of filter-sections.test.tsx and the copies had already
 * drifted.
 *
 * Returns the scrollIntoView spy, because the suite that measures the reveal
 * asserts on it; it is cleared with the rest.
 */
export function installFilterFoldSeams(): ReturnType<typeof vi.fn> {
  // jsdom lays nothing out and ships no scrollIntoView, so the pull into view
  // an opened section runs from a timeout would throw after the test that
  // opened it. The fold also measures its own height, and motion restores the
  // scroll position around the measurement.
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.scrollTo = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    resetFilterSectionsStore();
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    resetFilterSectionsStore();
  });

  return scrollIntoView;
}

/**
 * Opens the section under this heading, and does nothing if it is already
 * open.
 *
 * Matched on the heading's own label rather than through getByRole, because
 * the trigger's accessible name takes in the summary chip a closed section
 * draws: a section with a choice in it answers to "Velikost Majhna +1". The
 * selector is the one the header's own arrow-key walk uses.
 */
export function openFilterSection(label: string): HTMLButtonElement {
  const trigger = sectionTriggers().find(
    (button) => labelOf(button) === label,
  );
  if (!trigger) throw new Error(`No filter section headed "${label}"`);
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
  return trigger;
}

/**
 * The same for every section on screen, for a harness that renders the whole
 * list and asserts on options across it.
 */
export function openAllFilterSections(): void {
  for (const trigger of sectionTriggers()) {
    if (trigger.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(trigger);
    }
  }
}

/** The heading of every section on screen, in the order they are drawn. */
export function sectionLabels(): (string | undefined)[] {
  return sectionTriggers().map(labelOf);
}

function labelOf(trigger: HTMLButtonElement): string | undefined {
  return trigger.firstElementChild?.textContent?.trim();
}

function sectionTriggers(): HTMLButtonElement[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>("h3 button[aria-expanded]"),
  ];
}
