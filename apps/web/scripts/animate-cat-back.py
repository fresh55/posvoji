"""Blender: author the back-touch reaction on the existing revision-19 rig.

Run with blender --background --python this-file -- SOURCE.blend OUTPUT_DIR.
The saved project retains all actions; the temporary GLB exports the two edits.
"""
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
# Preserve the previously clearance-checked upward tail arc from revision 19.
tail_names = [f"j_tail_{i}_{42+i:03d}" for i in range(1, 7)]
raised_tail = [{name: matrix for name, matrix in read("Back warning", frame).items()
                if name in tail_names} for frame in range(85)]
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


def pose(t, stronger):
    apply(base)
    # A tactile twitch comes first. The feet remain planted throughout.
    twitch = envelope(t, 0, .125, .17, .48)
    rotate("j_spine_3_04", (0, 1, 0), (-9 if stronger else -5.5) * twitch)
    rotate("j_spine_4_05", (0, 1, 0), (-5 if stronger else -3) * twitch)
    # Ears react before the head: asymmetric, held briefly, then relaxing.
    ears = envelope(t, .025, .16, .86 if stronger else .64, 2.35)
    rotate("j_l_ear_020", (1, 0, 0), (-40 if stronger else -26) * ears)
    rotate("j_r_ear_027", (1, 0, 0), (34 if stronger else 21) * ears)
    look = envelope(t, .16, .5 if stronger else .72, 1.7 if stronger else 1.35, 3.25)
    rotate("j_spine_4_05", (0, 0, 1), (7 if stronger else 5) * look)
    rotate("j_head_08", (0, 0, 1), (60 if stronger else 41) * look)
    rotate("j_head_08", (1, 0, 0), -6 * look)
    rotate("j_l_eye_014", (0, 0, 1), 3 * look)
    # Narrow the eye without closing it during the over-shoulder stare.
    squint = .45 * envelope(t, .055, .15, .21, .43)
    squint += (.48 if stronger else .23) * envelope(t, .4, .72, 1.6, 2.25)
    squint += envelope(t, 2.43, 2.57, 2.67, 2.91)
    for name in ["j_l_upper_eyelid_015", "j_l_lower_eyelid_016"]:
        rig.pose.bones[name].matrix_basis = base[name].lerp(closed[name], squint)
    # The fallback clip keeps two low, outward beats. The strong response
    # instead uses the previously checked upright tail arc and tip twitch.
    beats = envelope(t, .19, .34, .38, .64)
    beats += .68 * envelope(t, .72, .86, .90, 1.2)
    for i, amplitude in [(4, 5), (5, 9), (6, 13)]:
        rotate(f"j_tail_{i}_{42+i:03d}", (0, 0, 1), amplitude * beats)
    if stronger:
        for name, matrix in raised_tail[round(t * 24)].items():
            rig.pose.bones[name].matrix_basis = matrix
    return {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}


for name, stronger in [("Back pet", False), ("Back warning", True)]:
    rig.animation_data.action = None
    poses = [pose(frame / 24, stronger) for frame in range(85)]
    poses[0] = poses[-1] = base
    previous = bpy.data.actions.get(name)
    if previous:
        bpy.data.actions.remove(previous)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame, sample in enumerate(poses):
        apply(sample)
        for bone in rig.pose.bones:
            for prop in ["location", "rotation_quaternion", "scale"]:
                bone.keyframe_insert(prop, frame=frame, group=bone.name)

rig.animation_data.action = bpy.data.actions["Back pet"]
scene.frame_start = 0
scene.frame_end = 84
scene.frame_set(0)
scene["motion_revision"] = "23: forceful first back touch, pinned ears, fast over-shoulder stare, raised twitching tail"
bpy.ops.wm.save_as_mainfile(filepath=str((args.output / "our-cat-web.blend").resolve()), compress=True)
# Export only the edited actions; the file saved above retains the full library.
for action in list(bpy.data.actions):
    if action.name not in ["Back pet", "Back warning"]:
        bpy.data.actions.remove(action)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "ARMATURE"] or obj.name == "Our cat":
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str((args.output / "back-reactions.glb").resolve()),
    export_format="GLB", use_selection=True, export_animations=True,
    export_animation_mode="ACTIONS", export_skins=True, export_yup=True,
    export_apply=True, export_tangents=False,
)
