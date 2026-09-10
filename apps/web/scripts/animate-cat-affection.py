"""Blender head affection: -- SOURCE.blend OUTPUT_DIR. All paws stay planted."""
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


def read(name, frame):
    rig.animation_data.action = bpy.data.actions[name]
    scene.frame_set(frame)
    return {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


base = read("Companion", 0)
closed = read("Slow blink", 26)
rig.animation_data.action = None


def apply(pose):
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis = pose[bone.name]


apply(base)
bpy.context.view_layer.update()
rest = {bone.name: bone.matrix.copy() for bone in rig.pose.bones}


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def envelope(t, start, peak, hold, end):
    return ease((t - start) / (peak - start)) * (1 - ease((t - hold) / (end - hold)))


def rotate(name, axis, degrees):
    local_axis = (rest[name].to_3x3().inverted() @ Vector(axis)).normalized()
    rig.pose.bones[name].rotation_quaternion @= Quaternion(local_axis, math.radians(degrees))


for name, duration, stroke in [("Head pet", 3.25, False), ("Head rub", 3.5, True)]:
    rig.animation_data.action = None
    poses = []
    for frame in range(round(duration * 24) + 1):
        t = frame / 24
        apply(base)
        lean = envelope(t, .06, .8, 1.9 if stroke else 1.6, duration)
        rotate("j_head_08", (0, 1, 0), 6 * lean)
        rotate("j_head_08", (1, 0, 0), (-12 if stroke else -8) * lean)
        sweep = math.sin((t - .65) * math.pi / 1.5) * envelope(t, .65, 1.0, 1.8, 2.4)
        rotate("j_head_08", (0, 0, 1), -5 * lean + (5 if stroke else 1.5) * sweep)
        relax = envelope(t, .15, .7, 1.7, 2.8)
        rotate("j_l_ear_020", (1, 0, 0), -5 * relax)
        rotate("j_r_ear_027", (1, 0, 0), 3 * relax)
        blink = envelope(t, .25, .8, 1.9 if stroke else 1.45, duration - .3)
        for lid in ["j_l_upper_eyelid_015", "j_l_lower_eyelid_016"]:
            rig.pose.bones[lid].matrix_basis = base[lid].lerp(closed[lid], blink)
        poses.append({bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones})
    poses[0] = poses[-1] = base
    bpy.data.actions.remove(bpy.data.actions[name])
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame, pose in enumerate(poses):
        apply(pose)
        for bone in rig.pose.bones:
            for prop in ["location", "rotation_quaternion", "scale"]:
                bone.keyframe_insert(prop, frame=frame, group=bone.name)

rig.animation_data.action = bpy.data.actions["Head pet"]
scene.frame_start = 0
scene.frame_end = 78
scene.frame_set(0)
scene["motion_revision"] = "24: planted-paw head lean, slow eye close, relaxed ears, longer cheek rub"
bpy.ops.wm.save_as_mainfile(filepath=str((args.output / "our-cat-web.blend").resolve()), compress=True)
for action in list(bpy.data.actions):
    if action.name not in ["Head pet", "Head rub"]:
        bpy.data.actions.remove(action)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "ARMATURE"] or obj.name == "Our cat":
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str((args.output / "head-affection.glb").resolve()),
    export_format="GLB", use_selection=True, export_animations=True,
    export_animation_mode="ACTIONS", export_skins=True, export_yup=True,
    export_apply=True, export_tangents=False)
