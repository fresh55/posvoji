// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QrCode, qrSymbol } from "./qr-code";

afterEach(cleanup);

const URL = "https://posvoji.si/zival/nina-1a2b3c/horjul/horjul";

// Nothing here decodes a QR code, which would be testing uqr rather than this
// file. What is worth holding still is that the symbol does not move between
// builds, that it carries its quiet zone, and that it is the size a symbol
// for a URL this length has to be.
describe("qrSymbol", () => {
  it("gives the same symbol for the same value", () => {
    expect(qrSymbol(URL)).toEqual(qrSymbol(URL));
  });

  it("gives a different symbol for a different animal", () => {
    const other = "https://posvoji.si/zival/mamba-4d5e6f/moravske-toplice/mala-hisa";
    expect(qrSymbol(other).path).not.toBe(qrSymbol(URL).path);
  });

  it("is sized for the value it carries, quiet zone included", () => {
    const { size } = qrSymbol(URL);
    // Version 1 through 40 is 21 to 177 modules, and the quiet zone adds four
    // on each side. A 50-character URL at error correction M lands in the low
    // versions: anything much outside this range means the encoder was handed
    // something other than the address.
    expect(size).toBeGreaterThanOrEqual(21 + 8);
    expect(size).toBeLessThanOrEqual(45 + 8);
    // Every version is 21 + 4n modules.
    expect((size - 8 - 21) % 4).toBe(0);

    // A longer value needs at least as many modules as a shorter one.
    expect(qrSymbol(`${URL}/plakat/and/then/some/more/path`).size).toBeGreaterThan(
      size,
    );
  });

  it("leaves the quiet zone empty on every side", () => {
    const { size, path } = qrSymbol(URL);
    // Subpaths are "M{x} {y}h{run}...". Nothing may start in the first four
    // columns or rows, and no run may reach the last four columns.
    const runs = [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      run: Number(match[3]),
    }));
    expect(runs.length).toBeGreaterThan(0);
    for (const { x, y, run } of runs) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(y).toBeLessThan(size - 4);
      expect(x + run).toBeLessThanOrEqual(size - 4);
    }
  });
});

describe("QrCode", () => {
  it("draws one path in a square viewBox of module units", () => {
    const { container } = render(<QrCode value={URL} label="QR" />);
    const svg = container.querySelector("svg");
    const { size, path } = qrSymbol(URL);

    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${size} ${size}`);
    expect(svg?.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(svg?.getAttribute("aria-label")).toBe("QR");
    expect(container.querySelector("path")?.getAttribute("d")).toBe(path);
  });

  it("renders the same markup twice for the same value", () => {
    const first = render(<QrCode value={URL} label="QR" />).container.innerHTML;
    cleanup();
    const second = render(<QrCode value={URL} label="QR" />).container.innerHTML;
    expect(first).toBe(second);
  });
});
