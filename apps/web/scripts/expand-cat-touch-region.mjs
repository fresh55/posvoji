import { writeFile } from "node:fs/promises";
import { MeshoptEncoder } from "meshoptimizer";
import { loadCatAsset, packCatAsset } from "./cat-asset.mjs";

// Extend an authored touch region over skin attached to the relevant bones.
// Classify in the bind pose so the boundary follows the skin at every pose.
// Other labelled regions and limb-dominated faces are preserved.
const path = new URL("../public/models/our-cat/cat.glb", import.meta.url);
const region = process.argv[2] ?? "back";
if (!["back", "head"].includes(region)) throw new Error("Expected back or head");
const regionName = region === "head" ? "Head touch region" : "Back touch region";
const { document, gltf, binary: original } = await loadCatAsset(path);
const bodyMaterial = document.materials.findIndex(m => m.name === "White fur, grey saddle patches and pink nose");
const backMaterial = document.materials.findIndex(m => m.name === regionName);
const primitives = document.meshes.flatMap(mesh => mesh.primitives);
const body = primitives.find(p => p.material === bodyMaterial);
const back = primitives.find(p => p.material === backMaterial);
let source;
gltf.scene.traverse(mesh => {
  if (mesh.isSkinnedMesh && mesh.material.name === document.materials[bodyMaterial].name) source = mesh;
});
if (!source || !body || !back || source.geometry.attributes.position.count !== 27838) throw new Error("Unexpected cat rig");
const { position, normal, skinIndex, skinWeight } = source.geometry.attributes;
const eligible = index => {
  let torso = 0;
  for (let i = 0; i < skinIndex.itemSize; i++) {
    let bone = source.skeleton.bones[skinIndex.getComponent(index, i)];
    if (region === "head") {
      while (bone && bone.name !== "j_head_08") bone = bone.parent;
      if (bone) torso += skinWeight.getComponent(index, i);
    } else if (/^j_spine_|^j_hips_/.test(bone.name)) torso += skinWeight.getComponent(index, i);
  }
  // Coordinates are the existing quantized bind-pose attributes. Y is up;
  // exclude the lower belly and downward-facing underside of the torso.
  return region === "head" ? torso >= .55 : torso >= .55 && position.getY(index) > .02 && normal.getY(index) > -.2;
};
const kept = [], moved = [];
const indices = source.geometry.index.array;
for (let i = 0; i < indices.length; i += 3) {
  const face = [indices[i], indices[i + 1], indices[i + 2]];
  (face.every(eligible) ? moved : kept).push(...face);
}
if (!moved.length) { console.log(`${regionName} already expanded`); process.exit(0); }
let backMesh;
gltf.scene.traverse(mesh => {
  if (mesh.isSkinnedMesh && mesh.material.name === regionName) backMesh = mesh;
});
const expanded = [...backMesh.geometry.index.array, ...moved];
await MeshoptEncoder.ready;
let binary = original;
const fallback = document.buffers.findIndex(buffer => buffer.extensions?.EXT_meshopt_compression?.fallback);
if (fallback < 0) throw new Error("Missing meshopt fallback buffer");
for (const [primitive, values] of [[body, kept], [back, expanded]]) {
  const array = Uint16Array.from(values);
  const encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(new Uint8Array(array.buffer), array.length, 2, "TRIANGLES"));
  const offset = binary.length;
  binary = Buffer.concat([binary, encoded, Buffer.alloc((4 - encoded.length % 4) % 4)]);
  const bufferView = document.bufferViews.length;
  document.bufferViews.push({ buffer: fallback, byteOffset: document.buffers[fallback].byteLength,
    byteLength: array.byteLength, target: 34963,
    extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: offset, byteLength: encoded.length,
      mode: "TRIANGLES", byteStride: 2, count: array.length } } });
  document.buffers[fallback].byteLength += array.byteLength;
  primitive.indices = document.accessors.length;
  document.accessors.push({ name: `expanded ${region} touch triangles`, bufferView, componentType: 5123,
    count: array.length, type: "SCALAR" });
}
document.buffers[0].byteLength = binary.length;
await writeFile(path, packCatAsset(document, binary));
console.log(JSON.stringify({ movedTriangles: moved.length / 3, regionTriangles: expanded.length / 3,
  addedBinaryBytes: binary.length - original.length }));
