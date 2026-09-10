import { expect, it } from "vitest";
import { AnimationMixer, Vector3 } from "three";
import { loadCatAsset } from "../scripts/cat-asset.mjs";

it("withdraws only the selected paw, close to the floor, with quiet endpoints", async () => {
  const { gltf } = await loadCatAsset(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  const root = gltf.scene, mixer = new AnimationMixer(root);
  const names = ["front left", "front right", "rear left", "rear right"];
  const paws = ["j_l_palm_034", "j_r_palm_040", "j_l_ball_053", "j_r_ball_058"].map(name => root.getObjectByName(name));
  for (const [selected, name] of names.entries()) {
    const clip = gltf.animations.find(clip => clip.name === `Paw withdraw ${name}`);
    expect(clip.duration).toBe(2.5);
    mixer.stopAllAction(); mixer.clipAction(clip).play(); mixer.setTime(0); root.updateMatrixWorld(true);
    const resting = paws.map(paw => paw.getWorldPosition(new Vector3()));
    let displacement = 0;
    for (let frame = 0; frame <= 60; frame++) {
      mixer.setTime(frame / 24); root.updateMatrixWorld(true);
      paws.forEach((paw, i) => {
        const position = paw.getWorldPosition(new Vector3());
        const distance = position.distanceTo(resting[i]);
        if (i !== selected) expect(distance).toBeLessThan(.00001);
        else {
          displacement = Math.max(displacement, distance);
          expect(position.y - resting[i].y).toBeGreaterThan(-.0001);
          expect(position.y - resting[i].y).toBeLessThan(.012);
        }
      });
    }
    expect(displacement).toBeGreaterThan(.01);
    expect(displacement).toBeLessThan(.04);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      for (let i = 0; i < size; i++) expect(track.values.at(-size + i)).toBeCloseTo(track.values[i], 5);
    }
  }
});
