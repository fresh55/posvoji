import { useState, type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { LocationPicker } from "@/components/filters/location-picker";
import { resetNearbyOriginStore } from "@/hooks/use-nearby-origin";
import { toggleValues } from "@/lib/filters";

/**
 * The seams, the roster and the door every location-picker suite opens with.
 *
 * Not a `.test.` file, so vitest does not collect it, which is the whole
 * reason it exists: the picker's suites cannot import each other's helpers
 * without pulling the exporting file's describes into the importer's graph and
 * running them twice. Four suites carried their own copy of the stubs and
 * three of them the roster too, and the copies had drifted: only one waited
 * for the map chunk before handing the dialog back, and the two row readers
 * answered different questions under the same job. `test/pointer.ts` and
 * `test/location.ts` record what that costs.
 *
 * `.tsx` rather than the `.ts` of its siblings, because the harness below is a
 * component: the picker is controlled, and a suite that hands it a dead
 * `selected` is testing a picker no page renders.
 */

/**
 * The matchMedia jsdom does not ship, answering no to everything.
 *
 * The picker asks whether it is standing on a desktop to decide which body to
 * mount, and a suite that stubs nothing renders neither. No to everything is
 * the phone, which is where the sheet and its view switch live. A suite that
 * has to watch the answer change (the responsive session) brings its own live
 * one instead; this is for the three that only need the question answered.
 */
export function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

/**
 * jsdom has no layout, so it has no scrollIntoView.
 *
 * The picker brings the picked row and the card it just opened into view;
 * neither is worth a layout engine to assert, but both throw without this.
 */
export function stubScrollIntoView() {
  Element.prototype.scrollIntoView = vi.fn();
}

/**
 * Unmounts the tree and empties the page session. Belongs in every picker
 * suite's afterEach.
 *
 * The query, the chosen place and the geolocation state are one session shared
 * by every mounted picker, so a test that leaves one behind hands it to the
 * next. resetNearbyOriginStore clears the nearby store as its first act
 * (hooks/use-nearby-origin.ts), so one call empties both.
 */
export function resetPickerSession() {
  cleanup();
  resetNearbyOriginStore();
}

// Alphabetical order puts Sever first, and Sever is the far one from
// Ljubljana, so a nearest-first sort has to visibly move it.
export const options = [
  { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

export const counts = new Map([
  ["sever", 4],
  ["jug", 7],
]);

// Registry shelters with nothing to filter by. Celje places on the map, so
// they also become the faint markers the legend explains.
export const offSite = [
  { value: "vzhod", label: "Zavetišče Vzhod", city: "Celje" },
];

// Stateful because the picker is controlled: the pick card folds once nothing
// it stands for is selected, so toggles have to land in the next render's
// `selected` the way animal-grid's real handlers land them.
function Harness({
  selected: initialSelected = [],
  ...props
}: Partial<ComponentProps<typeof LocationPicker>>) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const toggleMany = (values: string[]) =>
    setSelected((current) => toggleValues(current, values));
  return (
    <I18nProvider locale="sl">
      <LocationPicker
        options={options}
        counts={counts}
        selected={selected}
        onToggle={(value) => toggleMany([value])}
        onToggleMany={toggleMany}
        resultCount={11}
        {...props}
      />
    </I18nProvider>
  );
}

/** The open dialog, or a failure naming it. */
export const dialog = () => screen.getByRole("dialog");

/**
 * Presses the trigger and waits until the whole picker is on screen.
 *
 * The plate is a dynamic import, so the dialog lands a tick before the country
 * does. Waiting for the attribution rather than the dialog alone is what keeps
 * a test that reads a marker or a region from racing the chunk.
 */
export async function reopenPicker() {
  fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog");
  await waitFor(() =>
    expect(dialog().querySelector("[data-slot='map-attribution']")).toBeTruthy(),
  );
}

/** Renders the harness, opens the picker, and hands back the search field. */
export async function openPicker(
  props: Partial<ComponentProps<typeof LocationPicker>> = {},
) {
  render(<Harness {...props} />);
  await reopenPicker();
  return screen.getByLabelText("Kraj, pošta ali zavetišče");
}

/** Types into the search field the way a change event delivers it. */
export async function type(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
    await import("@/lib/origin");
  });
}

/**
 * The mounted shelter rows, in the order the list draws them.
 *
 * Read off `data-shelter-row`, which shelter-rows.tsx puts on the toggle row
 * alone: the off-site rows are links and carry none, and neither do the
 * selection chips, which repeat the same names outside the list. Reading the
 * attribute rather than matching the row's text keeps this honest for a suite
 * that brings its own roster.
 */
export function rowOrder(): string[] {
  return Array.from(
    dialog().querySelectorAll<HTMLElement>("[data-shelter-row]"),
  ).map((row) => row.getAttribute("data-shelter-row") ?? "");
}

/** Confirms the place the search found, which is what sorts by distance. */
export function choosePlace() {
  fireEvent.click(screen.getByRole("button", { name: /^V bližini / }));
}
