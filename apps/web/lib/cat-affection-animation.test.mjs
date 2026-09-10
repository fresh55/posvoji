import { expect, it } from "vitest";
import { AnimationMixer, Vector3 } from "three";
import { loadCatAsset } from "../scripts/cat-asset.mjs";

it("keeps all four paws planted throughout head taps, cheek strokes and nose sniffs", async () => {
  const { gltf } = await loadCatAsset(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  const root = gltf.scene, mixer = new AnimationMixer(root);
  const bones = ["j_l_palm_034", "j_r_palm_040", "j_l_ball_053", "j_r_ball_058"].map(name => root.getObjectByName(name));
  for (const name of ["Head pet", "Head rub", "Nose sniff"]) {
    const clip = gltf.animations.find(clip => clip.name === name);
    mixer.stopAllAction(); mixer.clipAction(clip).play(); mixer.setTime(0); root.updateMatrixWorld(true);
    const resting = bones.map(bone => bone.getWorldPosition(new Vector3()));
    for (let frame = 0; frame <= Math.round(clip.duration * 24); frame++) {
      mixer.setTime(frame / 24); root.updateMatrixWorld(true);
      bones.forEach((bone, i) => expect(bone.getWorldPosition(new Vector3()).distanceTo(resting[i])).toBeLessThan(.00001));
    }
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      for (let i = 0; i < size; i++) expect(track.values.at(-size + i)).toBeCloseTo(track.values[i], 5);
    }
  }
});
