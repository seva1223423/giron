"""
Render an exercise demo video using the Mixamo Xbot humanoid (skinned mesh).

This is the "quality" renderer — replaces the capsule stick-figure version
with a real rigged character. Same JSON animation format so keyframe work
is portable between the two.

Prerequisites:
- assets/3d/xbot.glb present (downloaded from threejs.org examples — full
  mixamorig skeleton, two skinned meshes, ~2.9 MB).
- Blender 4.2+.

Run:
    blender --background --python scripts/blender/render_exercise_mixamo.py -- \
        --exercise squat --output ./exercise-videos-rendered/squat.mp4
"""
import bpy
import json
import math
import os
import sys
from pathlib import Path

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

exercise_id = None
output_path = None
animations_file = None
glb_path = None
i = 0
while i < len(argv):
    if argv[i] == "--exercise" and i + 1 < len(argv):
        exercise_id = argv[i + 1]; i += 2
    elif argv[i] == "--output" and i + 1 < len(argv):
        output_path = argv[i + 1]; i += 2
    elif argv[i] == "--animations" and i + 1 < len(argv):
        animations_file = argv[i + 1]; i += 2
    elif argv[i] == "--model" and i + 1 < len(argv):
        glb_path = argv[i + 1]; i += 2
    else:
        i += 1

script_dir = Path(__file__).resolve().parent
repo_root = script_dir.parent.parent
if not animations_file:
    animations_file = str(script_dir / "exercise-animations.json")
if not glb_path:
    glb_path = str(repo_root / "assets" / "3d" / "xbot.glb")

if not exercise_id or not output_path:
    print("Usage: blender --background --python render_exercise_mixamo.py -- --exercise ID --output PATH")
    sys.exit(1)

with open(animations_file, "r", encoding="utf-8") as f:
    animations_data = json.load(f)
if exercise_id not in animations_data:
    print(f"No animation defined for '{exercise_id}' in {animations_file}")
    sys.exit(1)
anim = animations_data[exercise_id]

# ────────────────────────────────────────────────────────────────────────────
# Body-part name → Mixamo bone name map.
#
# Our JSON uses anatomical names ("Thigh_R", "UpperArm_L", etc.). The Mixamo
# skeleton uses "mixamorig:RightUpLeg" and friends. This table lets both
# renderers share the same animation JSON.
# ────────────────────────────────────────────────────────────────────────────
BONE_MAP = {
    "Root":       "mixamorig:Hips",       # handles loc_* as root-motion offsets
    "Torso":      "mixamorig:Spine",      # forward bend via rot_x
    "Head":       "mixamorig:Head",
    "UpperArm_R": "mixamorig:RightArm",
    "UpperArm_L": "mixamorig:LeftArm",
    "Forearm_R":  "mixamorig:RightForeArm",
    "Forearm_L":  "mixamorig:LeftForeArm",
    "Thigh_R":    "mixamorig:RightUpLeg",
    "Thigh_L":    "mixamorig:LeftUpLeg",
    "Shin_R":     "mixamorig:RightLeg",
    "Shin_L":     "mixamorig:LeftLeg",
}

# Mixamo bones generally point along their local Y axis, so a "sagittal"
# rotation (lifting leg / bending elbow / bowing torso) maps to local X
# — same as the stick-figure renderer. Sign corrections per bone let us
# reuse identical JSON keyframes.
BONE_SIGN = {
    "Torso": +1,     # rot_x positive = lean forward
    "Thigh_R": -1,   # rot_x positive (lift thigh forward) = negative on Mixamo
    "Thigh_L": -1,
    "Shin_R": +1,    # rot_x negative = bend knee
    "Shin_L": +1,
    "UpperArm_R": +1,  # rot_x positive = raise arm forward
    "UpperArm_L": +1,
    "Forearm_R": -1, # rot_x positive = bend elbow
    "Forearm_L": -1,
}

# ────────────────────────────────────────────────────────────────────────────
# Scene reset
# ────────────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Render settings
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 854
scene.render.resolution_y = 480
scene.render.fps = 24
scene.eevee.taa_render_samples = 32

FPS = 24
DURATION_SEC = anim.get("duration", 3.0)
total_frames = int(FPS * DURATION_SEC)
scene.frame_start = 1
scene.frame_end = total_frames

scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
scene.render.ffmpeg.audio_codec = "NONE"
scene.render.filepath = str(output_path)

# ────────────────────────────────────────────────────────────────────────────
# Environment (world, floor, lights, camera)
# ────────────────────────────────────────────────────────────────────────────
world = bpy.data.worlds.new("World")
world.use_nodes = True
bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
if bg is None:
    bg = world.node_tree.nodes.new("ShaderNodeBackground")
    out = world.node_tree.nodes.new("ShaderNodeOutputWorld")
    world.node_tree.links.new(bg.outputs[0], out.inputs[0])
bg.inputs[0].default_value = (0.94, 0.94, 0.96, 1)
bg.inputs[1].default_value = 1.0
scene.world = world

def set_base_color(mat, rgba):
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if out is not None:
            mat.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    target = bsdf.inputs.get("Base Color") or bsdf.inputs[0]
    target.default_value = rgba

bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "Floor"
mat_floor = bpy.data.materials.new("FloorMat")
set_base_color(mat_floor, (0.86, 0.86, 0.9, 1))
floor.data.materials.append(mat_floor)

bpy.ops.object.light_add(type="SUN", location=(3, -4, 8))
key = bpy.context.object
key.data.energy = 4.5
key.rotation_euler = (math.radians(45), math.radians(15), math.radians(25))

bpy.ops.object.light_add(type="AREA", location=(-3, -3, 4))
fill = bpy.context.object
fill.data.energy = 200
fill.data.size = 3

bpy.ops.object.camera_add(location=(0, -4.5, 1.0))
camera = bpy.context.object
camera.rotation_euler = (math.radians(88), 0, 0)
camera.data.lens = 40
scene.camera = camera

# ────────────────────────────────────────────────────────────────────────────
# Import the Xbot mesh+armature
# ────────────────────────────────────────────────────────────────────────────
print(f"Importing character from {glb_path}")
bpy.ops.import_scene.gltf(filepath=glb_path)

armature = None
for obj in scene.objects:
    if obj.type == "ARMATURE":
        armature = obj
        break
if armature is None:
    print("No armature found in the imported GLB!")
    sys.exit(1)
print(f"Armature: {armature.name}")

# Drop any imported animation data so our new keyframes start from a clean slate.
if armature.animation_data:
    armature.animation_data_clear()

# The Xbot mesh ships with a ~100 unit scale default; Mixamo also has Y-up vs Z-up
# quirks. three.js Xbot.glb is Y-up and ~2 units tall — that already works after
# gltf import because Blender's importer transforms Y-up → Z-up. Hips sit around
# z = 1.0 m, which is our target.
armature.rotation_mode = "XYZ"

# Remember rest-pose hip offset so "Root loc_z = 0" means "hips at rest height".
rest_hip_z = armature.location.z

# Ensure we're in pose mode on the armature to key poses on bones.
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="POSE")
for pb in armature.pose.bones:
    pb.rotation_mode = "XYZ"

# ────────────────────────────────────────────────────────────────────────────
# Apply keyframes from JSON
# ────────────────────────────────────────────────────────────────────────────
rest_root_loc = list(armature.location)

for kf in anim["keyframes"]:
    frame = 1 + int(kf["t"] * FPS)
    scene.frame_set(frame)
    for part_name, transforms in kf["parts"].items():
        if part_name == "Root":
            # Root motion — translate the whole armature object. This avoids
            # tangling with Hips bone's rest-pose offsets.
            if "loc_x" in transforms: armature.location.x = rest_root_loc[0] + transforms["loc_x"]
            if "loc_y" in transforms: armature.location.y = rest_root_loc[1] + transforms["loc_y"]
            if "loc_z" in transforms: armature.location.z = rest_root_loc[2] + transforms["loc_z"]
            armature.keyframe_insert(data_path="location", frame=frame)
            continue

        bone_name = BONE_MAP.get(part_name)
        if bone_name is None:
            continue
        pb = armature.pose.bones.get(bone_name)
        if pb is None:
            print(f"  warning: bone '{bone_name}' not found (mapped from '{part_name}')")
            continue

        sign = BONE_SIGN.get(part_name, 1)
        rx = math.radians(sign * transforms.get("rot_x", 0))
        ry = math.radians(transforms.get("rot_y", 0))
        rz = math.radians(transforms.get("rot_z", 0))
        pb.rotation_euler = (rx, ry, rz)
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)

# Smooth interpolation
for action in bpy.data.actions:
    for fcu in action.fcurves:
        for p in fcu.keyframe_points:
            p.interpolation = "BEZIER"
            p.handle_left_type = "AUTO_CLAMPED"
            p.handle_right_type = "AUTO_CLAMPED"

bpy.ops.object.mode_set(mode="OBJECT")

# ────────────────────────────────────────────────────────────────────────────
# Render
# ────────────────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
print(f"Rendering {exercise_id} → {output_path}  ({total_frames} frames)")
bpy.ops.render.render(animation=True)
print(f"Done. Saved to {output_path}")
