#!/usr/bin/env python3
"""Testy strażnicze: loader musi być pierwszą rzeczą, która się ładuje.

Sprawdzają inwarianty wydajnościowe na wszystkich stronach z nakładką loadera.
Uruchomienie: python3 scripts/test_loader_first.py
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "spolecznosc.html", "tablica-pomyslow.html", "widzety.html"]

failures = []


def check(page, name, cond, detail=""):
    if cond:
        print(f"  ✔ {name}")
    else:
        print(f"  ✘ {name}" + (f"  [{detail}]" if detail else ""))
        failures.append(f"{page}: {name}")


def main():
    for name in PAGES:
        path = ROOT / name
        html = path.read_text(encoding="utf-8")
        print(f"\n--- {name} ---")

        # 1. Nakładka jest pierwszym elementem w <body>
        body = html.split("<body", 1)[1]
        first_tag = re.search(r"<([a-zA-Z][\w-]*)[\s>]", body)
        check(name, "loader jest pierwszym elementem <body>", first_tag and first_tag.group(1) == "div",
              f"pierwszy tag: {first_tag.group(1) if first_tag else 'brak'}")
        check(name, "pierwszy element <body> to #rj-page-loader",
              'id="rj-page-loader"' in body[:400], body[:120].replace("\n", " "))

        # 2. Krytyczny CSS loadera inline, przed blokującymi arkuszami
        idx_critical = html.find('id="rj-loader-critical"')
        check(name, "krytyczny CSS loadera jest inline", idx_critical != -1)
        blocking = [m.start() for m in re.finditer(r'<link rel="stylesheet" href="(?!https://fonts)', html)]
        check(name, "krytyczny CSS przed pierwszym blokującym arkuszem",
              idx_critical != -1 and blocking and idx_critical < blocking[0],
              f"critical={idx_critical}, pierwszy blokujący={blocking[0] if blocking else 'brak'}")

        # 3. Fonty nie blokują pierwszego malowania
        check(name, "fonty Google nie są render-blocking",
              not re.search(r'<link href="https://fonts\.googleapis\.com[^"]*" rel="stylesheet">', html))
        check(name, "fonty mają wariant preload + noscript",
              'rel="preload" as="style"' in html and "fonts.googleapis.com" in html)

        # 4. loader.css nie blokuje
        check(name, "loader.css jest non-blocking (media print + onload)",
              'css/loader.css?v=5" media="print"' in html)

        # 5. Bootstrap WAAPI zaraz po znaczniku nakładki
        idx_overlay_end = html.find('<noscript><style>#rj-page-loader')
        idx_bootstrap = html.find("Animacja kulek startuje NATYCHMIAST")
        check(name, "bootstrap animacji jest inline", idx_bootstrap != -1)
        check(name, "bootstrap tuż po nakładce (przed treścią)",
              idx_bootstrap != -1 and idx_overlay_end != -1 and idx_bootstrap < idx_overlay_end)
        # bootstrap nie może być za pierwszym kontenerem treści (różne strony mają różny układ)
        content_anchors = [i for i in (
            html.find('<div class="backdrop"'),
            html.find("<header"),
            html.find("<main"),
        ) if i != -1]
        idx_content = min(content_anchors) if content_anchors else -1
        check(name, "bootstrap przed resztą treści",
              idx_bootstrap != -1 and idx_content != -1 and idx_bootstrap < idx_content,
              f"bootstrap={idx_bootstrap}, treść={idx_content}")

        # 6. loader.js jest pierwszym skryptem defer
        defers = re.findall(r"<script defer src=\"([^\"]+)\"", html)
        check(name, "js/loader.js jest pierwszy wśród defer",
              bool(defers) and defers[0].startswith("js/loader.js"), str(defers[:3]))
        check(name, "loader.js jest w <head> (nie na końcu <body>)",
              html.find('src="js/loader.js') < html.find("</head>"))

        # 7. Brak duplikatów
        check(name, "tylko jeden tag js/loader.js", html.count('src="js/loader.js') == 1)
        check(name, "tylko jeden inline CSS loadera", html.count('id="rj-loader-critical"') == 1)
        check(name, "tylko jeden bootstrap", html.count("Animacja kulek startuje NATYCHMIAST") == 1)

        # 8. Keyframes animacji są w inline CSS (nie zależą od sieci)
        crit_start = html.find('id="rj-loader-critical"')
        crit_end = html.find("</style>", crit_start)
        crit = html[crit_start:crit_end]
        for kf in ["rj-dough-bounce", "rj-dough-shadow", "rj-loader-pop", "rj-caption-pulse"]:
            check(name, f"inline CSS zawiera @keyframes {kf}", f"@keyframes {kf}" in crit)

        # 9. Bez var()/calc(var()) w klatkach animacji kulek (stary błąd silników)
        bounce = crit[crit.find("@keyframes rj-dough-bounce"):crit.find("@keyframes rj-dough-shadow")]
        check(name, "klatki kulek bez calc(var(...))", "calc(var" not in bounce)

    print("\n" + "=" * 60)
    if failures:
        print(f"WYNIK: {len(failures)} niepowodzeń")
        for f in failures:
            print("  - " + f)
        return 1
    print("WYNIK: wszystkie testy zaliczone ✔")
    return 0


if __name__ == "__main__":
    sys.exit(main())
