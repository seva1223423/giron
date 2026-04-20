"""
Batch-render every exercise that has a definition in exercise-animations.json.

Run via:
    blender --background --python scripts/blender/render_all.py -- \
        --output-dir ./exercise-videos-rendered

Or skip already-rendered files:
    blender --background --python scripts/blender/render_all.py -- \
        --output-dir ./exercise-videos-rendered --skip-existing

Each exercise runs inside the same Blender process but in an isolated scene
(load the factory startup after each render) — no cross-contamination.
"""
import bpy
import json
import os
import sys
import subprocess
import time
from pathlib import Path

argv = sys.argv
if "--" in argv:
    argv = argv[argv.index("--") + 1:]
else:
    argv = []

output_dir = "./exercise-videos-rendered"
skip_existing = False
renderer = "mixamo"  # 'mixamo' (Xbot skinned mesh) or 'capsule' (stick-figure primitives)
i = 0
while i < len(argv):
    if argv[i] == "--output-dir" and i + 1 < len(argv):
        output_dir = argv[i + 1]; i += 2
    elif argv[i] == "--skip-existing":
        skip_existing = True; i += 1
    elif argv[i] == "--renderer" and i + 1 < len(argv):
        renderer = argv[i + 1]; i += 2
    else:
        i += 1

render_script_name = "render_exercise_mixamo.py" if renderer == "mixamo" else "render_exercise.py"

script_dir = Path(__file__).resolve().parent
animations_file = script_dir / "exercise-animations.json"
with open(animations_file, "r", encoding="utf-8") as f:
    animations = json.load(f)

exercise_ids = [k for k in animations.keys() if not k.startswith("_")]

os.makedirs(output_dir, exist_ok=True)

# We delegate each exercise to a fresh Blender subprocess to guarantee clean
# scene state (materials, objects, world all start fresh) and so that a crash
# on one exercise doesn't take down the whole batch.
blender_exe = bpy.app.binary_path
render_script = str(script_dir / render_script_name)

start = time.time()
total = len(exercise_ids)
succeeded = []
failed = []

for idx, ex_id in enumerate(exercise_ids, 1):
    out_path = os.path.join(output_dir, f"{ex_id}.mp4")
    if skip_existing and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        print(f"[{idx}/{total}] ✓ {ex_id} (exists, skip)")
        succeeded.append(ex_id)
        continue

    t0 = time.time()
    print(f"[{idx}/{total}] → {ex_id}")
    proc = subprocess.run(
        [blender_exe, "--background", "--python", render_script, "--",
         "--exercise", ex_id, "--output", out_path],
        capture_output=True, text=True,
    )
    dt = time.time() - t0
    if proc.returncode == 0 and os.path.exists(out_path):
        size_kb = os.path.getsize(out_path) / 1024
        print(f"    ok, {size_kb:.0f} KB, {dt:.1f}s")
        succeeded.append(ex_id)
    else:
        print(f"    FAILED after {dt:.1f}s")
        print(proc.stdout[-400:] if proc.stdout else "")
        print(proc.stderr[-400:] if proc.stderr else "")
        failed.append(ex_id)

total_dt = time.time() - start
print(f"\n─── Batch complete in {total_dt:.1f}s ─────────────")
print(f"Succeeded: {len(succeeded)}")
print(f"Failed:    {len(failed)}{' (' + ', '.join(failed) + ')' if failed else ''}")
print(f"Output:    {os.path.abspath(output_dir)}")
