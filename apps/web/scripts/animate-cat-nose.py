"""Blender nose touch: -- SOURCE.blend OUTPUT_DIR. A single gentle recoil/sniff."""
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
    bpy.context.view_layer.update()


apply(base)
rest = {bone.name: bone.matrix.copy() for bone in rig.pose.bones}


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def envelope(t, start, peak, hold, end):
    return ease((t - start) / (peak - start)) * (1 - ease((t - hold) / (end - hold)))


def rotate(name, axis, degrees):
    local_axis = (rest[name].to_3x3().inverted() @ Vector(axis)).normalized()
    rig.pose.bones[name].rotation_quaternion @= Quaternion(local_axis, math.radians(degrees))


poses = []
for frame in range(73):
    t = frame / 24
    apply(base)
    recoil = envelope(t, .015, .18, .23, .55)
    sniff = envelope(t, .55, .72, .78, .94) + .8 * envelope(t, .97, 1.12, 1.18, 1.37)
    curious = envelope(t, 1.3, 1.8, 2.2, 3)
    rotate("j_head_08", (0, 1, 0), -6 * recoil + 2 * sniff)
    rotate("j_head_08", (1, 0, 0), -7 * curious)
    rotate("j_l_ear_020", (1, 0, 0), -4 * recoil + 3 * curious)
    rotate("j_r_ear_027", (1, 0, 0), 3 * recoil)
    blink = .65 * envelope(t, .02, .15, .22, .48)
    for lid in ["j_l_upper_eyelid_015", "j_l_lower_eyelid_016"]:
        rig.pose.bones[lid].matrix_basis = base[lid].lerp(closed[lid], blink)
    bpy.context.view_layer.update()
    head = rig.pose.bones["j_head_08"]
    matrix = head.matrix.copy()
    matrix.translation += Vector((-.35 * recoil + .12 * sniff, 0, 0))
    head.matrix = matrix
    bpy.context.view_layer.update()
    poses.append({bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones})
poses[0] = poses[-1] = base
name = "Nose sniff"
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
scene.frame_start = 0
scene.frame_end = 72
scene.frame_set(0)
scene["motion_revision"] = "26: single nose tap, tiny recoil, two sniffs, curious head tilt"
bpy.ops.wm.save_as_mainfile(filepath=str((args.output / "our-cat-web.blend").resolve()), compress=True)
for action in list(bpy.data.actions):
    if action.name != name:
        bpy.data.actions.remove(action)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "ARMATURE"] or obj.name == "Our cat":
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str((args.output / "nose-reaction.glb").resolve()),
    export_format="GLB", use_selection=True, export_animations=True,
    export_animation_mode="ACTIONS", export_skins=True, export_yup=True,
    export_apply=True, export_tangents=False)
