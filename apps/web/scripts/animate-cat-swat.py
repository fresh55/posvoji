"""Add a warning swat to revision 26's rig: -- SOURCE.blend OUTPUT_DIR."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
args.output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
scene = bpy.context.scene
scene.render.fps = 24
rig = bpy.data.objects["Armature"]
rig.animation_data.action = bpy.data.actions["Back warning"]
original = []
for frame in range(85):
    scene.frame_set(frame)
    original.append({b.name: b.matrix_basis.copy() for b in rig.pose.bones})
rig.animation_data.action = None


def apply(pose):
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis = pose[bone.name]
    bpy.context.view_layer.update()


apply(original[0])
rest = {b.name: b.matrix.copy() for b in rig.pose.bones}
legs = {
    "l": ("j_l_humerous_031", "j_l_elbow_032", "j_l_wrist_033", "j_l_palm_034", "j_l_finger_035"),
    "r": ("j_r_humerous_037", "j_r_elbow_038", "j_r_wrist_039", "j_r_palm_040", "j_r_finger_041"),
}
palm = legs["l"][3]


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def rotate(name, axis, degrees):
    local = (rest[name].to_3x3().inverted() @ Vector(axis)).normalized()
    rig.pose.bones[name].rotation_quaternion @= Quaternion(local, math.radians(degrees))


def point_segment(name, child, target):
    bone = rig.pose.bones[name]
    origin = bone.head.copy()
    rotation = (rig.pose.bones[child].head - origin).rotation_difference(target - origin)
    bone.matrix = (Matrix.Translation(origin) @ rotation.to_matrix().to_4x4()
                   @ Matrix.Translation(-origin) @ bone.matrix)
    bpy.context.view_layer.update()


def place_paw(target, paw_direction=None, extension=0, side="l"):
    # Solve joint heads; this rig's bone tails are display axes, not joints.
    upper, lower, wrist, palm, finger = legs[side]
    shoulder = rig.pose.bones[upper].head.copy()
    resting_offset = rest[wrist].translation - rest[palm].translation
    offset = resting_offset
    if paw_direction is not None:
        paw_direction = paw_direction.normalized()
        offset = resting_offset.lerp(-paw_direction * resting_offset.length, extension)
    target_wrist = target + offset
    first = (rest[lower].translation - rest[upper].translation).length
    second = (rest[wrist].translation - rest[lower].translation).length
    direction = target_wrist - shoulder
    distance = direction.length
    if not abs(first - second) < distance < first + second:
        raise ValueError("Swat target is outside the arm's reach")
    direction.normalize()
    pole = rest[lower].translation + Vector((0, extension if side == "l" else 0, 0)) - shoulder
    pole -= direction * pole.dot(direction)
    pole.normalize()
    along = (first * first - second * second + distance * distance) / (2 * distance)
    joint = shoulder + direction * along + pole * math.sqrt(max(0, first * first - along * along))
    point_segment(upper, lower, joint)
    point_segment(lower, wrist, target_wrist)
    point_segment(wrist, palm, target)
    matrix = rest[palm].copy()
    if extension:
        forward = rest[finger].translation - rest[palm].translation
        facing = Quaternion().slerp(forward.rotation_difference(paw_direction), extension)
        matrix = facing.to_matrix().to_4x4() @ matrix
    matrix.translation = rig.pose.bones[palm].head
    rig.pose.bones[palm].matrix = matrix
    bpy.context.view_layer.update()


# Rig units are 25 mm; the strike takes three frames (125 ms).
keys = [
    (.21, (0, 0, 0)),
    (.5, (3.8, 3.5, 8.5)),
    (.625, (8.6, -7.5, 5.8)),
    (.833333, (3.5, 1.5, 6.5)),
    (1.625, (0, 0, 0)),
]
poses = []
for frame in range(85):
    t = frame / 24
    apply(original[frame])
    # Reduce the flinch so the supporting leg can still reach the floor.
    rig.pose.bones["j_spine_3_04"].matrix_basis = original[0]["j_spine_3_04"].lerp(
        original[frame]["j_spine_3_04"], .25)
    loading = ease((t - .21) / .29) * (1 - ease((t - .5) / .333333))
    strike = ease((t - .5) / .125) * (1 - ease((t - .625) / .4))
    rotate("j_spine_4_05", (0, 0, 1), 5 * loading - 10 * strike)
    rotate("j_spine_4_05", (0, 1, 0), 4 * loading - 2 * strike)
    bpy.context.view_layer.update()
    place_paw(rest["j_r_palm_040"].translation, side="r")
    place_paw(rest[palm].translation)
    planted = {name: rig.pose.bones[name].matrix_basis.copy()
               for name in legs["l"]}
    if .21 < t < 1.625:
        for (start, a), (end, b) in zip(keys, keys[1:]):
            if start <= t <= end:
                offset = Vector(a).lerp(Vector(b), ease((t - start) / (end - start)))
                break
        extension = ease((t - .21) / .29) * (1 - ease((t - .833333) / .791667))
        direction = Vector((1, -.25, -.15)).lerp(Vector((.5, -.85, -.2)), strike)
        place_paw(rest[palm].translation + offset, direction, extension)
        # Avoid a pose jump when the paw leaves or returns to the floor.
        blend = ease((t - .21) / .12) * (1 - ease((t - 1.35) / .275))
        for name in legs["l"]:
            bone = rig.pose.bones[name]
            bone.matrix_basis = planted[name].lerp(bone.matrix_basis, blend)
    facing = ease((t - .25) / .25) * (1 - ease((t - 1.4) / 1))
    rotate("j_head_08", (0, 0, 1), -55 * facing - 22 * strike)
    poses.append({b.name: b.matrix_basis.copy() for b in rig.pose.bones})
poses[0] = poses[-1] = original[0]
bpy.data.actions.remove(bpy.data.actions["Back warning"])
action = bpy.data.actions.new("Back warning")
action.use_fake_user = True
rig.animation_data.action = action
for frame, pose in enumerate(poses):
    apply(pose)
    for bone in rig.pose.bones:
        for prop in ["location", "rotation_quaternion", "scale"]:
            bone.keyframe_insert(prop, frame=frame, group=bone.name)
scene.frame_start = 0
scene.frame_end = 84
scene.frame_set(0)
scene["motion_revision"] = "29: diagonal slap, extending wrist, shoulder turn and immediate recoil"
bpy.ops.wm.save_as_mainfile(filepath=str((args.output / "our-cat-web.blend").resolve()), compress=True)
for action in list(bpy.data.actions):
    if action.name != "Back warning":
        bpy.data.actions.remove(action)
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type in ["MESH", "ARMATURE"] or obj.name == "Our cat":
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str((args.output / "swat-reaction.glb").resolve()),
    export_format="GLB", use_selection=True, export_animations=True,
    export_animation_mode="ACTIONS", export_skins=True, export_yup=True,
    export_apply=True, export_tangents=False,
)
