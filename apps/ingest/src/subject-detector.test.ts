import { describe, expect, it, vi } from "vitest";
import {
  loadSubjectDetector,
  subjectFromDetections,
  type Detection,
} from "./subject-detector";

const cat = (score: number, box: Detection["box"]): Detection => ({
  classId: 17,
  score,
  box,
});

describe("subjectFromDetections", () => {
  it("turns the model's corner box into a left, top, width, height box", () => {
    // The model says ymin, xmin, ymax, xmax; a crop wants where the box
    // starts and how big it is.
    expect(subjectFromDetections([cat(0.97, [0.17, 0.27, 1, 0.66])])).toEqual({
      x: 0.27,
      y: 0.17,
      w: 0.39,
      h: 0.83,
    });
  });

  it("frames a litter as one box around all of them", () => {
    // Three kittens across a bench are three rows above the threshold, and a
    // crop centred on the surest one would cut the other two.
    expect(
      subjectFromDetections([
        cat(0.9, [0.2, 0.05, 0.8, 0.3]),
        cat(0.8, [0.25, 0.4, 0.75, 0.6]),
        cat(0.6, [0.2, 0.7, 0.8, 0.95]),
      ]),
    ).toEqual({ x: 0.05, y: 0.2, w: 0.9, h: 0.6 });
  });

  it("ignores a person holding the animal", () => {
    expect(
      subjectFromDetections([
        { classId: 1, score: 0.99, box: [0, 0, 1, 0.5] },
        cat(0.9, [0.3, 0.5, 0.9, 0.9]),
      ]),
    ).toEqual({ x: 0.5, y: 0.3, w: 0.4, h: 0.6 });
  });

  it("ignores a row the model is not sure of", () => {
    // Below the threshold a box is a guess, and a guessed box moves the crop
    // away from an animal that is in fact in the middle of the picture.
    expect(
      subjectFromDetections([
        cat(0.49, [0.6, 0.26, 0.86, 0.98]),
        cat(0.91, [0.08, 0.18, 0.9, 0.54]),
      ]),
    ).toEqual({ x: 0.18, y: 0.08, w: 0.36, h: 0.82 });
  });

  it("ignores a speck", () => {
    expect(
      subjectFromDetections([cat(0.7, [0.01, 0.01, 0.05, 0.05])]),
    ).toBeUndefined();
  });

  it("finds nothing in a photo of a room", () => {
    expect(
      subjectFromDetections([
        { classId: 62, score: 0.8, box: [0.1, 0.1, 0.9, 0.9] },
      ]),
    ).toBeUndefined();
    expect(subjectFromDetections([])).toBeUndefined();
  });

  it("clamps a box the model drew past the edge", () => {
    expect(subjectFromDetections([cat(0.9, [-0.02, 0.5, 1.03, 1.1])])).toEqual({
      x: 0.5,
      y: 0,
      w: 0.5,
      h: 1,
    });
  });
});

describe("loadSubjectDetector", () => {
  it("says where the model should be and stands down without it", async () => {
    const warn = vi.fn();
    const detector = await loadSubjectDetector({
      modelPath: "/nowhere/ssd_mobilenet_v1_12.onnx",
      warn,
    });
    expect(detector).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("pnpm models:fetch");
  });
});
