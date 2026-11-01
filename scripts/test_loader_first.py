#!/usr/bin/env python3
"""Testy strażnicze: loader musi być pierwszą rzeczą, która się ładuje.

Sprawdzają inwarianty wydajnościowe na wszystkich stronach z nakładką loadera.
Uruchomienie: python3 scripts/test_loader_first.py
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "rejchat.html", "tablica-pomyslow.html", "widzety.html"]

failures = []


def check(page, name, cond, detail=""):
    if cond:
        print(f"  ✔ {name}")
    else:
        print(f"  ✘ {name}" + (f"  [{detail}]" if detail else ""))
        failures.append(f"{page}: {name}")


def main():
    JS = (ROOT / "js" / "loader.js").read_text(encoding="utf-8")
    LOADER_CSS = (ROOT / "css" / "loader.css").read_text(encoding="utf-8")
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
              'css/loader.css?v=11" media="print"' in html)

        # 5. Bootstrap WAAPI zaraz po znaczniku nakładki
        idx_overlay_end = html.find('<noscript><style>#rj-page-loader')
        idx_bootstrap = html.find("Loader startuje NATYCHMIAST")
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
        check(name, "tylko jeden bootstrap", html.count("Loader startuje NATYCHMIAST") == 1)

        # 8. Keyframes animacji są w inline CSS (nie zależą od sieci)
        crit_start = html.find('id="rj-loader-critical"')
        crit_end = html.find("</style>", crit_start)
        crit = html[crit_start:crit_end]
        boot_start = html.find("Loader startuje NATYCHMIAST")
        boot_end = html.find("</script>", boot_start)
        BOOT = html[boot_start:boot_end]
        for kf in ["rj-dough-bounce", "rj-dough-shadow", "rj-loader-pop", "rj-caption-pulse"]:
            check(name, f"inline CSS zawiera @keyframes {kf}", f"@keyframes {kf}" in crit)

        # 9. Bez var()/calc(var()) w klatkach animacji kulek (stary błąd silników)
        bounce = crit[crit.find("@keyframes rj-dough-bounce"):crit.find("@keyframes rj-dough-shadow")]
        check(name, "klatki kulek bez calc(var(...))", "calc(var" not in bounce)

        # 10. Płynność: jedna animacja (WAAPI wyłącza CSS), bez droższego blura
        check(name, "WAAPI wyłącza CSS-owe klatki (.is-waapi)", ".rj-dough.is-waapi .ball" in crit)
        check(name, "bootstrap nadaje klasę is-waapi", 'classList.add("is-waapi")' in html)
        shadow_css = crit[crit.find(".dough-slot .shadow"):crit.find(".dough-slot:nth-child(2)")]
        # komentarze nie są kodem — usuwamy je przed sprawdzeniem
        shadow_code = re.sub(r"/\*.*?\*/", "", shadow_css, flags=re.S)
        check(name, "cień bez filter: blur (drogi przy animacji)", "filter: blur" not in shadow_code,
              shadow_code[:80].replace("\n", " "))
        check(name, "istnieje tryb oszczędny .rj-loader--lite", ".rj-loader--lite" in crit)
        check(name, "tryb lite ukrywa cienie", "rj-loader--lite .dough-slot .shadow" in crit)
        check(name, "tryb lite z saveData, nie z liczby rdzeni",
              "connection.saveData" in JS and "hardwareConcurrency" not in JS)

        # 10b. Pasek postępu: markup, styl w inline CSS, kontroler
        check(name, "markup paska postępu (.rj-progress + fill)", 'class="rj-progress"' in body and "rj-progress-fill" in body)
        check(name, "pasek jest w krytycznym CSS (bez czekania na sieć)", ".rj-progress-fill" in crit)
        check(name, "pasek animuje transform (GPU), nie width", "transform: scaleX(0)" in crit and "width:" in crit)
        check(name, "połysk paska ma @keyframes", "@keyframes rj-progress-shine" in crit)
        check(name, "połysk wyłączony przy prefers-reduced-motion",
              "prefers-reduced-motion" in crit and ".rj-progress-shine { display: none; }" in crit)
        check(name, "tryb lite wyłącza połysk paska", "rj-loader--lite .rj-progress-shine" in crit)
        check(name, "pasek ma wariant dla motywu jasnego",
              'html[data-theme="light"] .rj-progress' in crit and 'html[data-theme="light"] .rj-progress-fill' in crit)
        check(name, "błysk po dobiciu do 100% (@keyframes rj-progress-flash)",
              "@keyframes rj-progress-flash" in crit and ".rj-progress.is-done::after" in crit)
        check(name, "błysk wyłączony w trybie lite i reduced-motion",
              crit.count("is-done::after { animation: none; }") >= 2)
        check(name, "dobicie mieści się w oknie widoczności (transition <= HOLD)",
              "transform .3s cubic-bezier" in crit and "HOLD_MS = 320" in JS)
        # tempo paska i czas widoczności loadera muszą być zsynchronizowane,
        # inaczej na końcu zawsze zostaje skok do 100%
        m_curve = re.search(r"var CURVE_S = ([\d.]+);", html)
        m_show = re.search(r"var MIN_SHOW_MS = (\d+);", JS)
        check(name, "tempo paska zsynchronizowane z czasem loadera (CURVE_S == MIN_SHOW)",
              bool(m_curve and m_show) and abs(float(m_curve.group(1)) * 1000 - int(m_show.group(1))) < 1,
              f"CURVE_S={m_curve.group(1) if m_curve else '?'} vs MIN_SHOW={m_show.group(1) if m_show else '?'}")
        check(name, "kontroler RJProgress w bootstrapie", "window.RJProgress" in html)
        check(name, "loader.js podaje realne etapy z podpisami",
              'markProgress(0.55, "składanie widoku")' in JS and
              'markProgress(0.97, "ładowanie projektów")' in JS and
              'markProgress(0.97, "prawie gotowe")' in JS)
        check(name, "loader.js domyka pasek przed zdjęciem nakładki", "p.complete" in JS)
        check(name, "etapy są widoczne w markupie (uruchamianie + rejson59)",
              'class="rj-loader-stage"' in body and "uruchamianie" in body and "rejson59" in body)
        check(name, "etap ma zarezerwowane miejsce (tekst nie skacze)",
              ".rj-loader-stage" in crit and "min-height: 15px" in crit)
        check(name, "arkusz zewnętrzny zna etap (style nie znikają po wczytaniu CSS)",
              ".rj-loader-stage" in LOADER_CSS and ".rj-loader-labels" in LOADER_CSS)
        check(name, "loader.js i loader.css w nowych wersjach (bez starej wersji z cache)",
              "js/loader.js?v=14" in html and "css/loader.css?v=11" in html)
        # 10c. Odporność na słaby sprzęt (zgłoszenie: „zacina, pasek cofa się, stoi pusty”)
        check(name, "pierwszy ruch paska robi CSS (kompozytor), nie JS",
              "@keyframes rj-progress-creep" in crit and "animation: rj-progress-creep" in crit)
        check(name, "JS przejmuje pasek dopiero po pierwszej klatce (.is-managed)",
              "classList.add(\"is-managed\")" in BOOT and ".rj-progress.is-managed .rj-progress-fill { animation: none; }" in crit)
        check(name, "kroki co 380 ms zamiast pętli rAF", "STEP_MS = 380" in BOOT)
        check(name, "brak pętli requestAnimationFrame w pasku",
              "requestAnimationFrame" not in BOOT[BOOT.find("Pasek postępu"):BOOT.find("Kulki (Web Animations API)")])
        check(name, "paint() przyjmuje tylko większe wartości (brak cofania)",
              "if (!(v > shown)) return;" in BOOT)
        check(name, "wartość mierzona z CSS przed przejęciem (brak skoku do tyłu)",
              "function measured()" in BOOT and "getComputedStyle(fill).transform" in BOOT)
        check(name, "pasek nie tyka, gdy nakładka jest ukryta", "function overlayHidden()" in BOOT)
        check(name, "krok przejmuje kontrolę przed malowaniem (inaczej CSS nadpisze JS)",
              "takeOver();" in BOOT[BOOT.find("function step()"):BOOT.find("function schedule()")])
        check(name, "dobicie bez animacji ma własną klasę (.is-instant)", "is-instant" in BOOT and ".rj-progress.is-instant" in crit)
        check(name, "loader.js sprząta spóźnione timery przed pokazaniem",
              "clearHideTimers()" in JS and JS.count("later(") >= 3)
        check(name, "podglądy startują pojedynczo (bez zrywu 5 iframe)",
              "function drainPreviewQueue()" in JS and "lite ? 240 : 120" in JS and "previewQueue.shift()" in JS)
        check(name, "na słabym sprzęcie ramki startują w wolnych chwilach",
              "requestIdleCallback(drainPreviewQueue, { timeout: 400 })" in JS)
        check(name, "loader.js nie pauzuje animacji nakładki (to ją zamrażało)",
              "pauseLoaderAnimations" not in JS and "getAnimations" not in JS)
        check(name, "nakładka znika z układu po zaniknięciu", 'el.style.display = "none";' in JS)
        check(name, "nakładka wraca do układu przy pokazaniu", 'el.style.display = "";' in JS)
        check(name, "pasek nie jest zerowany po ukryciu (koniec wizyty)",
              "if (p && p.reset) p.reset();" not in JS)
        check(name, "przejście na podstronę nie cofa paska", "pr.complete();" in JS and "pr.reset();" not in JS)
        check(name, "bezpiecznik CSS: nakładka zniknie nawet bez JS", "rj-loader-failsafe" in crit)

        # 11. Podglądy nie konkurują z loaderem
        check(name, "loader.js bramkuje montowanie podglądów (pageReady)",
              "pageReady" in JS and "preview._rjWantMount" in JS)
        check(name, "sweep respektuje pageReady", "if (!pageReady) return;" in JS)
        check(name, "skanowanie DOM jest odroczone (scheduleScan)",
              "function scheduleScan" in JS and "requestIdleCallback" in JS)

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
