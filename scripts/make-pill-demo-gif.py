#!/usr/bin/env python3
"""Generuje assets/posts/pill-animacja.gif — pokaz płynnej animacji pigułki
„Zgłoś błąd / pomysł" (rejson-widgets): kliknięcie i morfowanie w panel.

Styl odwzorowany z rejson-widgets/widget.js (tryb ciemny):
  pigułka  rgba(18,24,36,.86) + obramowanie rgba(122,178,255,.32)
  panel    rgba(15,19,27,.74), ramka ze szkła, akcent #7ab2ff

Wymaga Pillow:  pip install pillow
Uruchomienie:   python3 scripts/make-pill-demo-gif.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 560, 380
OUT = Path(__file__).resolve().parent.parent / "assets" / "posts" / "pill-animacja.gif"

ACCENT = (122, 178, 255)
INK = (244, 247, 252)
MUTED = (235, 242, 255)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
F_LABEL = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 15)
F_PANEL = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 12)
F_SMALL = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 10)
F_SMALL_B = ImageFont.truetype(str(FONT_DIR / "DejaVuSans-Bold.ttf"), 10)
F_TITLE = ImageFont.truetype(str(FONT_DIR / "DejaVuSans-Bold.ttf"), 13)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp3(a, b, t):
    return tuple(int(round(lerp(x, y, t))) for x, y in zip(a, b))


def ease_out(t):
    return 1 - (1 - t) ** 3.2


def rounded_glow(draw_target, box, radius, color, glow_steps=4, glow_alpha=16):
    """Miękka poświata wokół zaokrąglonego prostokąta."""
    overlay = Image.new("RGBA", draw_target.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(glow_steps, 0, -1):
        pad = i * 3
        od.rounded_rectangle(
            [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad],
            radius=radius + pad,
            outline=color[:3] + (glow_alpha,),
            width=2,
        )
    blurred = overlay.filter(ImageFilter.GaussianBlur(3))
    draw_target.alpha_composite(blurred)


def make_background():
    """Ciemne tło strony z akcentową poświatą (jak .backdrop strony)."""
    top = (11, 14, 19)
    bottom = (18, 24, 36)
    img = Image.new("RGBA", (W, H))
    for y in range(H):
        img.paste(lerp3(top, bottom, y / H), (0, y, W, y + 1))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([-140, -160, 220, 160], fill=(47, 109, 246, 26))
    od.ellipse([W - 200, H - 150, W + 140, H + 150], fill=(139, 92, 246, 22))
    overlay = overlay.filter(ImageFilter.GaussianBlur(40))
    img.alpha_composite(overlay)
    # delikatna górna linia jak pod headerem strony
    d = ImageDraw.Draw(img)
    d.line([0, 1, W, 1], fill=(148, 163, 184, 28), width=2)
    return img


def draw_cursor(img, x, y):
    """Prosty biały kursor-strzałka z ciemnym obrysem."""
    pts = [(x, y), (x, y + 17), (x + 4.6, y + 12.4), (x + 7.4, y + 18.4),
           (x + 10, y + 16.9), (x + 7.2, y + 11.2), (x + 12.6, y + 11.2)]
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    overlay.paste((18, 24, 38, 160), [int(x - 3), int(y - 3), int(x + 20), int(y + 24)])
    overlay = overlay.filter(ImageFilter.GaussianBlur(5))
    img.alpha_composite(overlay)
    ImageDraw.Draw(img).polygon(pts, fill=(255, 255, 255, 250), outline=(15, 23, 42, 255))


def draw_pill(img, box, radius, label_alpha=255, press=0.0):
    """Pigułka widżetu: kropka + etykieta. press=1 lekko ją ściska."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    if press:
        shrink_x = bw * 0.02 * press
        shrink_y = bh * 0.035 * press
        x0 += shrink_x
        y0 += shrink_y
        x1 -= shrink_x
        y1 -= shrink_y
        box = (x0, y0, x1, y1)
        bw, bh = x1 - x0, y1 - y0

    rounded_glow(img, box, radius, ACCENT)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=(18, 24, 36, 232),
                        outline=ACCENT + (110,), width=2)

    cy = (y0 + y1) / 2
    dot_x = x0 + 19
    dot_r = 4.5
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([dot_x - 8, cy - 8, dot_x + 8, cy + 8], fill=ACCENT + (70,))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(3)))
    d = ImageDraw.Draw(img)
    d.ellipse([dot_x - dot_r, cy - dot_r, dot_x + dot_r, cy + dot_r], fill=ACCENT + (255,))

    if label_alpha > 4:
        d.text((dot_x + 11, cy), "Zgłoś błąd / pomysł", font=F_LABEL,
               fill=INK + (label_alpha,), anchor="lm")


def draw_panel(img, box, radius, content_t):
    """Rozwinięty panel: segmenty, wiersz projektu, textarea, nick, Wyślij."""
    x0, y0, x1, y1 = box
    rounded_glow(img, box, radius, (0, 0, 0), glow_steps=3, glow_alpha=10)
    d = ImageDraw.Draw(img)
    # wypełnienie rysujemy OD RAZU (widać, jak „to samo szkło" rośnie z pigułki)
    pw = x1 - x0
    closedness = max(0.0, 1.0 - (pw - 212) / 90.0)  # 1 = szerokość pigułki, 0 = pełny panel
    fill_alpha = int(lerp(232, 237, 1 - closedness))
    d.rounded_rectangle(box, radius=radius, fill=(16, 20, 28, fill_alpha))
    rim_alpha = int(lerp(110, 34, 1 - closedness))
    rim_col = ACCENT if closedness > 0.5 else (255, 255, 255)
    d.rounded_rectangle(box, radius=radius, outline=rim_col + (rim_alpha,), width=2 if closedness > 0.5 else 1)

    a = int(255 * content_t)
    if a <= 6:
        return

    # Wnętrze rysujemy na osobnej warstwie i TNEMY do wnętrza panelu (padding po ramce),
    # więc nic nigdy nie wystaje poza szkło
    inner = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(inner)
    pad = 14
    cx = x0 + pad
    cy = y0 + pad + 6

    # --- segmentowany przełącznik Błąd / Pomysł ---
    seg_w, seg_h = 168, 30
    seg = [cx, cy, cx + seg_w, cy + seg_h]
    d.rounded_rectangle(seg, radius=seg_h / 2, fill=(255, 255, 255, 14),
                        outline=(255, 255, 255, 30), width=1)
    half = seg_w / 2
    d.rounded_rectangle([cx + 3, cy + 3, cx + half - 2, cy + seg_h - 3],
                        radius=(seg_h - 6) / 2, fill=(255, 255, 255, 38),
                        outline=(255, 255, 255, 46), width=1)
    d.text((cx + half / 2, cy + seg_h / 2), "Błąd", font=F_TITLE,
           fill=INK + (a,), anchor="mm")
    d.text((cx + half + half / 2, cy + seg_h / 2), "Pomysł", font=F_PANEL,
           fill=MUTED + (int(a * 0.62),), anchor="mm")

    # ikony po prawej (tablica, zamknij)
    bx = x1 - pad - 24
    for i, glyph in enumerate(["✕", "▦"]):
        gx = bx - i * 32
        d.rounded_rectangle([gx - 12, cy + 3, gx + 12, cy + 27], radius=8,
                            fill=(255, 255, 255, 10))
        d.text((gx, cy + 15), glyph, font=F_SMALL, fill=MUTED + (int(a * 0.62),), anchor="mm")

    # --- wiersz projektu ---
    py = cy + seg_h + 16
    d.text((cx, py + 10), "Projekt:", font=F_SMALL, fill=MUTED + (int(a * 0.7),), anchor="lm")
    sel = [cx + 56, py, cx + 176, py + 21]
    d.rounded_rectangle(sel, radius=7, fill=(255, 255, 255, 12),
                        outline=(255, 255, 255, 26), width=1)
    d.text((sel[0] + 8, (sel[1] + sel[3]) / 2), "rejson-widgets ▾", font=F_SMALL,
           fill=INK + (int(a * 0.9),), anchor="lm")

    # --- textarea ---
    ty = py + 36
    ta = [cx, ty, x1 - pad, ty + 84]
    d.rounded_rectangle(ta, radius=10, fill=(255, 255, 255, 9),
                        outline=(255, 255, 255, 24), width=1)
    d.text((ta[0] + 10, ta[1] + 12), "Opisz krótko co nie działa albo jaki",
           font=F_SMALL, fill=MUTED + (int(a * 0.38),))
    d.text((ta[0] + 10, ta[1] + 27), "wystąpił błąd…", font=F_SMALL,
           fill=MUTED + (int(a * 0.38),))

    # --- dół: nick + Wyślij ---
    by = ta[3] + 16
    nick = [cx, by, cx + 150, by + 28]
    d.rounded_rectangle(nick, radius=999, fill=(255, 255, 255, 9),
                        outline=(255, 255, 255, 22), width=1)
    d.text((nick[0] + 12, (nick[1] + nick[3]) / 2), "Nick (opcjonalnie)",
           font=F_SMALL, fill=MUTED + (int(a * 0.38),), anchor="lm")
    btn = [x1 - pad - 96, by, x1 - pad, by + 28]
    d.rounded_rectangle(btn, radius=999, fill=(244, 247, 252, a))
    d.text(((btn[0] + btn[2]) / 2, (btn[1] + btn[3]) / 2), "Wyślij",
           font=F_SMALL_B, fill=(11, 15, 23, a), anchor="mm")

    # dokadnie wnętrza do powierzchni panelu (ramka 30 px marginesu co do krawędzi)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [x0 + 2, y0 + 2, x1 - 2, y1 - 2], radius=max(2, radius - 2), fill=255)
    inner.putalpha(Image.composite(inner.getchannel("A"), Image.new("L", img.size, 0), mask))
    img.alpha_composite(inner)


def frame(pill_box, pill_radius, label_alpha=255, press=0.0,
          panel_box=None, content_t=0.0, cursor=None, caption=True):
    img = make_background()
    if panel_box is not None:
        # ta sama „powierzchnia szkła" rośnie z pigułki w panel
        draw_panel(img, panel_box, pill_radius, content_t)
        if label_alpha > 4:
            # etykieta pigułki zanika, pozostając wyśrodkowana w rosnącym szkle
            d = ImageDraw.Draw(img)
            bx0, by0, bx1, by1 = panel_box
            cy = (by0 + by1) / 2
            tw = d.textlength("Zgłoś błąd / pomysł", font=F_LABEL)
            tx = (bx0 + bx1) / 2 - tw / 2
            dot_x = tx - 11
            d.ellipse([dot_x - 4, cy - 4, dot_x + 4, cy + 4], fill=ACCENT + (label_alpha,))
            d.text((tx, cy), "Zgłoś błąd / pomysł", font=F_LABEL,
                   fill=INK + (label_alpha,), anchor="lm")
    else:
        draw_pill(img, pill_box, pill_radius, label_alpha=label_alpha, press=press)
        if caption:
            d = ImageDraw.Draw(img)
            cx = (pill_box[0] + pill_box[2]) / 2
            d.text((cx, pill_box[3] + 15), "Rejson widgets", font=F_SMALL,
                   fill=MUTED + (95,), anchor="mm")
    if cursor:
        draw_cursor(img, cursor[0], cursor[1])
    return img


def main():
    # pozycja docelowa pigułki: prawy dolny róg
    px1, py1 = W - 26, H - 34
    pill_w, pill_h = 212, 46
    pill = (px1 - pill_w, py1 - pill_h, px1, py1)

    panel_w, panel_h = 344, 246
    panel = (px1 - panel_w, py1 - panel_h, px1, py1)

    frames = []
    durs = []

    def add(img, dur):
        frames.append(img.convert("P", palette=Image.ADAPTIVE, colors=256))
        durs.append(dur)

    # 1. Pigułka sama (pauza)
    f = frame(pill, 23)
    add(f, 750)
    add(f, 130)

    # 2. Kursor podjeżdża
    for i, t in enumerate((0.0, 0.5, 1.0)):
        cx0 = pill[0] - 190 + 150 * t + 20 * t
        cy0 = pill[3] + 60 - 46 * t
        add(frame(pill, 23, cursor=(cx0, cy0)), 110)

    # 3. Kliknięcie (przyciśnięcie + rozbłysk kropki)
    add(frame(pill, 23, press=1.0, cursor=(pill[0] + 26, pill[1] + 26)), 120)

    # 4. Morfowanie pigułki w panel (5 klatek)
    morph = (0.16, 0.42, 0.68, 0.88, 1.0)
    for t in morph:
        e = ease_out(t)
        box = tuple(lerp(p, q, e) for p, q in zip(pill, panel))
        radius = lerp(23, 16, e)
        alpha = max(0, int(255 * (1 - t * 1.6)))
        content_t = max(0.0, (t - 0.55) / 0.45) if t > 0.55 else 0.0
        add(frame(pill, radius, label_alpha=alpha, panel_box=box,
                  content_t=content_t, cursor=(pill[0] + 26, pill[1] + 26)), 105)

    # 5. Gotowy panel — sprzątamy kursor (odjeżdża w dół)
    add(frame(pill, 16, panel_box=panel, content_t=1.0, cursor=(pill[0] + 6, pill[1] + 90)), 130)
    add(frame(pill, 16, panel_box=panel, content_t=1.0), 1400)

    # 6. Delikatne zamknięcie i pętla (morf wstecz, szybszy)
    for t in (0.72, 0.4, 0.12):
        e = ease_out(t)
        box = tuple(lerp(p, q, e) for p, q in zip(pill, panel))
        radius = lerp(23, 16, e)
        alpha = max(0, int(255 * (1 - t * 1.35)))
        add(frame(pill, radius, label_alpha=alpha, panel_box=box, content_t=t * 0.8), 95)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=durs,
        loop=0,
        optimize=True,
        disposal=2,
    )
    kb = OUT.stat().st_size // 1024
    print(f"GIF zapisany: {OUT} ({len(frames)} klatek, ~{kb} KB)")


if __name__ == "__main__":
    main()
