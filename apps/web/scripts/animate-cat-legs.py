"""Author four single-tap paw withdrawals: -- SOURCE.blend OUTPUT_DIR."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
args.output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
scene = bpy.context.scene
scene.render.fps = 24
rig = bpy.data.objects["Armature"]
rig.animation_data.action = bpy.data.actions["Companion"]
scene.frame_set(0)
base = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
rest = {bone.name: bone.matrix.copy() for bone in rig.pose.bones}
rig.animation_data.action = None


def apply(pose):
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis = pose[bone.name]
    bpy.context.view_layer.update()


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def envelope(t, start, peak, hold, end):
    return ease((t - start) / (peak - start)) * (1 - ease((t - hold) / (end - hold)))


def rotate(name, axis, degrees):
    local = (rest[name].to_3x3().inverted() @ Vector(axis)).normalized()
    rig.pose.bones[name].rotation_quaternion @= Quaternion(local, math.radians(degrees))


def withdraw(chain, offset):
    # Two-bone solve using the original bend plane, keeping limb lengths and
    # the foot's resting orientation. Only the selected limb is affected.
    upper, lower, foot = chain
    a, b, c = [rest[name].translation for name in chain]
    target = c + offset
    direction = (target - a).normalized()
    distance = (target - a).length
    first, second = (b - a).length, (c - b).length
    cosine = max(-1, min(1, (first * first + distance * distance - second * second) / (2 * first * distance)))
    pole = ((b - a) - direction * (b - a).dot(direction)).normalized()
    joint = a + direction * first * cosine + pole * first * math.sqrt(1 - cosine * cosine)
    for name, old, new, position in [(upper, b - a, joint - a, a), (lower, c - b, target - joint, joint)]:
        matrix = old.rotation_difference(new).to_matrix().to_4x4() @ rest[name]
        matrix.translation = position
        rig.pose.bones[name].matrix = matrix
        bpy.context.view_layer.update()
    matrix = rest[foot].copy()
    matrix.translation = target
    rig.pose.bones[foot].matrix = matrix
    bpy.context.view_layer.update()


legs = {
    "front left": ("j_l_humerous_031", "j_l_elbow_032", "j_l_wrist_033"),
    "front right": ("j_r_humerous_037", "j_r_elbow_038", "j_r_wrist_039"),
    "rear left": ("j_l_femur_050", "j_l_knee_051", "j_l_ankle_052"),
    "rear right": ("j_r_femur_055", "j_r_knee_056", "j_r_ankle_057"),
}
names = []
for leg, chain in legs.items():
    name = f"Paw withdraw {leg}"
    names.append(name)
    rig.animation_data.action = None
    poses = []
    side = 1 if leg.endswith("left") else -1
    rear = leg.startswith("rear")
    for frame in range(61):
        t = frame / 24
        apply(base)
        glance = envelope(t, .02, .38, 1.1, 2.25)
        rotate("j_head_08", (0, 1, 0), (14 if rear else 18) * glance)
        rotate("j_head_08", (0, 0, 1), side * (22 if rear else 12) * glance)
        rotate("j_l_ear_020" if side == 1 else "j_r_ear_027", (0, 0, 1), side * 5 * glance)
        pull = envelope(t, .16, .65, 1.05, 1.85)
        lift = envelope(t, .16, .45, 1.15, 1.85)
        withdraw(chain, Vector(((-.55 if rear else -.9) * pull, 0, .18 * lift)))
        poses.append({bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones})
    poses[0] = poses[-1] = base
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame, pose in enumerate(poses):
        apply(pose)
        for bone in rig.pose.bones:
            for prop in ["location", "rotation_quaternion", "scale"]:
                bone.keyframe_insert(prop, frame=frame, group=bone.name)

rig.animation_data.action = bpy.data.actions[names[0]]
scene.frame_start = 0
scene.frame_end = 60
scene.frame_set(0)
scene["motion_revision"] = "25: one-tap leg glance and small individual paw withdrawal"
bpy.ops.wm.save_as_mainfile(filepath=str((args.output / "our-cat-web.blend").resolve()), compress=True)
for action in list(bpy.data.actions):
    if action.name not in names:
        bpy.data.actions.remove(action)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "ARMATURE"] or obj.name == "Our cat":
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str((args.output / "leg-reactions.glb").resolve()),
    export_format="GLB", use_selection=True, export_animations=True,
    export_animation_mode="ACTIONS", export_skins=True, export_yup=True,
    export_apply=True, export_tangents=False)
