#!/bin/bash
# Batch-process exercise demo videos for Iron Gym.
#
# Usage:
#   ./scripts/process-exercise-videos.sh ~/iron-gym-raw ~/iron-gym-processed
#
# Input:  folder with raw .mov/.mp4/.MOV/.MP4 files, named like squat.mov, deadlift.mov.
# Output: folder with web-optimized 480p .mp4 + .jpg poster for each.
# Filenames (without extension) become exercise IDs — they must match src/data/exercises.ts.
#
# Prerequisites: ffmpeg on PATH.

set -euo pipefail

SRC_DIR="${1:-$HOME/iron-gym-raw}"
OUT_DIR="${2:-$HOME/iron-gym-processed}"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: input directory '$SRC_DIR' does not exist." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# ffmpeg scale filter: fit into 854×480 keeping aspect, pad with black if needed.
SCALE='scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2'
COUNT=0

for src in "$SRC_DIR"/*.{mov,MOV,mp4,MP4}; do
  [ -e "$src" ] || continue
  name=$(basename "$src" | sed 's/\.[^.]*$//')
  out_mp4="$OUT_DIR/$name.mp4"
  out_jpg="$OUT_DIR/$name.jpg"

  echo "→ $name"
  ffmpeg -loglevel error -y -i "$src" \
    -vf "$SCALE" \
    -c:v libx264 -preset slow -crf 24 \
    -c:a aac -b:a 96k \
    -movflags +faststart \
    "$out_mp4"

  ffmpeg -loglevel error -y -i "$out_mp4" \
    -ss 00:00:01 -vframes 1 -q:v 3 \
    "$out_jpg"

  COUNT=$((COUNT + 1))
done

echo
echo "Processed $COUNT videos → $OUT_DIR"
echo "Next: upload with"
echo "  aws --profile yandex --endpoint-url=https://storage.yandexcloud.net s3 sync \\"
echo "    $OUT_DIR/ s3://iron-gym-media/exercises/ \\"
echo "    --cache-control 'public, max-age=2592000' --content-type-by-suffix"
