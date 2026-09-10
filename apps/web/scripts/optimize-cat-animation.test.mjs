import { describe, expect, it } from "vitest";
import { optimizeCatAnimation } from "./optimize-cat-animation.mjs";

function fixture({ vary = false, longRest = false, duplicate = false } = {}) {
  const values = new Float32Array([0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 1, 1, 0, 2]);
  const document = {
    asset: { version: "2.0" }, nodes: [{}, {}], buffers: [{ byteLength: values.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: values.byteLength }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 0, byteOffset: 8, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 0, byteOffset: 32, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 0, byteOffset: 56, componentType: 5126, count: 2, type: "SCALAR" },
    ],
    animations: [0, 1].map(index => ({ name: `clip ${index}`,
      samplers: [
        { input: longRest ? 3 : 0, output: vary && index === 1 ? 2 : 1 },
        { input: 0, output: 2 },
        { input: 0, output: duplicate ? 2 : 1 }, // duplicate or unreferenced exporter residue
      ],
      channels: [
        { sampler: 0, target: { node: 0, path: "translation" } },
        { sampler: 1, target: { node: 0, path: "scale" } },
        ...(duplicate ? [{ sampler: 2, target: { node: 1, path: "scale" } }] : []),
      ],
    })),
  };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + values.byteLength, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(values.byteLength, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, Buffer.from(values.buffer)]);
}
const jsonOf = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const tailOf = bytes => bytes.subarray(20 + bytes.readUInt32LE(12));

describe("lossless cat animation cleanup", () => {
  it("removes globally redundant rest tracks and unused samplers, preserving binary samples", async () => {
    const original = fixture();
    const result = await optimizeCatAnimation(original);
    expect(result.removedChannels).toBe(2);
    expect(result.removedSamplers).toBe(4);
    expect(tailOf(result.bytes)).toEqual(tailOf(original));
    for (const animation of jsonOf(result.bytes).animations) {
      expect(animation.channels).toEqual([{ sampler: 0, target: { node: 0, path: "scale" } }]);
      expect(animation.samplers).toEqual([{ input: 0, output: 2 }]);
    }
    expect((await optimizeCatAnimation(result.bytes)).bytes).toEqual(result.bytes);
  });

  it("keeps rest tracks needed to reset a transform changed by another clip", async () => {
    const result = await optimizeCatAnimation(fixture({ vary: true }));
    expect(result.removedChannels).toBe(0);
    expect(result.removedSamplers).toBe(3);
    expect(jsonOf(result.bytes).animations[0].channels).toHaveLength(2);
  });

  it("shares identical samplers without merging their independently targeted channels", async () => {
    const result = await optimizeCatAnimation(fixture({ duplicate: true }));
    for (const animation of jsonOf(result.bytes).animations) {
      expect(animation.channels).toHaveLength(2);
      expect(animation.channels.map(channel => channel.sampler)).toEqual([0, 0]);
      expect(animation.samplers).toEqual([{ input: 0, output: 2 }]);
    }
  });

  it("rejects a cleanup that would shorten an authored clip", async () => {
    await expect(optimizeCatAnimation(fixture({ longRest: true }))).rejects.toThrow("duration");
  });
});
