// Where the animal is in a cached photo, so a surface that crops the picture
// can keep the animal in its frame instead of the middle of the file.
//
// The card draws a square out of every photo, and 265 of the 484 lead photos
// are wider than 4:3: centred, the square throws away a third of their width,
// and with it a tail, or the whole cat sitting at one end of the bench. A
// sharpness score cannot say where the animal is (the hero-photo branch
// measured that and was dropped); a COCO detector can, and a MobileNet SSD
// does it in about twenty milliseconds on a CPU.
//
// The model is SSD MobileNet v1 from the ONNX model zoo (Apache-2.0), 29 MB,
// fetched into data/models by `pnpm models:fetch` and never committed. Its
// graph takes a uint8 RGB image of any size, resizes to 300x300 itself and
// runs its own non-maximum suppression, so this file does no preprocessing
// beyond a decode and no postprocessing beyond picking the animal boxes.
//
// No model, or no runtime: the pass is skipped with one warning, the manifest
// entries keep no version, and the next run that has both fills them in. A
// photo without a box crops from its centre, as every photo did before.
import { existsSync } from "node:fs";
import sharp from "sharp";
import { subjectModelPath } from "./paths";

// Which reading of the picture cut the boxes below. Bump it when the model,
// the classes or the thresholds change, and every cached copy is read again
// on the next run without a single request to a shelter.
export const SUBJECT_VERSION = 1;

export const SUBJECT_MODEL_URL =
  "https://github.com/onnx/models/raw/main/validated/vision/object_detection_segmentation/ssd-mobilenetv1/model/ssd_mobilenet_v1_12.onnx";
export const SUBJECT_MODEL_SHA256 =
  "b8fba5e404077d4048d27fcd1667e85e27e192eb9bf51e696c46a3acd7d21058";

/** The animal's place in the picture, as fractions of the cached copy's
 *  width and height: left edge, top edge, width, height. */
export interface SubjectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SubjectDetector {
  /** The box around every animal in the file, or nothing when there is none
   *  the model is sure of. Throws when the file cannot be read or run. */
  detect(masterPath: string): Promise<SubjectBox | undefined>;
}

/** One row of the model's output, in its own terms. */
export interface Detection {
  /** COCO class under the TensorFlow object-detection label map. */
  classId: number;
  score: number;
  /** ymin, xmin, ymax, xmax, each a fraction of the image. */
  box: readonly [number, number, number, number];
}

// The classes that are an animal under that label map: 16 bird through 25
// giraffe. A rabbit is not a COCO class and comes back as a cat or a sheep
// when it comes back at all, which is the right box either way. A person
// holding the animal is not the subject, so 1 stays out.
const ANIMAL_CLASSES = new Set([16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);

// Below this the model is guessing, and a guessed box would move a crop
// away from an animal that is in fact in the middle. The rows above it are
// all taken: a litter is three boxes, and the frame has to hold all of them.
const MIN_SCORE = 0.5;

// A box under this share of the picture is a cat's ear in the corner of a
// photo of a room, not the subject.
const MIN_AREA = 0.01;

// The model resizes to 300x300 itself, so a decode at 480 wide is already
// more than it looks at. Never enlarged: the smallest cached copy is the
// largest a shelter published.
const DETECT_WIDTH = 480;

/** The one box a crop should keep in its frame: the union of every animal
 *  the model is sure of, rounded to a hundredth so it serializes short. */
export function subjectFromDetections(
  detections: readonly Detection[],
): SubjectBox | undefined {
  let top = 1;
  let left = 1;
  let bottom = 0;
  let right = 0;
  let found = false;
  for (const { classId, score, box } of detections) {
    if (!ANIMAL_CLASSES.has(classId) || score < MIN_SCORE) continue;
    const [ymin, xmin, ymax, xmax] = box.map((v) => Math.min(1, Math.max(0, v)));
    if ((ymax! - ymin!) * (xmax! - xmin!) < MIN_AREA) continue;
    top = Math.min(top, ymin!);
    left = Math.min(left, xmin!);
    bottom = Math.max(bottom, ymax!);
    right = Math.max(right, xmax!);
    found = true;
  }
  if (!found) return undefined;
  const round = (v: number) => Math.round(v * 100) / 100;
  const x = round(left);
  const y = round(top);
  const w = round(right - left);
  const h = round(bottom - top);
  if (w <= 0 || h <= 0) return undefined;
  return { x, y, w, h };
}

export interface LoadSubjectDetectorOptions {
  modelPath?: string;
  warn?: (message: string) => void;
}

/** The detector, or nothing with one line saying why. Loading the runtime
 *  is behind a dynamic import so a host without the native module (or a
 *  test) never pays for it, and never fails on it either. */
export async function loadSubjectDetector(
  options: LoadSubjectDetectorOptions = {},
): Promise<SubjectDetector | undefined> {
  const modelPath = options.modelPath ?? subjectModelPath;
  const warn = options.warn ?? console.warn;
  if (!existsSync(modelPath)) {
    warn(
      `subjects: no detector model at ${modelPath}; run \`pnpm models:fetch\` ` +
        "to fill the subject boxes. Photos crop from the centre until then.",
    );
    return undefined;
  }
  let ort: typeof import("onnxruntime-node");
  try {
    ort = await import("onnxruntime-node");
  } catch (error) {
    warn(`subjects: onnxruntime-node did not load (${error}); skipping the pass`);
    return undefined;
  }
  // Errors only: the runtime warns about the model zoo graph's unused
  // initializers on every load, which is its business and not a maintainer's.
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"],
    logSeverityLevel: 3,
  });
  const inputName = session.inputNames[0];
  const outputName = (part: string) =>
    session.outputNames.find((name) => name.includes(part));
  const boxesName = outputName("boxes");
  const classesName = outputName("classes");
  const scoresName = outputName("scores");
  const countName = outputName("num");
  if (!inputName || !boxesName || !classesName || !scoresName || !countName) {
    warn(
      `subjects: ${modelPath} is not the SSD model this expects ` +
        `(inputs ${session.inputNames}, outputs ${session.outputNames}); skipping the pass`,
    );
    return undefined;
  }

  return {
    async detect(masterPath) {
      const { data, info } = await sharp(masterPath)
        .resize({ width: DETECT_WIDTH, withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const tensor = new ort.Tensor(
        "uint8",
        new Uint8Array(data.buffer, data.byteOffset, data.length),
        [1, info.height, info.width, info.channels],
      );
      const output = await session.run({ [inputName]: tensor });
      const boxes = output[boxesName]!.data as Float32Array;
      const classes = output[classesName]!.data as Float32Array;
      const scores = output[scoresName]!.data as Float32Array;
      const count = Number(output[countName]!.data[0]);
      const detections: Detection[] = [];
      for (let i = 0; i < count; i++) {
        detections.push({
          classId: classes[i]!,
          score: scores[i]!,
          box: [boxes[i * 4]!, boxes[i * 4 + 1]!, boxes[i * 4 + 2]!, boxes[i * 4 + 3]!],
        });
      }
      return subjectFromDetections(detections);
    },
  };
}
