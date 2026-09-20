import { beforeAll, expect, it } from "vitest";
import { AnimationMixer, Quaternion, Vector3 } from "three";
import { loadCatAsset } from "../scripts/cat-asset.mjs";

let clips, root;
beforeAll(async () => {
  const { gltf } = await loadCatAsset(new URL("../public/models/our-cat/cat.glb", import.meta.url));
  clips = gltf.animations;
  root = gltf.scene;
});
// Meshopt's 16-bit filters round samples and can negate quaternions.
// Allow rounding at this rig's scale; q and -q represent the same rotation.
const tolerance = { rotation: 5e-5, translation: 2e-4 };
const samePose = (track, offset, other, otherOffset) => {
  const size = track.getValueSize();
  const rotation = track.name.endsWith(".quaternion");
  const limit = rotation ? tolerance.rotation : tolerance.translation;
  const signs = rotation ? [1, -1] : [1];
  return signs.some(sign => Array.from({ length: size }, (_, i) =>
    Math.abs(track.values[offset + i] - sign * other[otherOffset + i])).every(delta => delta <= limit));
};
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
      expect(samePose(track, 0, resting.values, 0), `${track.name} against the idle pose`).toBe(true);
      expect(samePose(track, track.values.length - size, track.values, 0), `${track.name} endpoints`).toBe(true);
    }
    // Regression: a two-key static Blender export must replace the previous
    // raised-tail curve even though their first and last poses are identical.
    for (const bone of name === "Back pet" ? ["j_tail_1_043", "j_tail_2_044", "j_tail_3_045"] : []) {
      for (const time of [.2, .9, 1.7, 2.5]) expect(angle(clip, bone, time)).toBeLessThan(1e-5);
    }
  }
});

it("reacts with the ears before the head and keeps the warning eye facing the swat", () => {
  const gentle = clips.find(clip => clip.name === "Back pet");
  const warning = clips.find(clip => clip.name === "Back warning");
  expect(angle(gentle, "j_l_ear_020", .15)).toBeGreaterThan(.3);
  expect(angle(gentle, "j_head_08", .15)).toBeLessThan(.01);
  expect(angle(gentle, "j_head_08", .9)).toBeGreaterThan(.6);
  expect(angle(warning, "j_head_08", .9)).toBeLessThan(.2);
  expect(angle(gentle, "j_tail_6_048", 1.46)).toBeLessThan(.01);
});

it("extends the swatting paw, recoils immediately and keeps the support paw planted", () => {
  const mixer = new AnimationMixer(root);
  const warning = clips.find(clip => clip.name === "Back warning");
  mixer.clipAction(warning).play();
  const paw = root.getObjectByName("j_l_palm_034");
  const other = root.getObjectByName("j_r_palm_040");
  const upper = root.getObjectByName("j_l_humerous_031");
  const elbow = root.getObjectByName("j_l_elbow_032");
  const wrist = root.getObjectByName("j_l_wrist_033");
  const finger = root.getObjectByName("j_l_finger_035");
  const at = time => {
    mixer.setTime(time); root.updateMatrixWorld(true);
    return paw.getWorldPosition(new Vector3());
  };
  const rest = at(0), support = other.getWorldPosition(new Vector3());
  const windup = at(.5), shoulderBefore = upper.getWorldPosition(new Vector3());
  const strike = at(.625), shoulderAfter = upper.getWorldPosition(new Vector3());
  expect(windup.y - rest.y).toBeGreaterThan(.2);
  expect(windup.x - strike.x).toBeGreaterThan(.25);
  expect(windup.y - strike.y).toBeGreaterThan(.06);
  expect(strike.distanceTo(windup) / .125).toBeGreaterThan(2);
  expect(shoulderAfter.distanceTo(shoulderBefore)).toBeGreaterThan(.015);
  const joint = elbow.getWorldPosition(new Vector3()), hand = wrist.getWorldPosition(new Vector3());
  expect(shoulderAfter.clone().sub(joint).angleTo(hand.clone().sub(joint))).toBeGreaterThan(2);
  // The digits and wrist extend in the same direction, without the old hook.
  expect(strike.clone().sub(hand).normalize().dot(
    finger.getWorldPosition(new Vector3()).sub(strike).normalize())).toBeGreaterThan(.9);
  expect(at(2 / 3).distanceTo(strike)).toBeGreaterThan(.02);
  const recoil = at(5 / 6);
  expect(recoil.x - strike.x).toBeGreaterThan(.2);
  expect(at(3.49).distanceTo(rest)).toBeLessThan(.0001);
  // Sample between authored frames too, where rotation interpolation can
  // introduce a jump or foot slide even when the keys themselves look right.
  let previous = at(0);
  for (let frame = 1; frame < 420; frame++) {
    const position = at(frame / 120);
    expect(position.distanceTo(previous), `continuous sample ${frame}`).toBeLessThan(.04);
    expect(other.getWorldPosition(new Vector3()).distanceTo(support)).toBeLessThan(.001);
    previous = position;
  }
  mixer.stopAllAction();
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
