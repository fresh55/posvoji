// Fetches the subject detector model into data/models, where the export and
// the derive pass look for it. A one-off per checkout: the file is 29 MB of
// model zoo weights, not repository content, so it is gitignored and pinned
// here by URL and digest instead. Nothing else in the pipeline touches the
// network for it; a checkout without the file simply crops from the centre.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { subjectModelPath } from "./paths";
import { SUBJECT_MODEL_SHA256, SUBJECT_MODEL_URL } from "./subject-detector";
import { writeFileAtomic } from "./write-atomic";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

if (
  existsSync(subjectModelPath) &&
  sha256(readFileSync(subjectModelPath)) === SUBJECT_MODEL_SHA256
) {
  console.log(`model: ${subjectModelPath} is already the pinned build`);
} else {
  console.log(`model: fetching ${SUBJECT_MODEL_URL}`);
  const response = await fetch(SUBJECT_MODEL_URL);
  if (!response.ok) {
    throw new Error(`model: ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== SUBJECT_MODEL_SHA256) {
    throw new Error(
      `model: digest ${digest} is not the pinned ${SUBJECT_MODEL_SHA256}; ` +
        "nothing written",
    );
  }
  mkdirSync(dirname(subjectModelPath), { recursive: true });
  writeFileAtomic(subjectModelPath, Buffer.from(bytes));
  console.log(
    `model: wrote ${(bytes.length / 1024 / 1024).toFixed(1)} MB to ${subjectModelPath}`,
  );
}
