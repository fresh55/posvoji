import { describe, expect, it } from "vitest";
import {
  avoidCalloutOverlap,
  intersectionArea,
  placeCallout,
  type CalloutRect,
} from "./map-callout-layout";

describe("placeCallout", () => {
  const frame = { width: 320, height: 210, margin: 2 };
  const mark = { x: 160, y: 105, reach: 5 };
  const size = { width: 30, height: 20 };
  const place = (
    avoid: CalloutRect[] = [],
    at: { x: number; y: number; reach: number } = mark,
  ) => placeCallout(at, size, { gap: 3, inset: 5, frame, avoid });

  it("stands right of the mark, centred on it, when nothing is in the way", () => {
    expect(place()).toEqual({ x: 168, y: 95, width: 30, height: 20, side: "right", moved: 0 });
  });

  it("goes left when the right side runs off the frame", () => {
    const placed = place([], { x: 300, y: 105, reach: 5 });
    expect(placed.side).toBe("left");
    expect(placed.x + placed.width).toBe(300 - 5 - 3);
  });

  it("slides along the side to clear a neighbour level with the mark", () => {
    // One coin in the upper half of the right-hand spot, one filling the left.
    const placed = place([
      { x: 180, y: 90, width: 8, height: 8 },
      { x: 124, y: 80, width: 28, height: 50 },
    ]);
    expect(placed.side).toBe("right");
    // Slid down until the mark is `inset` under the card's top edge.
    expect(placed.y).toBe(105 - 5);
    expect(placed.moved).toBe(0);
  });

  it("goes over the mark when both sides are taken at every slide", () => {
    const placed = place([
      { x: 176, y: 80, width: 20, height: 50 },
      { x: 124, y: 80, width: 20, height: 50 },
    ]);
    expect(placed).toMatchObject({ side: "above", x: 145, y: 77 });
  });

  it("slides rather than being pushed when the mark is near the top edge", () => {
    const placed = place([], { x: 160, y: 8, reach: 5 });
    expect(placed).toMatchObject({ side: "right", y: 3, moved: 0 });
  });

  it("never covers its own mark, even where the frame pushes it", () => {
    const at = { x: 312, y: 202, reach: 5 };
    const placed = place([], at);
    const own = { x: at.x - at.reach, y: at.y - at.reach, width: 10, height: 10 };
    expect(intersectionArea(placed, own)).toBe(0);
    expect(placed.x).toBeGreaterThanOrEqual(frame.margin);
    expect(placed.y + placed.height).toBeLessThanOrEqual(frame.height - frame.margin);
  });
});

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
