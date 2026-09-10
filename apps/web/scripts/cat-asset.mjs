import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";

/** Offline geometry/animation tools never decode or download the embedded art. */
export async function loadCatAsset(path) {
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
  const bytes = await readFile(path);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  if ([...(document.buffers ?? []), ...(document.images ?? [])].some(item => item.uri && !item.uri.startsWith("data:"))) {
    throw new Error("Cat tooling accepts embedded assets only; external downloads are disabled");
  }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  return { bytes, document, binary: bytes.subarray(28 + jsonLength), gltf };
}

export function packCatAsset(document, binary) {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, binary]);
}
