import { beforeAll, expect, it } from "vitest";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { loadCatAsset } from "../scripts/cat-asset.mjs";

let clips, root;
beforeAll(async () => {
  const { gltf } = await loadCatAsset(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  clips = gltf.animations;
  root = gltf.scene;
});
const angle = (clip, bone, time) => {
  const track = clip.tracks.find(track => track.name === `${bone}.quaternion`);
  const first = new Quaternion().fromArray(track.values).normalize();
  return first.angleTo(new Quaternion().fromArray(track.createInterpolant().evaluate(time)).normalize());
};

it("returns both back reactions to their shared idle pose", () => {
  const idle = clips.find(clip => clip.name === "Companion");
  for (const name of ["Back pet", "Back warning"]) {
    const clip = clips.find(clip => clip.name === name);
    expect(clip.duration).toBe(3.5);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      const resting = idle.tracks.find(candidate => candidate.name === track.name);
      for (let i = 0; i < size; i++) {
        // Existing compressed clips contain sub-micro-unit rounding noise.
        expect(track.values[i]).toBeCloseTo(resting.values[i], 5);
        expect(track.values[track.values.length - size + i]).toBeCloseTo(track.values[i], 5);
      }
    }
    // Regression: a two-key static Blender export must replace the previous
    // raised-tail curve even though their first and last poses are identical.
    for (const bone of name === "Back pet" ? ["j_tail_1_043", "j_tail_2_044", "j_tail_3_045"] : []) {
      for (const time of [.2, .9, 1.7, 2.5]) expect(angle(clip, bone, time)).toBeLessThan(1e-5);
    }
  }
});

it("reacts with the ears before the head and keeps the stronger back clip visibly distinct", () => {
  const gentle = clips.find(clip => clip.name === "Back pet");
  const warning = clips.find(clip => clip.name === "Back warning");
  expect(angle(gentle, "j_l_ear_020", .15)).toBeGreaterThan(.3);
  expect(angle(gentle, "j_head_08", .15)).toBeLessThan(.01);
  expect(angle(gentle, "j_head_08", .9)).toBeGreaterThan(.6);
  expect(angle(warning, "j_head_08", .9)).toBeGreaterThan(angle(gentle, "j_head_08", .9) + .08);
  expect(angle(gentle, "j_tail_6_048", 1.46)).toBeLessThan(.01);
});

it("raises the strong response's tail visibly behind the cat", () => {
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clips.find(clip => clip.name === "Back warning")).play();
  mixer.setTime(0); root.updateMatrixWorld(true);
  const tip = root.getObjectByName("j_tail_6_048");
  const rest = tip.getWorldPosition(new Vector3()).y;
  mixer.setTime(1.2); root.updateMatrixWorld(true);
  expect(tip.getWorldPosition(new Vector3()).y - rest).toBeGreaterThan(.3);
  mixer.stopAllAction();
});
