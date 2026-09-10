import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { MeshoptSimplifier } from "meshoptimizer";
import { loadCatAsset, packCatAsset } from "./cat-asset.mjs";

const path = new URL("../public/models/our-cat/cat.glb", import.meta.url);
const { document, gltf, binary: originalBinary } = await loadCatAsset(path);
let binary = originalBinary;
const mixer = new AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations.find(clip => clip.name === "Companion")).play();
mixer.setTime(0); gltf.scene.updateMatrixWorld(true);
const layers = [
  ["Ear left", "j_l_ear_020", [0, 1, 0], 9],
  ["Ear right", "j_r_ear_027", [0, 1, 0], -9],
  ["Curious tilt left", "j_head_08", [0, 0, 1], 6],
  ["Curious tilt right", "j_head_08", [0, 0, 1], -6],
];
const append = (values, type) => {
  const bytes = Buffer.from(new Float32Array(values).buffer);
  const offset = binary.length;
  binary = Buffer.concat([binary, bytes]);
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
  const accessor = document.accessors.length;
  document.accessors.push({ bufferView, componentType: 5126, count: values.length / (type === "SCALAR" ? 1 : 4), type,
    ...(type === "SCALAR" ? { min: [0], max: [1] } : {}) });
  return accessor;
};
if (!layers.every(([name]) => document.animations.some(clip => clip.name === name))) {
  if (layers.some(([name]) => document.animations.some(clip => clip.name === name))) throw new Error("Partial curiosity layers; regenerate from a clean export");
  const input = append([0, 1], "SCALAR");
  for (const [name, boneName, axis, degrees] of layers) {
    const bone = gltf.scene.getObjectByName(boneName);
    if (!bone) throw new Error(`Missing ${boneName}`);
    const parentRotation = bone.parent.getWorldQuaternion(new Quaternion()).invert();
    const localAxis = new Vector3(...axis).applyQuaternion(parentRotation);
    const rotation = bone.quaternion.clone().premultiply(new Quaternion().setFromAxisAngle(localAxis, degrees * Math.PI / 180)).normalize().toArray();
    const output = append([...rotation, ...rotation], "VEC4");
    document.animations.push({ name, samplers: [{ input, output, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: document.nodes.findIndex(node => node.name === boneName), path: "rotation" } }] });
  }
  document.buffers[0].byteLength = binary.length;
  await writeFile(path, packCatAsset(document, binary));
}
mixer.stopAllAction();

// Each anatomical material is simplified separately: lock its border so the
// head/chin/back/tail boundaries retain the export's exact vertices and weights.
await MeshoptSimplifier.ready;
const meshes = [];
gltf.scene.traverse(source => {
  if (!source.isSkinnedMesh) return;
  if (Array.isArray(source.material)) throw new Error("Expected one anatomical material per primitive");
  const geometry = source.geometry, position = geometry.getAttribute("position");
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
  const indices = Uint32Array.from(geometry.index.array);
  // Preserve the limb boundaries inside the body material too. Simplifying
  // across differently weighted legs can move a contact onto the wrong limb.
  const regions = new Map();
  const vertexLeg = index => {
    const weights = { fl: 0, fr: 0, rl: 0, rr: 0 };
    const { skinIndex, skinWeight } = geometry.attributes;
    for (let i = 0; i < skinIndex.itemSize; i++) {
      const bone = source.skeleton.bones[skinIndex.getComponent(index, i)];
      const match = /^j_([lr])_(humerous|elbow|wrist|palm|finger|forearm|femur|knee|ankle|ball|toe)_/.exec(bone.name);
      if (match) weights[`${["femur", "knee", "ankle", "ball", "toe"].includes(match[2]) ? "r" : "f"}${match[1]}`] += skinWeight.getComponent(index, i);
    }
    return Object.keys(weights).find(key => weights[key] > .55) ?? "body";
  };
  const labels = source.material.name === "White fur, grey saddle patches and pink nose"
    ? Array.from({ length: position.count }, (_, i) => vertexLeg(i)) : null;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.subarray(i, i + 3));
    const region = labels ? [...new Set(triangle.map(index => labels[index]))].sort().join("/") : "all";
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region).push(...triangle);
  }
  const simplified = [];
  let error = 0;
  for (const region of regions.values()) {
    const [result, regionError] = MeshoptSimplifier.simplify(Uint32Array.from(region), positions, 3,
      Math.min(region.length, Math.max(24, Math.floor(region.length * .12 / 3) * 3)), .002, ["LockBorder"]);
    simplified.push(...result);
    error = Math.max(error, regionError);
  }
  const vertices = [], remap = new Map();
  const triangles = Array.from(simplified, vertex => {
    if (!remap.has(vertex)) { remap.set(vertex, vertices.length); vertices.push(vertex); }
    return remap.get(vertex);
  });
  meshes.push({ name: source.name, material: source.material.name, sourceVertices: position.count,
    sourceTriangles: indices.length / 3, error, vertices, triangles });
});
const asset = packCatAsset(document, binary);
const result = { modelSha256: createHash("sha256").update(asset).digest("hex"), meshes };
await writeFile(new URL("../public/models/our-cat/picking.json", import.meta.url), JSON.stringify(result));
console.log(JSON.stringify(meshes.map(mesh => ({ material: mesh.material, before: mesh.sourceTriangles,
  after: mesh.triangles.length / 3, vertices: mesh.vertices.length, error: mesh.error })), null, 2));
