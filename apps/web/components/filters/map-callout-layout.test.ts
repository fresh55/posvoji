import { describe, expect, it } from "vitest";
import { avoidCalloutOverlap, type CalloutRect } from "./map-callout-layout";

const bounds = { height: 210, margin: 2, gap: 8 };

function overlaps(a: CalloutRect, b: CalloutRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("simultaneous map labels", () => {
  it.each([
    { width: 108, height: 26 },
    { width: 176, height: 70 },
  ])("separates nearby shelters for a label size of %j", ({ width, height }) => {
    const earlier = { x: 25, y: 80, width, height };
    const next = avoidCalloutOverlap({ ...earlier, y: 72 }, [earlier], bounds);

    expect(overlaps(earlier, next)).toBe(false);
    expect(next.y).toBeGreaterThanOrEqual(bounds.margin);
    expect(next.y + next.height).toBeLessThanOrEqual(bounds.height - bounds.margin);
  });

  it("keeps a non-overlapping label beside its own marker", () => {
    const earlier = { x: 5, y: 50, width: 70, height: 30 };
    const preferred = { x: 150, y: 50, width: 70, height: 30 };
    expect(avoidCalloutOverlap(preferred, [earlier], bounds)).toEqual(preferred);
  });

  it("uses space below when the top of the plate is already occupied", () => {
    const earlier = { x: 25, y: 2, width: 176, height: 76 };
    const next = avoidCalloutOverlap({ ...earlier, y: 18 }, [earlier], bounds);
    expect(next.y).toBe(86);
    expect(overlaps(earlier, next)).toBe(false);
  });

  it("keeps the earlier candidate when upward and downward moves tie", () => {
    const preferred = { x: 25, y: 80, width: 108, height: 20 };
    expect(avoidCalloutOverlap(preferred, [preferred], bounds).y).toBe(52);
  });

  it("minimizes overlap inside a plate too short to separate both labels", () => {
    const preferred = { x: 25, y: 5, width: 108, height: 40 };
    const next = avoidCalloutOverlap(preferred, [preferred], { ...bounds, height: 50 });
    expect(next.y).toBe(2);
    expect(next.y + next.height).toBeLessThanOrEqual(48);
  });
});
