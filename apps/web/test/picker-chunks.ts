/**
 * The three chunks an open location picker fetches: the dialog, the country
 * plate and the postal catalogue (location-picker.tsx, picker-map-stage.tsx,
 * use-typed-location.ts).
 *
 * A suite that opens the picker imports this, so the chunks load while the
 * suite is collected, which has no time limit, rather than inside the first
 * test that opens the picker. Under the full suite that load took longer than
 * the one second a find waits for the dialog.
 *
 * Not a `.test.` file, so vitest does not collect it.
 */

import "@/components/filters/location-picker/view";
import "@/components/filters/location-picker/picker-map-plate";
import "@/lib/origin";
