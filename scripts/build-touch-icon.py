"""Render assets/apple-touch-icon.png (180x180) from the favicon.svg design.

iOS ignores SVG for home-screen icons and wants an opaque square PNG —
it rounds the corners itself, so the background runs full-bleed here.
Shapes mirror assets/favicon.svg (64-unit grid); drawn at 8x and downsampled.

    python scripts/build-touch-icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 180, 8
S = SIZE * SS / 64          # favicon units -> supersampled px

def r(v): return round(v * S)

img = Image.new("RGB", (SIZE * SS, SIZE * SS), "#1c1633")
d = ImageDraw.Draw(img)

def rect(x, y, w, h, rad, fill):
    d.rounded_rectangle([r(x), r(y), r(x + w), r(y + h)], radius=r(rad), fill=fill)

def circle(cx, cy, rad, fill):
    d.ellipse([r(cx - rad), r(cy - rad), r(cx + rad), r(cy + rad)], fill=fill)

rect(14, 10, 36, 30, 4, "#ffd34d")   # cabinet
rect(18, 14, 28, 18, 2, "#1c1633")   # screen
circle(25, 23, 3, "#3ddc97")
circle(39, 23, 3, "#ff5d73")
rect(20, 42, 24, 6, 2, "#8a7bd8")    # control panel
rect(24, 48, 16, 8, 2, "#ffd34d")    # base

out = Path(__file__).resolve().parent.parent / "assets" / "apple-touch-icon.png"
img.resize((SIZE, SIZE), Image.LANCZOS).save(out, optimize=True)
print(f"wrote {out}")
