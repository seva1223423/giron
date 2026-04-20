"""
Procedurally render a short demo video of an exercise using Blender.

Runs in Blender's embedded Python via:
    blender --background --python scripts/blender/render_exercise.py -- \
        --exercise squat --output ./exercise-videos-ready/squat.mp4

Design notes:
- Builds a low-poly stick-figure style rig from primitives (no external assets).
  Body parts are cylinders + spheres parented to armature bones. 3D but
  minimalistic — reads as a "human doing X" without needing Mixamo FBXs.
- Animations live in scripts/blender/exercise-animations.json as keyed bone
  rotations. Extend that file to cover more exercises without touching Python.
- Renders 480p at 24 fps, 3 seconds — that's 72 frames, ~45 sec render time
  per video on a typical laptop CPU+EEVEE Next. For 71 exercises that's
  under an hour in total.
"""
import bpy
import json
import math
import os
import sys
from pathlib import Path

# ────────────────────────────────────────────────────────────────────────────
# CLI parsing (arguments after `--` are passed through to the script)
# ────────────────────────────────────────────────────────────────────────────
argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

exercise_id = None
output_path = None
animations_file = None
i = 0
while i < len(argv):
    if argv[i] == "--exercise" and i + 1 < len(argv):
        exercise_id = argv[i + 1]; i += 2
    elif argv[i] == "--output" and i + 1 < len(argv):
        output_path = argv[i + 1]; i += 2
    elif argv[i] == "--animations" and i + 1 < len(argv):
        animations_file = argv[i + 1]; i += 2
    else:
        i += 1

if not exercise_id or not output_path:
    print("Usage: blender --background --python render_exercise.py -- --exercise ID --output PATH [--animations FILE]")
    sys.exit(1)

script_dir = Path(__file__).resolve().parent
if not animations_file:
    animations_file = str(script_dir / "exercise-animations.json")

with open(animations_file, "r", encoding="utf-8") as f:
    animations_data = json.load(f)

if exercise_id not in animations_data:
    print(f"No animation defined for '{exercise_id}' in {animations_file}")
    sys.exit(1)

anim = animations_data[exercise_id]

# ────────────────────────────────────────────────────────────────────────────
# Scene setup — clear default cube/light/camera, create our own
# ────────────────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 854
scene.render.resolution_y = 480
scene.render.resolution_percentage = 100
scene.render.fps = 24

FPS = 24
DURATION_SEC = anim.get("duration", 3.0)
total_frames = int(FPS * DURATION_SEC)
scene.frame_start = 1
scene.frame_end = total_frames

# Output as H.264 MP4 via Blender's bundled ffmpeg
scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
scene.render.ffmpeg.audio_codec = "NONE"
scene.render.filepath = str(output_path)

def set_base_color(mat, rgba):
    """Set the base color of a material's Principled BSDF regardless of node name."""
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if out is not None:
            mat.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    # Input slot "Base Color" is stable across recent Blender versions;
    # fall back to index 0 defensively.
    if "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = rgba
    else:
        bsdf.inputs[0].default_value = rgba

# World background — light studio grey
world = scene.world or bpy.data.worlds.new("World")
world.use_nodes = True
bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
if bg is None:
    bg = world.node_tree.nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.95, 0.95, 0.97, 1)
bg.inputs[1].default_value = 1.0
scene.world = world

# Floor
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "Floor"
mat_floor = bpy.data.materials.new("FloorMat")
set_base_color(mat_floor, (0.88, 0.88, 0.9, 1))
floor.data.materials.append(mat_floor)

# Key light
bpy.ops.object.light_add(type="SUN", location=(3, -4, 8))
key_light = bpy.context.object
key_light.data.energy = 4.0
key_light.rotation_euler = (math.radians(45), math.radians(15), math.radians(25))

# Fill light
bpy.ops.object.light_add(type="AREA", location=(-3, -3, 4))
fill_light = bpy.context.object
fill_light.data.energy = 150
fill_light.data.size = 3

# Camera — side view, slightly raised, looking at the center of the figure
bpy.ops.object.camera_add(location=(0, -4.5, 1.4))
camera = bpy.context.object
camera.rotation_euler = (math.radians(85), 0, 0)
camera.data.lens = 40
scene.camera = camera

# ────────────────────────────────────────────────────────────────────────────
# Build a low-poly humanoid (figure) from primitives
#
# Segment lengths (meters):
#   head          0.25 (sphere radius 0.13)
#   neck          0.08
#   torso         0.55 (hips→shoulders)
#   upper arm     0.30
#   forearm       0.28
#   thigh         0.45
#   shin          0.42
# Total standing height ~1.75 m with hips at ~0.95 m.
# ────────────────────────────────────────────────────────────────────────────
BLUE = (0.24, 0.42, 0.84, 1)     # shirt
DARK = (0.15, 0.18, 0.24, 1)     # pants
SKIN = (0.95, 0.82, 0.70, 1)     # head/hands

mat_shirt = bpy.data.materials.new("Shirt"); set_base_color(mat_shirt, BLUE)
mat_pants = bpy.data.materials.new("Pants"); set_base_color(mat_pants, DARK)
mat_skin = bpy.data.materials.new("Skin"); set_base_color(mat_skin, SKIN)

figure_parts = {}  # name -> object reference for keyframing

def add_capsule(name, length, radius, material, location=(0, 0, 0), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=length,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    figure_parts[name] = obj
    return obj

def add_sphere(name, radius, material, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=24, ring_count=12)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    figure_parts[name] = obj
    return obj

# Hips — pivot point at 0.95m
HIPS_Z = 0.95
TORSO_LEN = 0.55
THIGH_LEN = 0.45
SHIN_LEN = 0.42
UPPER_ARM_LEN = 0.30
FOREARM_LEN = 0.28

# Torso — capsule extending up from hips
torso = add_capsule("Torso", TORSO_LEN, 0.14, mat_shirt,
                    location=(0, 0, HIPS_Z + TORSO_LEN / 2))
shoulders_z = HIPS_Z + TORSO_LEN

# Head
head = add_sphere("Head", 0.13, mat_skin,
                  location=(0, 0, shoulders_z + 0.08 + 0.13))

# Arms — offset to sides by 0.2m, hanging down
def build_arm(side):
    x = 0.22 if side == "R" else -0.22
    up = add_capsule(f"UpperArm_{side}", UPPER_ARM_LEN, 0.055, mat_shirt,
                     location=(x, 0, shoulders_z - UPPER_ARM_LEN / 2))
    # Pivot at shoulder — move origin to top of cylinder
    bpy.context.view_layer.objects.active = up
    up.select_set(True)
    scene.cursor.location = (x, 0, shoulders_z)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    up.select_set(False)

    elbow_z = shoulders_z - UPPER_ARM_LEN
    fa = add_capsule(f"Forearm_{side}", FOREARM_LEN, 0.045, mat_skin,
                     location=(x, 0, elbow_z - FOREARM_LEN / 2))
    bpy.context.view_layer.objects.active = fa
    fa.select_set(True)
    scene.cursor.location = (x, 0, elbow_z)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    fa.parent = up
    fa.matrix_parent_inverse = up.matrix_world.inverted()
    fa.select_set(False)

build_arm("R")
build_arm("L")

# Legs
def build_leg(side):
    x = 0.1 if side == "R" else -0.1
    thigh = add_capsule(f"Thigh_{side}", THIGH_LEN, 0.07, mat_pants,
                        location=(x, 0, HIPS_Z - THIGH_LEN / 2))
    bpy.context.view_layer.objects.active = thigh
    thigh.select_set(True)
    scene.cursor.location = (x, 0, HIPS_Z)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    thigh.select_set(False)

    knee_z = HIPS_Z - THIGH_LEN
    shin = add_capsule(f"Shin_{side}", SHIN_LEN, 0.055, mat_pants,
                       location=(x, 0, knee_z - SHIN_LEN / 2))
    bpy.context.view_layer.objects.active = shin
    shin.select_set(True)
    scene.cursor.location = (x, 0, knee_z)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    shin.parent = thigh
    shin.matrix_parent_inverse = thigh.matrix_world.inverted()
    shin.select_set(False)

build_leg("R")
build_leg("L")

scene.cursor.location = (0, 0, 0)

# Make the torso an Empty at hips pivot (for root motion)
bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, HIPS_Z))
root = bpy.context.object
root.name = "Root"
figure_parts["Root"] = root

# Parent torso and legs to Root; head to Torso; arms to Torso.
torso.parent = root; torso.matrix_parent_inverse = root.matrix_world.inverted()
head.parent = torso; head.matrix_parent_inverse = torso.matrix_world.inverted()
for side in ("R", "L"):
    figure_parts[f"Thigh_{side}"].parent = root
    figure_parts[f"Thigh_{side}"].matrix_parent_inverse = root.matrix_world.inverted()
    figure_parts[f"UpperArm_{side}"].parent = torso
    figure_parts[f"UpperArm_{side}"].matrix_parent_inverse = torso.matrix_world.inverted()

# Move torso pivot to hips too so its z=0 local = hips level
bpy.context.view_layer.objects.active = torso
torso.select_set(True)
scene.cursor.location = root.location
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
torso.select_set(False)
scene.cursor.location = (0, 0, 0)

# ────────────────────────────────────────────────────────────────────────────
# Keyframing from JSON animation data
#
# Format:
# {
#   "squat": {
#     "duration": 3.0,
#     "keyframes": [
#       { "t": 0.0, "parts": { "Root": {"loc_z": 0}, "Thigh_R": {"rot_x": 0}, ... }},
#       { "t": 0.5, "parts": { ... }},
#       ...
#     ]
#   }
# }
#
# Transforms are applied as deltas vs. the rest pose:
#   loc_x/y/z  — offset from initial location (meters)
#   rot_x/y/z  — rotation in degrees around local axis (added to 0)
#   scale      — uniform scale multiplier
# ────────────────────────────────────────────────────────────────────────────
rest_locations = {name: list(obj.location) for name, obj in figure_parts.items()}

for kf in anim["keyframes"]:
    frame = 1 + int(kf["t"] * FPS)
    for part_name, transforms in kf["parts"].items():
        obj = figure_parts.get(part_name)
        if obj is None:
            print(f"  warning: unknown part '{part_name}'")
            continue
        rest = rest_locations[part_name]
        if "loc_x" in transforms: obj.location.x = rest[0] + transforms["loc_x"]
        if "loc_y" in transforms: obj.location.y = rest[1] + transforms["loc_y"]
        if "loc_z" in transforms: obj.location.z = rest[2] + transforms["loc_z"]
        if any(k in transforms for k in ("rot_x", "rot_y", "rot_z")):
            obj.rotation_euler = (
                math.radians(transforms.get("rot_x", 0)),
                math.radians(transforms.get("rot_y", 0)),
                math.radians(transforms.get("rot_z", 0)),
            )
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)

# Smoother interpolation
for action in bpy.data.actions:
    for fcu in action.fcurves:
        for p in fcu.keyframe_points:
            p.interpolation = "BEZIER"
            p.handle_left_type = "AUTO_CLAMPED"
            p.handle_right_type = "AUTO_CLAMPED"

# ────────────────────────────────────────────────────────────────────────────
# Render
# ────────────────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
print(f"Rendering {exercise_id} → {output_path}  ({total_frames} frames)")
bpy.ops.render.render(animation=True)
print(f"Done. Saved to {output_path}")
