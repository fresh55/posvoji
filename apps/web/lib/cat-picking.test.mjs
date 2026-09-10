import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AnimationMixer, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { expect, it, vi } from "vitest";
import { catLegAtHit, createCatPicker } from "./cat-picking";
import { loadCatAsset } from "../scripts/cat-asset.mjs";
import data from "../public/models/our-cat/picking.json";

it("keeps picking data tied to the current GLB and substantially reduces triangle work", async () => {
  const bytes = await readFile(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(data.modelSha256);
  const original = data.meshes.reduce((sum, mesh) => sum + mesh.sourceTriangles, 0);
  const reduced = data.meshes.reduce((sum, mesh) => sum + mesh.triangles.length / 3, 0);
  expect(reduced / original).toBeLessThan(.17);
});

it("keeps the nose contact on the moving head and excludes the forehead", async () => {
  const { gltf } = await loadCatAsset(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  const root = gltf.scene, mixer = new AnimationMixer(root), camera = new PerspectiveCamera(30, 1, .01, 100);
  const head = root.getObjectByName("j_head_08");
  const picker = createCatPicker(root, () => camera, (x, y) => new Vector2(x, y));
  for (const [name, time] of [["Companion", 0], ["Head pet", 1.2], ["Nose sniff", .18], ["Nose sniff", 1.8]]) {
    mixer.stopAllAction(); mixer.clipAction(gltf.animations.find(clip => clip.name === name)).play(); mixer.setTime(time);
    root.updateMatrixWorld(true);
    for (const angle of [-35, 0, 35]) {
      const theta = angle * Math.PI / 180;
      camera.position.set(Math.sin(theta), .42, Math.cos(theta));
      camera.lookAt(head.localToWorld(new Vector3(5.237, -.042, -.526))); camera.updateMatrixWorld(true);
      expect(picker.pick(0, 0)?.nose, `${name} nose at ${angle}`).toBe(true);
      camera.lookAt(head.localToWorld(new Vector3(4.7, 0, .8))); camera.updateMatrixWorld(true);
      expect(picker.pick(0, 0)?.nose, `${name} forehead at ${angle}`).toBe(false);
    }
  }
  picker.dispose();
});

it("tracks animated anatomy from multiple camera angles without adding scene objects", async () => {
  const { gltf } = await loadCatAsset(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  const root = gltf.scene, meshes = [];
  root.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  const children = root.children.slice();
  const mixer = new AnimationMixer(root), camera = new PerspectiveCamera(30, 1, .01, 100);
  const picker = createCatPicker(root, () => camera, (x, y) => new Vector2(x, y));
  const ray = new Raycaster();
  const region = name => name?.endsWith("touch region") ? name : "body";
  let hits = 0, agreements = 0, misses = 0, legHits = 0, legAgreements = 0;
  const legs = new Set();
  const seen = new Set();
  for (const [name, time] of [["Companion", 0], ["Head pet", 1.2], ["Back warning", 1.2], ["Sleep", 2], ["Stretch", 1.75]]) {
    mixer.stopAllAction(); mixer.clipAction(gltf.animations.find(clip => clip.name === name)).play(); mixer.setTime(time);
    root.updateMatrixWorld(true);
    for (const mesh of meshes) mesh.computeBoundingSphere();
    for (const angle of [-19, 90, 145]) {
      const theta = angle * Math.PI / 180;
      camera.position.set(Math.sin(theta) * 1.45, .48, Math.cos(theta) * 1.45);
      camera.lookAt(new Vector3(0, .25, 0)); camera.updateMatrixWorld(true);
      for (let y = -.6; y <= .6; y += .15) for (let x = -.6; x <= .6; x += .15) {
        ray.setFromCamera(new Vector2(x, y), camera);
        const original = ray.intersectObjects(meshes, false)[0];
        const result = picker.pick(x, y);
        if (original) {
          hits++; seen.add(region(original.object.material.name));
          if (result && region(result.material) === region(original.object.material.name)) agreements++;
          const leg = catLegAtHit(original);
          if (leg) { legs.add(leg); legHits++; if (result?.leg === leg) legAgreements++; }
        } else if (result) misses++;
      }
    }
  }
  expect(hits).toBeGreaterThan(150);
  expect(seen).toEqual(new Set(["body", "Head touch region", "Chin touch region", "Back touch region", "Tail touch region"]));
  expect(agreements / hits).toBeGreaterThan(.98);
  expect(misses).toBeLessThan(5);
  expect(legs).toEqual(new Set(["front left", "front right", "rear left", "rear right"]));
  expect(legAgreements / legHits).toBeGreaterThan(.95);
  expect(root.children).toEqual(children);
  const dispose = vi.spyOn(meshes[0].geometry, "dispose");
  picker.dispose(); picker.dispose();
  expect(picker.pick(0, 0)).toBeNull();
  expect(dispose).not.toHaveBeenCalled();
  dispose.mockRestore();
}, 60000);
