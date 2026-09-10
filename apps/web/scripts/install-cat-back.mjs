import { writeFile } from "node:fs/promises";
import { loadCatAsset, packCatAsset } from "./cat-asset.mjs";

// Install only Blender's edited channels. Keep the compressed geometry,
// textures, rig, and all other animations byte-for-byte intact.
const source = process.argv[2];
if (!source) throw new Error("Usage: node install-cat-back.mjs path/to/animations.glb [clip names...]");
const target = new URL("../public/models/our-cat/cat.glb", import.meta.url);
const current = await loadCatAsset(target), authored = await loadCatAsset(source);
const document = current.document;
let binary = current.binary;
const cache = new Map();
const append = (values, type) => {
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  const key = `${type}:${bytes.toString("base64")}`;
  if (cache.has(key)) return cache.get(key);
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: binary.length, byteLength: bytes.length });
  binary = Buffer.concat([binary, bytes]);
  const index = document.accessors.length;
  document.accessors.push({ bufferView, componentType: 5126, type,
    count: values.length / ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[type]),
    ...(type === "SCALAR" ? { min: [values[0]], max: [values.at(-1)] } : {}) });
  cache.set(key, index);
  return index;
};
const suffix = { translation: "position", rotation: "quaternion", scale: "scale" };
const report = [];
for (const name of process.argv.length > 3 ? process.argv.slice(3) : ["Back pet", "Back warning"]) {
  const existing = document.animations.find(clip => clip.name === name);
  const reference = existing ? name : "Head pet";
  const oldClip = current.gltf.animations.find(clip => clip.name === reference);
  const newClip = authored.gltf.animations.find(clip => clip.name === name);
  if (!oldClip || !newClip || (existing && oldClip.duration !== newClip.duration)) throw new Error(`Clip mismatch: ${name}`);
  const animation = existing ?? structuredClone(document.animations.find(clip => clip.name === reference));
  if (!existing) { animation.name = name; document.animations.push(animation); }
  const samplers = [], channels = [];
  let editedTracks = 0;
  for (const channel of animation.channels) {
    const trackName = `${document.nodes[channel.target.node].name}.${suffix[channel.target.path]}`;
    const oldTrack = oldClip.tracks.find(track => track.name === trackName);
    const newTrack = newClip.tracks.find(track => track.name === trackName)?.clone();
    if (!oldTrack || !newTrack) throw new Error(`Missing track: ${trackName}`);
    const size = newTrack.getValueSize();
    // Refuse a different rig/rest pose and force exact shared endpoints so
    // consecutive taps and idle crossfades do not introduce a pose jump.
    for (let i = 0; i < size; i++) {
      if (Math.abs(oldTrack.values[i] - newTrack.values[i]) > 1e-5 ||
          Math.abs(oldTrack.values[i] - newTrack.values[newTrack.values.length - size + i]) > 1e-5) {
        throw new Error(`Rest pose mismatch: ${trackName}`);
      }
      newTrack.values[i] = newTrack.values[newTrack.values.length - size + i] = oldTrack.values[i];
    }
    const interpolant = oldTrack.createInterpolant(), incoming = newTrack.createInterpolant();
    // Include the outgoing sample times: a new constant track has only two
    // endpoint keys and must still replace an old moving tail or shoulder.
    const unchanged = existing && [...oldTrack.times, ...newTrack.times].every(time => {
      const previous = interpolant.evaluate(time), next = incoming.evaluate(time);
      return previous.every((value, i) => Math.abs(value - next[i]) < 1e-5);
    });
    let sampler = animation.samplers[channel.sampler];
    if (!unchanged) {
      // Drop numerical noise in static samples before Three removes repeats.
      for (let frame = 1; frame < newTrack.times.length; frame++) {
        const start = frame * size;
        if (newTrack.values.slice(start, start + size).every((value, i) => Math.abs(value - newTrack.values[start - size + i]) < 1e-6)) {
          newTrack.values.set(newTrack.values.slice(start - size, start), start);
        }
      }
      newTrack.optimize();
      sampler = { input: append(newTrack.times, "SCALAR"),
        output: append(newTrack.values, size === 4 ? "VEC4" : "VEC3"), interpolation: "LINEAR" };
      editedTracks++;
    }
    channels.push({ ...channel, sampler: samplers.length });
    samplers.push(sampler);
  }
  animation.channels = channels;
  animation.samplers = samplers;
  report.push({ name, duration: newClip.duration, editedTracks });
}
document.buffers[0].byteLength = binary.length;
const output = packCatAsset(document, binary);
// Check before committing the asset that none of the original payload moved.
if (!binary.subarray(0, current.binary.length).equals(current.binary)) throw new Error("Original payload changed");
await writeFile(target, output);
console.log(JSON.stringify({ clips: report, before: current.bytes.length, after: output.length }, null, 2));
