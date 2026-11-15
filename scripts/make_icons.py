#!/usr/bin/env python3
"""
make_icons.py- regenerate the PWA / home-screen icons in public/icons/.

The icons are a white paw on the app's purple-to-pink gradient (--primary to
--accent in public/styles.css). They are generated rather than hand-drawn so a
future change of palette is a one-line edit here plus a re-run, instead of a
round trip through an image editor.

    python3 scripts/make_icons.py

Two shapes are produced, because Android and iOS mask icons differently:

  icon-<n>.png           full-bleed, paw at 62%- the "any" purpose
  icon-maskable-<n>.png  full-bleed, paw at 52%- keeps the paw inside the
                         maskable safe zone (the centre circle of 80%
                         diameter) that Android crops to
  apple-touch-icon.png   180px, full-bleed; iOS applies its own squircle mask,
                         so this one carries no rounding or transparency

Everything is drawn at 4x and downsampled with LANCZOS, which is what gives the
curves their antialiasing- PIL's draw calls are hard-edged on their own.
"""

import colorsys
from pathlib import Path

from PIL import Image, ImageDraw

ICON_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"

# --primary and --accent from public/styles.css, as (hue, saturation%, lightness%).
GRADIENT_FROM = (270, 60, 55)
GRADIENT_TO = (340, 80, 60)

SS = 4  # supersampling factor


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return (round(r * 255), round(g * 255), round(b * 255))


def gradient(size):
    """Diagonal gradient, top-left GRADIENT_FROM to bottom-right GRADIENT_TO."""
    start, end = hsl(*GRADIENT_FROM), hsl(*GRADIENT_TO)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            # Normalised diagonal position, so the sweep runs corner to corner.
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(s + (e - s) * t) for s, e in zip(start, end))
    return img


def draw_paw(img, paw_fraction):
    """White paw print centred on img, occupying paw_fraction of its width."""
    size = img.size[0]
    d = ImageDraw.Draw(img)
    paw = size * paw_fraction
    cx = size / 2
    # Nudged down a touch: the toes sit above the pad, so the visual centre of
    # mass is higher than the geometric one.
    cy = size / 2 + paw * 0.06
    white = (255, 255, 255)

    def ellipse(ecx, ecy, w, h):
        d.ellipse([ecx - w / 2, ecy - h / 2, ecx + w / 2, ecy + h / 2], fill=white)

    # Main pad: a wide ellipse, slightly flattened.
    ellipse(cx, cy + paw * 0.18, paw * 0.58, paw * 0.47)

    # Four toes in an arc above the pad. Offsets are fractions of the paw size:
    # (x, y, width, height)- the outer pair sit lower and are a little smaller,
    # which is what reads as a paw rather than four dots in a row.
    toes = [
        (-0.350, -0.110, 0.215, 0.275),
        (-0.131, -0.260, 0.225, 0.290),
        (+0.131, -0.260, 0.225, 0.290),
        (+0.350, -0.110, 0.215, 0.275),
    ]
    for dx, dy, w, h in toes:
        ellipse(cx + paw * dx, cy + paw * dy, paw * w, paw * h)


def make_icon(size, paw_fraction):
    img = gradient(size * SS)
    draw_paw(img, paw_fraction)
    return img.resize((size, size), Image.LANCZOS)


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    written = []

    for size in (192, 512):
        path = ICON_DIR / f"icon-{size}.png"
        make_icon(size, 0.62).save(path, optimize=True)
        written.append(path)

        path = ICON_DIR / f"icon-maskable-{size}.png"
        make_icon(size, 0.52).save(path, optimize=True)
        written.append(path)

    path = ICON_DIR / "apple-touch-icon.png"
    make_icon(180, 0.62).save(path, optimize=True)
    written.append(path)

    for p in written:
        print(f"{p.relative_to(ICON_DIR.parent.parent)}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
