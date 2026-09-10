import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const decoder = require("../public/models/our-cat/meshopt-decoder.js");
const defaults = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

/** Remove only transforms equal to the node's rest value in EVERY clip.
 * Keeping varying targets in all clips preserves resets and crossfade weights.
 * The binary payload (geometry, textures and animation samples) is untouched.
 */
export async function optimizeCatAnimation(source) {
  if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) throw new Error("Expected GLB 2");
  const jsonLength = source.readUInt32LE(12);
  const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  const binary = source.subarray(28 + jsonLength);
  const views = new Map();
  await decoder.ready;
  const readView = (index) => {
    if (views.has(index)) return views.get(index);
    const view = document.bufferViews[index];
    const compressed = view.extensions?.EXT_meshopt_compression;
    let bytes;
    if (compressed) {
      if (compressed.buffer !== 0) throw new Error("Expected embedded compressed buffer");
      bytes = new Uint8Array(compressed.count * compressed.byteStride);
      decoder.decodeGltfBuffer(bytes, compressed.count, compressed.byteStride,
        binary.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength),
        compressed.mode, compressed.filter);
    } else {
      if (view.buffer !== 0) throw new Error("Expected embedded buffer");
      bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    }
    const result = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    views.set(index, result);
    return result;
  };
  const isRest = (channel, sampler) => {
    const node = document.nodes[channel.target.node];
    const fallback = defaults[channel.target.path];
    if (!fallback || node.matrix || ![undefined, "LINEAR", "STEP"].includes(sampler.interpolation)) return false;
    const rest = node[channel.target.path] ?? fallback;
    const accessor = document.accessors[sampler.output];
    if (accessor.sparse || accessor.normalized || accessor.componentType !== 5126 ||
      accessor.type !== `VEC${rest.length}` || !accessor.count) return false;
    const view = readView(accessor.bufferView);
    const stride = document.bufferViews[accessor.bufferView].byteStride ?? rest.length * 4;
    for (let i = 0; i < accessor.count; i++) for (let j = 0; j < rest.length; j++) {
      if (view.getFloat32((accessor.byteOffset ?? 0) + i * stride + j * 4, true) !== rest[j]) return false;
    }
    return true;
  };
  const key = (channel) => `${channel.target.node}:${channel.target.path}`;
  const varying = new Set();
  for (const animation of document.animations) for (const channel of animation.channels) {
    if (!isRest(channel, animation.samplers[channel.sampler])) varying.add(key(channel));
  }
  let removedChannels = 0, removedSamplers = 0;
  for (const animation of document.animations) {
    const kept = animation.channels.filter(channel => varying.has(key(channel)));
    // Keep a constant-only clip valid and preserve its authored duration.
    if (kept.length === 0) continue;
    const duration = (channels) => Math.max(...channels.map(channel => {
      const accessor = document.accessors[animation.samplers[channel.sampler].input];
      const view = readView(accessor.bufferView);
      const stride = document.bufferViews[accessor.bufferView].byteStride ?? 4;
      return view.getFloat32((accessor.byteOffset ?? 0) + (accessor.count - 1) * stride, true);
    }));
    if (duration(kept) !== duration(animation.channels)) throw new Error(`Would change ${animation.name} duration`);
    removedChannels += animation.channels.length - kept.length;
    const samplers = [], indices = new Map();
    for (const channel of kept) {
      const sampler = animation.samplers[channel.sampler];
      const signature = JSON.stringify(sampler);
      if (!indices.has(signature)) {
        indices.set(signature, samplers.length);
        samplers.push(sampler);
      }
      channel.sampler = indices.get(signature);
    }
    removedSamplers += animation.samplers.length - samplers.length;
    animation.channels = kept;
    animation.samplers = samplers;
  }
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const header = Buffer.from(source.subarray(0, 20));
  const tail = source.subarray(20 + jsonLength);
  header.writeUInt32LE(20 + padded.length + tail.length, 8);
  header.writeUInt32LE(padded.length, 12);
  return { bytes: Buffer.concat([header, padded, tail]), removedChannels, removedSamplers };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: node optimize-cat-animation.mjs path/to/cat.glb");
  const source = await readFile(path);
  const result = await optimizeCatAnimation(source);
  await writeFile(path, result.bytes);
  console.log(JSON.stringify({ before: source.length, after: result.bytes.length,
    removedChannels: result.removedChannels, removedSamplers: result.removedSamplers }));
}
