#!/usr/bin/env python3
"""© 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
Licencja: /LICENSE, /licencja

Generuje ikony Androida (mipmapy, ikonę adaptacyjną i podgląd na stronę)
z tego samego kształtu, co logo RejHuba (`rejhub2/hub/brand-mark.svg`).

Dlaczego własny renderer: w środowisku budowania nie ma librsvg ani cairo,
więc SVG nie da się po prostu przekonwertować. Ścieżka logo używa tylko
poleceń M/L/H/V/C/Z (także w wersji względnej), więc wystarczy je spłaszczyć
i wypełnić wielokątem.

Uruchomienie:
    python3 scripts/make-android-icons.py
Wymaga Pillow (`pip install pillow`).
"""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "mobile/android/app/src/main/res"
BRAND = ROOT / "rejhub2/hub/brand-mark.svg"
SITE_ICON = ROOT / "rejhub2/app/icon.png"

# Gęstości mipmap Androida: nazwa katalogu -> mnożnik względem 48 dp
DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}

# Paleta RejHuba — bez zieleni (orb w logo ma tu błękit, nie turkus).
BG_TOP = (11, 17, 26)
BG_BOTTOM = (4, 7, 11)
GLOW = (48, 92, 168)
MARK_TOP = (255, 255, 255)
MARK_BOTTOM = (178, 208, 255)
ORB = (159, 196, 255)
SUPERSAMPLE = 4


# --------------------------------------------------------------------- SVG

TOKEN = re.compile(r"[MmLlHhVvCcSsZz]|-?\d*\.?\d+(?:e[-+]?\d+)?")


def path_parts(d: str):
    """Dzieli `d` na podścieżki i spłaszcza krzywe do punktów.

    Obsługiwane są wszystkie polecenia z logo: M/L/H/V/C/S/Z, także
    w wersji względnej (małe litery) i z powtarzanymi parami.
    """
    tokens = TOKEN.findall(d)
    parts, current = [], []
    x = y = 0.0
    start = (0.0, 0.0)
    last_ctrl = None
    cmd = None
    i = 0

    def num():
        nonlocal i
        value = float(tokens[i])
        i += 1
        return value

    def curve(x0, y0, x1, y1, x2, y2, x3, y3, steps=48):
        points = []
        for step in range(1, steps + 1):
            t = step / steps
            u = 1 - t
            points.append((
                u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3,
                u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3,
            ))
        return points

    while i < len(tokens):
        token = tokens[i]
        if token in "MmLlHhVvCcSsZz":
            cmd = token
            i += 1
            if cmd in "Mm":
                nx, ny = num(), num()
                x, y = (nx, ny) if cmd == "M" else (x + nx, y + ny)
                start = (x, y)
                if current:
                    parts.append(current)
                current = [(x, y)]
                last_ctrl = None
            elif cmd in "Zz":
                if current:
                    current.append(start)
                    parts.append(current)
                current = []
                x, y = start
                last_ctrl = None
            continue

        if cmd in "Mm":
            nx, ny = num(), num()
            x, y = (nx, ny) if cmd == "M" else (x + nx, y + ny)
            current.append((x, y))
            last_ctrl = None
        elif cmd in "Ll":
            nx, ny = num(), num()
            x, y = (nx, ny) if cmd == "L" else (x + nx, y + ny)
            current.append((x, y))
            last_ctrl = None
        elif cmd in "Hh":
            nx = num()
            x = nx if cmd == "H" else x + nx
            current.append((x, y))
            last_ctrl = None
        elif cmd in "Vv":
            ny = num()
            y = ny if cmd == "V" else y + ny
            current.append((x, y))
            last_ctrl = None
        elif cmd in "Cc":
            pts = [num() for _ in range(6)]
            if cmd == "c":
                pts = [pts[0] + x, pts[1] + y, pts[2] + x, pts[3] + y, pts[4] + x, pts[5] + y]
            current.extend(curve(x, y, *pts))
            last_ctrl = (pts[2], pts[3])
            x, y = pts[4], pts[5]
        elif cmd in "Ss":
            pts = [num() for _ in range(4)]
            if cmd == "s":
                pts = [pts[0] + x, pts[1] + y, pts[2] + x, pts[3] + y]
            if last_ctrl:
                c1 = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1])
            else:
                c1 = (x, y)
            current.extend(curve(x, y, c1[0], c1[1], pts[0], pts[1], pts[2], pts[3]))
            last_ctrl = (pts[0], pts[1])
            x, y = pts[2], pts[3]
        else:
            i += 1

    if current:
        parts.append(current)
    return parts


def brand_paths():
    svg = BRAND.read_text(encoding="utf-8")
    ds = re.findall(r'\sd="([^"]+)"', svg)
    circle = re.search(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', svg)
    orb = tuple(float(value) for value in circle.groups()) if circle else None
    return [path_parts(d) for d in ds], orb


# ------------------------------------------------------------------- rysunek

def gradient(size, top, bottom):
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for row in range(size):
        t = row / max(1, size - 1)
        draw.line(
            [(0, row), (size, row)],
            fill=tuple(round(top[c] + (bottom[c] - top[c]) * t) for c in range(3)),
        )
    return image


def glow(size):
    """Miękka plama światła za logo — bez gradientów promienistych w SVG."""
    layer = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(layer)
    cx, cy = size * 0.5, size * 0.42
    radius = size * 0.46
    steps = 26
    for step in range(steps, 0, -1):
        t = step / steps
        draw.ellipse(
            [cx - radius * t, cy - radius * t, cx + radius * t, cy + radius * t],
            fill=int(56 * (1 - t) ** 1.6),
        )
    return layer


def brand_geometry():
    """Obrys znaku (ścieżka + kropka) i jego rzeczywiste granice.

    Liczymy granice po punktach, a nie po viewBoxie: litera R zajmuje tylko
    środek kwadratu 64×64, więc skalowanie viewBoxa zostawiało za mały znak
    na ikonie adaptacyjnej.
    """
    paths, orb = brand_paths()
    body = paths[0]
    xs = [x for part in body for x, _ in part]
    ys = [y for part in body for _, y in part]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    if orb:
        cx, cy, radius = orb
        left, right = min(left, cx - radius), max(right, cx + radius)
        top, bottom = min(top, cy - radius), max(bottom, cy + radius)
    return body, orb, (left, top, right, bottom)


def transform(size, width_ratio, padding_ratio=0.0):
    """Skala i przesunięcie: znak zajmuje `width_ratio` szerokości ikony."""
    body, orb, (left, top, right, bottom) = brand_geometry()
    area = size * (1 - padding_ratio * 2)
    scale = (area * width_ratio) / max(1e-6, right - left)
    offset = (size - area) / 2
    # Środek obrysu na środek ikony.
    tx = offset + (area - (right - left) * scale) / 2 - left * scale
    ty = offset + (area - (bottom - top) * scale) / 2 - top * scale
    return body, orb, scale, tx, ty


def mark_layer(size, width_ratio, padding_ratio, box):
    """Warstwa z literą R (kolor nadany później gradientem)."""
    mask = Image.new("L", (box * SUPERSAMPLE, box * SUPERSAMPLE), 0)
    draw = ImageDraw.Draw(mask)
    body, _, scale, tx, ty = transform(size, width_ratio, padding_ratio)
    factor = box * SUPERSAMPLE / size

    def points(part):
        return [((tx + px * scale) * factor, (ty + py * scale) * factor) for px, py in part]

    # Pierwszy podobszar to korpus litery, drugi — otwór w brzuszku.
    # Otwór wycinamy, malując go zerem (kształt ma dokładnie dwa podobszary).
    draw.polygon(points(body[0]), fill=255)
    for hole in body[1:]:
        draw.polygon(points(hole), fill=0)
    return mask.resize((box, box), Image.LANCZOS)


def draw_icon(size, width_ratio=0.52, padding_ratio=0.0, rounded=True, base=True):
    """Ikona: ciemne tło, subtelna poświata, litera R i błękitna kropka.

    `base=False` daje sam znak na przezroczystym tle — tyle potrzebuje ikona
    adaptacyjna, której tło bierze się z `ic_launcher_background.xml`.
    """
    if base:
        image = gradient(size, BG_TOP, BG_BOTTOM).convert("RGBA")
    else:
        image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Kolor poświaty: GLOW z siłą z kanału alfa.
    tint = Image.new("RGBA", (size, size), GLOW + (0,))
    strength = 1.0 if base else 1.5
    tint.putalpha(glow(size).point(lambda value: min(255, int(value * strength))))
    image.alpha_composite(tint)

    mask = mark_layer(size, width_ratio, padding_ratio, size)
    mark = gradient(size, MARK_TOP, MARK_BOTTOM).convert("RGBA")
    mark.putalpha(mask)
    image.alpha_composite(mark)

    _, orb, scale, tx, ty = transform(size, width_ratio, padding_ratio)
    if orb:
        cx, cy, radius = orb
        ox, oy, dot = tx + cx * scale, ty + cy * scale, radius * scale
        draw = ImageDraw.Draw(image)
        draw.ellipse([ox - dot, oy - dot, ox + dot, oy + dot], fill=ORB + (255,))

    if rounded:
        radius = round(size * 0.22)
        rounded_mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(rounded_mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=radius, fill=255
        )
        image.putalpha(rounded_mask)
    return image


def write(image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main():
    # 1. Klasyczne ikony (kwadratowe i okrągłe) + podgląd na stronę.
    for name, factor in DENSITIES.items():
        legacy = round(48 * factor)
        square = draw_icon(legacy * 4).resize((legacy, legacy), Image.LANCZOS)
        write(square, RES / f"mipmap-{name}/ic_launcher.png")

        circle_mask = Image.new("L", (legacy * 4, legacy * 4), 0)
        ImageDraw.Draw(circle_mask).ellipse(
            [0, 0, legacy * 4 - 1, legacy * 4 - 1], fill=255
        )
        round_icon = draw_icon(legacy * 4, rounded=False)
        round_icon.putalpha(circle_mask)
        write(round_icon.resize((legacy, legacy), Image.LANCZOS),
              RES / f"mipmap-{name}/ic_launcher_round.png")

        # Ikona adaptacyjna: 108 dp, logo w bezpiecznej strefie 66 dp.
        adaptive = round(108 * factor)
        foreground = draw_icon(adaptive * 2, padding_ratio=0.20,
                               rounded=False, base=False)
        write(foreground.resize((adaptive, adaptive), Image.LANCZOS),
              RES / f"mipmap-{name}/ic_launcher_foreground.png")

    write(draw_icon(512), SITE_ICON)

    # 2. Adaptacyjne tło = kolor tła aplikacji.
    background = RES / "values/ic_launcher_background.xml"
    background.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#0B111A</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print("Ikony Androida gotowe:", RES, "i", SITE_ICON)


if __name__ == "__main__":
    main()
