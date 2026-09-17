import { readFileSync } from "node:fs";
import { renderPhotoCard, renderTypographicCard } from "./share-cards";
import type { ShareCardRequest } from "./share-card-process";

// Private stdin/stdout protocol: no shell commands, network or artifact writes.
// The parent publishes the returned JPEG only after this process exits cleanly.
try {
  const job = JSON.parse(readFileSync(0, "utf8")) as ShareCardRequest;
  const jpeg = job.kind === "photo"
    ? await renderPhotoCard(readFileSync(job.source), job.text)
    : await renderTypographicCard(job.text, job.species);
  process.stdout.write(jpeg);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
