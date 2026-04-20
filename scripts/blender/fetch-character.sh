#!/bin/bash
# Fetch the Xbot humanoid GLB from the three.js examples repository.
# This is the Mixamo Y-Bot character (~2.9 MB), rigged with the full mixamorig
# skeleton and ready for pose animation in Blender.
#
# Licensing: the character is originally Mixamo content. Mixamo's EULA permits
# commercial use of downloaded characters and animations. three.js examples
# redistributes the GLB for demo purposes. Keep this in mind if you plan to
# publish a derivative work — if in doubt, re-download the same character
# directly from mixamo.com under your own Adobe account.

set -euo pipefail

TARGET_DIR="$(cd "$(dirname "$0")/../.." && pwd)/assets/3d"
TARGET_FILE="$TARGET_DIR/xbot.glb"
SOURCE_URL="https://threejs.org/examples/models/gltf/Xbot.glb"

mkdir -p "$TARGET_DIR"

if [ -f "$TARGET_FILE" ] && [ "$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE")" -gt 1000000 ]; then
  echo "✓ $TARGET_FILE already present ($(du -h "$TARGET_FILE" | cut -f1))"
  exit 0
fi

echo "→ Downloading Xbot humanoid from $SOURCE_URL"
curl -sL --fail -o "$TARGET_FILE" "$SOURCE_URL"
echo "✓ Saved to $TARGET_FILE ($(du -h "$TARGET_FILE" | cut -f1))"
