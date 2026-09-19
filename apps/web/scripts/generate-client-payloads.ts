import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { loadDataset } from "../lib/dataset";
import { buildMunicipalityEntries } from "../lib/municipality-coverage";
import { clientPayload, galleryPayload } from "../lib/client-payload";

const root = new URL("../public/", import.meta.url);
mkdirSync(new URL("generated/", root), { recursive: true });
const animals = loadDataset()?.animals ?? [];
const payloads: ReturnType<typeof clientPayload>[] = animals
  .map(galleryPayload)
  .filter((payload) => payload.count > 1);
for (const locale of ["sl", "en"] as const) {
  payloads.push(
    clientPayload("municipalities", buildMunicipalityEntries(locale, animals)),
  );
}
for (const { url, json } of payloads) {
  writeFileSync(new URL(url.slice(1), root), json);
}
// Remove only files owned by this generator. An animal removed from the
// dataset must not leave its old photo manifest in the next publication.
const retained = new Set(
  payloads.map(({ url }) => url.slice("/generated/".length)),
);
const generated = new URL("generated/", root);
for (const name of readdirSync(generated)) {
  if (
    /^(photos|municipalities)-[a-f0-9]{24}\.json$/.test(name) &&
    !retained.has(name)
  ) {
    unlinkSync(new URL(name, generated));
  }
}
console.log(`client-payloads: ${payloads.length} files`);
