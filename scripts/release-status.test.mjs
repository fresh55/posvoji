import assert from "node:assert/strict";
import { assertFresh, assertNotSuperseded, validateStatus } from "./release-status.mjs";

const sample = {
  version: 1, releaseId: "abc-20260905T060000Z", generationId: "a".repeat(64),
  indexSha256: "e".repeat(64),
  codeSha: "b".repeat(40), datasetGeneratedAt: "2026-09-05T06:00:00Z",
  inputRevision: { authority: "c".repeat(64), sequence: 3 },
  providers: [{ providerId: "shelter", checkedAt: "2026-09-05T05:55:00Z" }],
};
assertNotSuperseded(sample, { ...sample, inputRevision: { ...sample.inputRevision, sequence: 4 } });
assertNotSuperseded(sample, sample);
assert.throws(() => assertNotSuperseded(sample, { ...sample, generationId: "f".repeat(64) }), /same input revision/);
assert.throws(() => assertNotSuperseded(sample, { ...sample, inputRevision: { ...sample.inputRevision, sequence: 4 }, providers: [{ providerId: "shelter", checkedAt: "2026-09-04T00:00:00Z" }] }), /regresses/);
assert.throws(() => assertNotSuperseded(sample, { ...sample, inputRevision: { ...sample.inputRevision, sequence: 2 } }), /older/);
assert.throws(() => assertNotSuperseded(sample, { ...sample, inputRevision: undefined }), /authority/);
assert.throws(() => assertNotSuperseded(sample, { ...sample, inputRevision: { authority: "d".repeat(64), sequence: 50 } }), /authority/);
assert.throws(() => assertNotSuperseded(sample, { ...sample, datasetGeneratedAt: "2026-09-04T00:00:00Z" }), /predates/);
assertFresh(sample, Date.parse("2026-09-05T18:00:00Z"));
assert.throws(() => assertFresh({ ...sample, datasetGeneratedAt: "2026-09-07T06:00:00Z" }, Date.parse("2026-09-07T06:01:00Z")), /shelter/);
assert.throws(() => assertFresh({ ...sample, providers: [{ providerId: "empty-shelter", checkedAt: null }] }), /empty-shelter/);
assert.throws(() => validateStatus({ ...sample, generationId: "not-a-hash" }), /invalid/);
console.log("release-status: OK");
