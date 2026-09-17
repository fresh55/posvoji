import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { packCatAsset } from "./cat-asset.mjs";

const require = createRequire(import.meta.url);
const decoder = require("../public/models/our-cat/meshopt-decoder.js");

/** Textures larger than the 448 x 496 stage needs, at device pixel ratio 2. */
const textures = {
  "coat-likeness-15": { size: 1024, quality: 90 },
  "cat-occlusion-v10": { size: 512, quality: 85 },
  "cat-eye": { size: 512, quality: 85 },
};
const texcoordBits = 12, normalBits = 8, rotationBits = 16, sampleBits = 16;

const align = (value) => Math.ceil(value / 4) * 4;
const round = (value, step, low, high) => Math.min(high, Math.max(low, Math.round(value / step) * step));

/** Re-encode the cat's largest buffer views and textures for the wire.
 * Geometry, rig, clip structure, materials, names and extras are preserved;
 * only the numeric precision of three attributes, the varying animation
 * samples and three texture resolutions change.
 *
 * Positions keep every bit they had. Quantising them to 14 bits saved another
 * 19,293 bytes gzipped, but it moves boundary vertices enough to reshuffle the
 * picking simplifier, and the proxy's agreement with the full mesh fell from
 * above 98% to 97.9%.
 */
export async function optimizeCatWebAsset(source) {
  if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) throw new Error("Expected GLB 2");
  const jsonLength = source.readUInt32LE(12);
  const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  const binary = source.subarray(28 + jsonLength);
  await decoder.ready;
  await MeshoptEncoder.ready;

  const compressionOf = (index) => document.bufferViews[index].extensions?.EXT_meshopt_compression;
  // An octahedral normal view means this export already ran.
  if (document.bufferViews.some((_, index) => compressionOf(index)?.filter === "OCTAHEDRAL")) return null;
  const decode = (index) => {
    const compressed = compressionOf(index);
    if (compressed.buffer !== 0) throw new Error("Expected embedded compressed buffer");
    const bytes = new Uint8Array(compressed.count * compressed.byteStride);
    decoder.decodeGltfBuffer(bytes, compressed.count, compressed.byteStride,
      binary.subarray(compressed.byteOffset, compressed.byteOffset + compressed.byteLength),
      compressed.mode, compressed.filter);
    return bytes;
  };
  const accessorsOf = (index) => document.accessors.filter(accessor => accessor.bufferView === index);

  // Which views hold what. Attribute views are per semantic; the two large
  // animation views hold every varying sampler of their kind.
  const semantics = new Map();
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    for (const [semantic, index] of Object.entries(primitive.attributes)) {
      const view = document.accessors[index].bufferView;
      const previous = semantics.get(view);
      if (previous && previous !== semantic) throw new Error(`View ${view} mixes ${previous} and ${semantic}`);
      semantics.set(view, semantic);
    }
  }
  const paths = new Map();
  for (const animation of document.animations) for (const channel of animation.channels) {
    const view = document.accessors[animation.samplers[channel.sampler].output].bufferView;
    if (!paths.has(view)) paths.set(view, new Set());
    paths.get(view).add(channel.target.path);
  }

  const plan = new Map();
  for (const [index, view] of document.bufferViews.entries()) {
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (!compressed || compressed.mode !== "ATTRIBUTES") continue;
    const semantic = semantics.get(index), path = paths.get(index);
    // One accessor covers a whole attribute view; a sample view holds many.
    const whole = (componentType) => accessorsOf(index).length === 1 && accessorsOf(index)
      .every(accessor => accessor.componentType === componentType && !(accessor.byteOffset ?? 0)
        && accessor.count === compressed.count);
    const shared = (componentType, byteStride) => accessorsOf(index)
      .every(accessor => accessor.componentType === componentType && (accessor.byteOffset ?? 0) % byteStride === 0);
    if (semantic === "NORMAL" && compressed.byteStride === 8 && whole(5122)) plan.set(index, "normal");
    else if (semantic === "TEXCOORD_0" && compressed.byteStride === 4 && whole(5123)) plan.set(index, "texcoord");
    else if (semantic === "WEIGHTS_0" && compressed.byteStride === 8 && whole(5123)) plan.set(index, "weights");
    else if (!semantic && path?.size === 1 && path.has("rotation") && compressed.byteStride === 16 && shared(5126, 16)) plan.set(index, "rotation");
    else if (!semantic && path && ![...path].some(one => one !== "translation" && one !== "scale")
      && compressed.byteStride === 12 && shared(5126, 12)) plan.set(index, "sample");
  }
  if (plan.size === 0) return null;

  // New payloads per view: the meshopt stream, the decoded stride and count.
  const streams = new Map();
  const encode = (bytes, count, stride, filter) => ({
    stream: Buffer.from(MeshoptEncoder.encodeVertexBuffer(bytes, count, stride)), count, stride, filter,
  });
  for (const [index, kind] of plan) {
    const compressed = compressionOf(index), { count } = compressed;
    const bytes = decode(index);
    if (kind === "texcoord") {
      const values = new Uint16Array(bytes.buffer, bytes.byteOffset, count * 2);
      const step = 1 << (16 - texcoordBits);
      for (let i = 0; i < values.length; i++) values[i] = round(values[i], step, 0, 65536 - step);
      streams.set(index, encode(bytes, count, 4));
    } else if (kind === "normal") {
      const values = new Int16Array(bytes.buffer, bytes.byteOffset, count * 4);
      const normals = new Float32Array(count * 4);
      for (let vertex = 0; vertex < count; vertex++) for (let axis = 0; axis < 3; axis++) {
        normals[vertex * 4 + axis] = Math.max(-1, values[vertex * 4 + axis] / 32767);
      }
      const filtered = MeshoptEncoder.encodeFilterOct(normals, count, 4, normalBits);
      streams.set(index, encode(filtered, count, 4, "OCTAHEDRAL"));
    } else if (kind === "weights") {
      // Four bytes per vertex that still sum to exactly one.
      const values = new Uint16Array(bytes.buffer, bytes.byteOffset, count * 4);
      const packed = new Uint8Array(count * 4);
      for (let vertex = 0; vertex < count; vertex++) {
        const slice = Array.from(values.subarray(vertex * 4, vertex * 4 + 4));
        const total = slice.reduce((sum, weight) => sum + weight, 0);
        if (total === 0) continue;
        const scaled = slice.map(weight => weight / total * 255);
        const floors = scaled.map(Math.floor);
        let remainder = 255 - floors.reduce((sum, weight) => sum + weight, 0);
        const order = scaled.map((weight, i) => i).sort((a, b) => (scaled[b] - floors[b]) - (scaled[a] - floors[a]));
        for (const i of order) if (remainder > 0 && floors[i] < 255) { floors[i]++; remainder--; }
        packed.set(floors, vertex * 4);
      }
      streams.set(index, encode(packed, count, 4));
    } else if (kind === "rotation") {
      const values = new Float32Array(bytes.buffer, bytes.byteOffset, count * 4);
      const filtered = MeshoptEncoder.encodeFilterQuat(values, count, 8, rotationBits);
      streams.set(index, encode(filtered, count, 8, "QUATERNION"));
    } else {
      const values = new Float32Array(bytes.buffer, bytes.byteOffset, count * 3);
      const filtered = MeshoptEncoder.encodeFilterExp(values, count, 12, sampleBits, "SharedVector");
      streams.set(index, encode(filtered, count, 12, "EXPONENTIAL"));
    }
  }

  // Textures are re-encoded at the resolution the stage can actually show.
  const images = new Map();
  for (const image of document.images) {
    const wanted = textures[image.name];
    if (!wanted || image.bufferView === undefined) continue;
    const view = document.bufferViews[image.bufferView];
    const original = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const bytes = await sharp(original).resize(wanted.size, wanted.size)
      .webp({ quality: wanted.quality, effort: 6 }).toBuffer();
    images.set(image.bufferView, bytes);
  }

  // Rewrite the views and the accessors that read them, then repack both
  // buffers in their original order: buffer 0 carries the art and the
  // meshopt streams, buffer 1 is the extension's uncompressed fallback.
  for (const [index, stream] of streams) {
    const view = document.bufferViews[index], compressed = view.extensions.EXT_meshopt_compression;
    const previous = compressed.byteStride;
    compressed.byteStride = stream.stride;
    compressed.byteLength = stream.stream.length;
    if (stream.filter) compressed.filter = stream.filter;
    view.byteLength = stream.count * stream.stride;
    if (view.byteStride !== undefined) view.byteStride = stream.stride;
    for (const accessor of accessorsOf(index)) {
      accessor.byteOffset = (accessor.byteOffset ?? 0) / previous * stream.stride;
      if (plan.get(index) === "normal") { accessor.componentType = 5120; accessor.normalized = true; }
      if (plan.get(index) === "weights") { accessor.componentType = 5121; accessor.normalized = true; }
      if (plan.get(index) === "rotation") { accessor.componentType = 5122; accessor.normalized = true; }
    }
  }
  for (const [index, bytes] of images) document.bufferViews[index].byteLength = bytes.length;

  const payload = (index) => {
    const compressed = compressionOf(index);
    if (compressed) return streams.get(index)?.stream
      ?? binary.subarray(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
    const view = document.bufferViews[index];
    return images.get(index) ?? binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  };
  const order = (indices, offsetOf) => [...indices].sort((a, b) => offsetOf(a) - offsetOf(b));
  const all = document.bufferViews.map((_, index) => index);
  // Read every payload before any offset moves.
  const stored = new Map(all.map(index => [index, payload(index)]));
  const parts = [];
  let end = 0;
  for (const index of order(all, index => compressionOf(index)?.byteOffset ?? document.bufferViews[index].byteOffset ?? 0)) {
    const bytes = stored.get(index), compressed = compressionOf(index);
    parts.push(Buffer.alloc(align(end) - end), bytes);
    end = align(end);
    if (compressed) compressed.byteOffset = end;
    else document.bufferViews[index].byteOffset = end;
    end += bytes.length;
  }
  parts.push(Buffer.alloc(align(end) - end));
  const packed = Buffer.concat(parts);
  // The fallback buffer is never stored: it only reserves the decoded sizes.
  const fallbacks = all.filter(index => compressionOf(index));
  let reserved = 0;
  for (const index of order(fallbacks, index => document.bufferViews[index].byteOffset ?? 0)) {
    const view = document.bufferViews[index], compressed = compressionOf(index);
    view.byteOffset = align(reserved);
    view.byteLength = compressed.count * compressed.byteStride;
    reserved = view.byteOffset + view.byteLength;
  }
  document.buffers[0].byteLength = packed.length;
  document.buffers[1].byteLength = align(reserved);

  return { bytes: packCatAsset(document, packed), views: plan.size, images: images.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? fileURLToPath(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  const source = await readFile(path);
  const result = await optimizeCatWebAsset(source);
  if (!result) {
    console.log(JSON.stringify({ size: source.length, changed: false }));
  } else {
    await writeFile(path, result.bytes);
    console.log(JSON.stringify({ before: source.length, after: result.bytes.length,
      views: result.views, images: result.images }));
  }
}
