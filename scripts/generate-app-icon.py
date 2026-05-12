"""
Generate Giron app icons — Mono Gold variant.

Renders the canonical Direction A icon — golden G monogram on warm graphite —
into PNGs sized for Expo / iOS / Android / web. Source spec:
  project/release/canvas/src/giron-icons.jsx → Icon_GMono

Outputs:
  assets/icon.png            1024×1024 — main app icon (iOS, fallback Android)
  assets/adaptive-icon.png   1024×1024 — Android adaptive foreground (66% safe zone)
  assets/splash-icon.png     1024×1024 — splash logo
  assets/favicon.png         48×48     — web favicon

Run from repo root: `python scripts/generate-app-icon.py`
"""
from __future__ import annotations
import os
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

GRAPHITE = (0x0E, 0x0E, 0x0F, 255)
GOLD_TOP = (0xF4, 0xD6, 0x9E)   # 0%
GOLD_MID = (0xD4, 0xB0, 0x7A)   # 55%
GOLD_BOT = (0x8E, 0x6B, 0x3E)   # 100%


def gold_gradient(size: int) -> Image.Image:
    """Linear gradient F4D69E -> D4B07A@55% -> 8E6B3E along diagonal."""
    coords = np.indices((size, size), dtype=np.float32)
    y, x = coords[0], coords[1]
    t = np.clip((x + y) / max(2 * size - 2, 1), 0.0, 1.0)
    rgb = np.empty((size, size, 3), dtype=np.float32)
    lo = t < 0.55
    u_lo = np.where(lo, t / 0.55, 0.0)
    u_hi = np.where(lo, 0.0, (t - 0.55) / 0.45)
    for c in range(3):
        rgb[..., c] = np.where(
            lo,
            GOLD_TOP[c] + (GOLD_MID[c] - GOLD_TOP[c]) * u_lo,
            GOLD_MID[c] + (GOLD_BOT[c] - GOLD_MID[c]) * u_hi,
        )
    arr = np.dstack([rgb.astype(np.uint8), np.full((size, size), 255, dtype=np.uint8)])
    return Image.fromarray(arr, 'RGBA')


def radial_glow(size: int, cx_pct: float = 0.5, cy_pct: float = 0.4,
                radius_pct: float = 0.6, color=(0xD4, 0xB0, 0x7A),
                max_alpha: float = 0.35) -> Image.Image:
    """Soft radial gradient — gold haze fading to transparent."""
    coords = np.indices((size, size), dtype=np.float32)
    y, x = coords[0], coords[1]
    cx, cy = size * cx_pct, size * cy_pct
    r = size * radius_pct
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    falloff = np.clip(1.0 - dist / r, 0.0, 1.0)
    falloff = falloff ** 1.5
    alpha = (falloff * max_alpha * 255).astype(np.uint8)
    rgb = np.zeros((size, size, 3), dtype=np.uint8)
    rgb[..., 0] = color[0]
    rgb[..., 1] = color[1]
    rgb[..., 2] = color[2]
    return Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')


def squircle_mask(size: int, radius_pct: float = 0.2237) -> Image.Image:
    """iOS app-icon squircle mask."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(size * radius_pct)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def g_shape_mask(size: int) -> Image.Image:
    """Build the stylized G — open ring + horizontal bar — at given canvas size.

    Geometry follows giron-icons.jsx Icon_GMono exactly:
      - circle r = 32% of size, stroke 7.5%, dash 76 visible / 24 gap, rotated -30°
      - bar from x=2% to x=29% of half-size on the right of center, 7% tall, radius 1.2%
    """
    super_factor = 4
    s = size * super_factor
    mask = Image.new('L', (s, s), 0)
    draw = ImageDraw.Draw(mask)
    cx = cy = s / 2
    r = s * 0.32
    stroke = s * 0.075
    bbox = [cx - r, cy - r, cx + r, cy + r]
    # Visible 76% of 360 = 273.6°; gap 86.4°. Rotated -30°.
    # PIL arc: angles measured clockwise from 3 o'clock. Visible range starts
    # at the rotation offset (in PIL terms) and spans 273.6°.
    start = -30.0
    end = start + 360.0 * 0.76
    draw.arc(bbox, start=start, end=end, fill=255, width=int(stroke))
    # Round end caps approximation: cap circles at the two endpoints
    cap_r = stroke / 2
    for ang in (start, end):
        rad = math.radians(ang)
        ex = cx + r * math.cos(rad)
        ey = cy + r * math.sin(rad)
        draw.ellipse([ex - cap_r, ey - cap_r, ex + cap_r, ey + cap_r], fill=255)
    # Horizontal bar
    bar_left = cx + s * 0.02
    bar_right = cx + s * 0.29
    bar_top = cy - s * 0.035
    bar_bottom = cy + s * 0.035
    draw.rounded_rectangle(
        [bar_left, bar_top, bar_right, bar_bottom],
        radius=int(s * 0.012),
        fill=255,
    )
    return mask.resize((size, size), Image.LANCZOS)


def render_icon(size: int, *, with_bg: bool = True, with_squircle: bool = False,
                safe_zone: float = 1.0) -> Image.Image:
    """Compose the Mono Gold icon at `size`×`size`.

    safe_zone < 1.0 shrinks the artwork (used for adaptive icon foreground).
    with_bg=False yields transparent background (also for adaptive).
    """
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0) if not with_bg else GRAPHITE)
    if with_bg:
        base = Image.alpha_composite(base, radial_glow(size))
    art_size = int(size * safe_zone)
    art = Image.new('RGBA', (art_size, art_size), (0, 0, 0, 0))
    gold = gold_gradient(art_size)
    g_mask = g_shape_mask(art_size)
    art.paste(gold, (0, 0), g_mask)
    pad = (size - art_size) // 2
    base.alpha_composite(art, (pad, pad))
    if with_squircle:
        m = squircle_mask(size)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(base, (0, 0), m)
        return out
    return base


def main() -> None:
    os.makedirs(ASSETS, exist_ok=True)
    print('rendering icon.png (1024, full bg, square — Expo applies platform mask)')
    render_icon(1024, with_bg=True, with_squircle=False).save(
        os.path.join(ASSETS, 'icon.png'), optimize=True)
    print('rendering adaptive-icon.png (1024, transparent bg, 66% safe zone)')
    render_icon(1024, with_bg=False, safe_zone=0.66).save(
        os.path.join(ASSETS, 'adaptive-icon.png'), optimize=True)
    print('rendering splash-icon.png (1024, full bg)')
    render_icon(1024, with_bg=True, with_squircle=False).save(
        os.path.join(ASSETS, 'splash-icon.png'), optimize=True)
    print('rendering favicon.png (48, transparent bg, no squircle — browser handles)')
    render_icon(48, with_bg=True).save(
        os.path.join(ASSETS, 'favicon.png'), optimize=True)
    print('done')


if __name__ == '__main__':
    main()
