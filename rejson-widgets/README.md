# Rejson Widgets — Uniwersalny System Liquid Glass

Centralny, ultra-płynny pakiet widżetów **Liquid Glass** zaprojektowany dla wszystkich stron i gier z ekosystemu **[rejson59.github.io](https://rejson59.github.io/)**.

## Szybkie dodanie na dowolną stronę (1 linijka)

Wklej tuż przed tagiem `</body>` w pliku `index.html` dowolnego projektu:

```html
<script src="https://rejson59.github.io/rejson-widgets/widget.js" defer></script>
```

Zero arkuszy CSS, zero bundlera, zero zależności zewnętrznych i **100% izolacji w Shadow DOM** — widżet nie koliduje ze stylami żadnej strony ani gry 3D.

---

## Co potrafi widżet?

1. **Prawdziwy efekt Liquid Glass + Fizyka sprężynowa** — wielowarstwowe szkło z mapą refrakcji soczewki (`feDisplacementMap`), świetlnym refleksem śledzącym kursor i automatycznym dopasowaniem do jasnego/ciemnego motywu strony docelowej.
2. **Swobodne przeciąganie + Edge Dock dla gier pełnoekranowych** — gracz może przeciągnąć kapsułkę w dowolny róg ekranu albo przytulić ją do samej krawędzi ekranu (`Edge Dock`). Podczas aktywnego `Pointer Lock` (np. rozglądania myszką w `mconline`) przycisk sam wygasza się i nie przechwytuje kliknięć, a pisanie w formularzu izoluje klawisze `WASD` / `Spacja` / `E`.
3. **Zgłaszanie błędów z Auto-Diagnostyką** — automatycznie dołącza przeglądarkę, system operacyjny, rozdzielczość oraz przechwycone błędy konsoli JavaScript (`window.onerror`, `unhandledrejection`, `console.error`).
4. **Pomysły na aktualizacje + Tablica z głosowaniem (Upvote)** — odwiedzający mogą podbijać głosy pod najlepszymi pomysłami i czytać oficjalne odpowiedzi autora (`Odpowiedź Rejson59`).
5. **Mini-Launcher Ekosystemu Rejson59** — szybka wyszukiwarka i przełącznik do wszystkich pozostałych gier i aplikacji live na koncie `rejson59`.
6. **Centralny Panel Admina (`/admin.html`)** — połączony na żywo z chmurą **Supabase** (`Row Level Security` + `Supabase Auth`), z filtrowaniem po projektach, zmianą statusów, odpowiadaniem użytkownikom, 1-klikowym **Kopiowaniem gotowego promptu naprawczego dla AI** oraz eksportem do **GitHub Issues**.

---

## Opcjonalna konfiguracja atrybutami HTML

```html
<script
  src="https://rejson59.github.io/rejson-widgets/widget.js"
  data-project="mconline"
  data-mode="edge"
  data-position="bottom-right"
  data-theme="auto"
  data-accent="#3fb68b"
  data-label="Feedback"
  defer
></script>
```

| Atrybut | Domyślnie | Opis |
| :--- | :--- | :--- |
| `data-project` | Auto z URL | Nazwa projektu w Panelu Admina i na tablicy (wykrywana automatycznie z `rejson59.github.io/<projekt>/` oraz `*.vercel.app`). |
| `data-mode` | `"pill"` | `"pill"` (kapsułka), `"orb"` (okrągła ikona) lub `"edge"` (uchwyt przy krawędzi ekranu). |
| `data-position` | `"bottom-right"` | Narożnik startowy (`bottom-right`, `bottom-left`, `top-right`, `top-left`). |
| `data-theme` | `"auto"` | `"auto"` (śledzi motyw strony na żywo), `"dark"` lub `"light"`. |
| `data-accent` | `"#6aa6ff"` | Kolor akcentu świetlnego HEX. |
| `data-label` | `"Feedback"` | Napis na kapsułce. |

---

## Programistyczne API JavaScript

Widżet udostępnia obiekt `window.RejsonWidget` na każdej stronie:

```js
RejsonWidget.open("bug");      // Otwiera formularz zgłoszenia błędu
RejsonWidget.open("idea");     // Otwiera formularz pomysłu na update
RejsonWidget.open("board");    // Otwiera tablicę głosowań
RejsonWidget.open("projects"); // Otwiera launcher projektów Rejson59
RejsonWidget.dock(true);       // Chowa przycisk do krawędzi ekranu (Edge Dock)
RejsonWidget.close();          // Zamyka panel
```

Skrót klawiszowy na każdej stronie: **`Alt + R`**.

---

## Warstwa „papla” — stabilność i strefa bezpieczeństwa

Zewnętrzna warstwa widżetu (`#rejson-liquid-widget-root`) działa jak „papla”, która **nigdy nie blokuje kliknięć strony**:

- `pointer-events: none` na całej warstwie — interakcję odzyskuje wyłącznie szklana pigułka (`.rj-vessel`),
- transformację warstwy sterują zmienne **`--papla-rot` / `--papla-tx` / `--papla-ty`** (domyślnie `0`), a po zamontowaniu panelu widżet **zeruje je i czyści `transform`**, usuwając ewentualny niespodziewany obrót/przesunięcie,
- pozycjonowanie uwzględnia **strefę bezpieczeństwa** urządzeń z wycięciem ekranu (`env(safe-area-inset-*)`), także w trybie `Edge Dock`,
- do czyszczenia po sobie służy **`RejsonWidget.destroy()`** — zeruje zmienne `papla`, odpina globalne nasłuchy (`keydown`, `pointerlockchange`, `resize`) i usuwa węzeł z DOM.

---

## Automatyczna instalacja na wszystkich repozytoriach Rejson59

W katalogu `scripts/inject-widget.py` znajduje się gotowy skrypt sprawdzający i wstrzykujący widżet do wszystkich projektów na `rejson59`:

```bash
python3 scripts/inject-widget.py          # Podgląd projektów (dry-run)
python3 scripts/inject-widget.py --apply  # Automatyczne dodanie na GitHubie
```
