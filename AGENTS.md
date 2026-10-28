# AGENTS.md — instrukcja dla agentów AI (Arena / Claude / inne)

Ten plik czytają agenty AI, które pracują nad tym repozytorium w kolejnych
sesjach. Opisuje: (1) co tu jest i jak niczego nie zepsuć, (2) konto
„Agent AI Rejsona" na Społeczności i jak z niego publikować.

## 1. Projekt w pigułce

- Statyczna strona na GitHub Pages (branch `main`, katalog `/`), bez kroku budowania.
- Backend: Supabase (projekt `hzbqzfimtroixnldzjeq`) — wszystko przez publiczne funkcje RPC
  (`/rest/v1/rpc/...`) z kluczem **anon** (klucz anon jest jawny w JS i to jest OK).
- Logowanie do Społeczności: własmy mechanizm nazwa + 4-cyfrowy PIN
  (tokeny w `community_sessions`), to NIE jest Supabase Auth. Supabase Auth używa tylko admin.
- Hasła, klucze `service_role` i inne sekrety — NIGDY w repo (wyjątek: jawny klucz anon oraz
  klucz publikowania agenta — patrz niżej, celowo jawne).
- Po zmianach w JS uruchom `node --check <plik>`. Linki wewnętrzne prowadzimy
  bez końcówki `.html` (GitHub Pages serwuje je sam; stare adresy dalej działają).
- Migracje bazy: katalog `supabase/` (kopie SQL dla dokumentacji; stosowane przez konektor Supabase).

## 2. Konto „Agent AI Rejsona" na Społeczności

Na Społeczności istnieje oficjalne konto bota **`Agent_AI_Rejsona`** (odznaka 🤖 Agent AI,
awatar `assets/agent-avatar.png`). Twoim obowiązkiem jako agenta Arena jest **co jakiś czas
publikować z niego wpis o aktualizacji** — gdy w tej sesji wdrożyłeś coś istotnego.

### Kiedy publikować

- ✅ nowe funkcje widoczne dla odwiedzających (np. nowa podstrona, wyszukiwarka, media w postach),
- ✅ nowe/duże zmiany w projektach użytkowych,
- ✅ większe zmiany wyglądu strony dla odwiedzających.

### Czego NIE publikować

- ❌ zmian w panelu admina i innych spraw „kuchennych",
- ❌ drobiazgów (literówki, pojedyncze fixy CSS, refaktoring),
- ❌ niczego, co nie dotyczy odwiedzających stronę.

Zasada: jedna sensowna zmiana na sesję = maks. 1 wpis. Nie spamuj.

### Jak opublikować wpis (REST, bez logowania)

```bash
curl -X POST "https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/community_agent_post" \
  -H "apikey: <klucz-anon-z-js/community.js>" \
  -H "Authorization: Bearer <klucz-anon>" \
  -H "Content-Type: application/json" \
  -d '{
    "p_secret": "e2148c352dfb065cf8662d91da3110b49e1776f666c572eb",
    "p_content": "Treść wpisu po polsku…",
    "p_media": [{"kind":"url","type":"image","url":"https://rejson59.github.io/assets/posts/moja-grafika.png"}]
  }'
```

- Klucz agenta jest świadomo publiczny (repo jest publiczne) — serwer i tak ogranicza publikacje
  do **3 wpisów na dobę**, a właściciel może usunąć każdy wpis z panelu admina.
- Media: tylko pliki z `https://rejson59.github.io/...` (maks. 4). Grafiki generuj do
  `assets/posts/` (commit + merge na `main`, poczekaj aż GitHub Pages je opublikuje — inaczej
  obrazek pokaże się jako zepsuty). GIF-y działają normalnie.
- Jeśli dostaniesz błąd „Nieprawidłowy klucz agenta" — klucz został zrotowany przez właściciela.
  Poproś go o nowy i popraw ten plik (instrukcja rotacji niżej).

### Styl wpisów agenta

- Po polsku, przyjaźnie i konkretnie: co się zmieniło, gdzie to znaleźć, po co to jest.
- 3–10 zdań + 1–2 emoji. Możesz zacząć od np. „Hej! 👋”.
- Zawsze gdy się da — dołącz grafikę/GIF pokazujący zmianę (wygeneruj i zapisz w `assets/posts/`).

### Rotacja klucza (dla właściciela, przez SQL w Supabase)

```sql
update public.agent_config set value = '<nowy-losowy-hex>' where key = 'post_secret';
```

Potem nowa wartość trafia do tego pliku (sekcja wyżej).

## 3. Wdrożenie zmian ze sesji agenta

Pracujesz na gałęzi sesji `arena/...` → commit → push → Pull Request do `main` → merge.
GitHub Pages buduje `main` automatycznie (~1 min). Po merge zweryfikuj stronę na żywo
(fetch pod `https://rejson59.github.io/...`), a potem rozważ wpis agenta wg zasad z sekcji 2.

## 3b. Konto i powiadomienia — żadnych sztuczek

Zasada nadrzędna: **każde powiadomienie musi pochodzić z realnych danych.**
Nigdy „ktoś właśnie coś zrobił”, jeśli to nie wydarzyło się naprawdę.

- Źródła powiadomień (`js/premium.js`): nowszy `updated_at` obserwowanego
  projektu, zmiana statusu / odpowiedź na moje zgłoszenie, realna obecność
  właściciela (`community_online_users`).
- Pierwsze uruchomienie **tylko zapisuje punkt odniesienia** — bez zalewu
  powiadomieniami o historii sprzed założenia konta.
- Odświeżenie **scala** powiadomienia (dedupe po `id`), a nie podmienia —
  inaczej powrót z innej karty kasuje to, co użytkownik widzi.
- Bramka dotyczy wyłącznie DODATKÓW (powiadomienia, obserwacje, scalona
  historia). Treść strony i tablica zostają dla wszystkich.
- „Nie teraz” działa naprawdę: 7 dni spokoju (`rj_club_snooze_v1`).
- Zakazane: fałszywe liczniki „ostatnie miejsca”, wymyślone zdarzenia,
  modal wracający po „×”, blokowanie treści za rejestracją.
- Scalanie historii: `community_link_submissions(p_token)` dopisuje nick
  wyłącznie do wpisów bez podpisu (null / '' / 'Anonim') z urządzeń już
  powiązanych z kontem (`identity_links`, kind `fp`).

## 4a. Harmonogram paska postępu (nie ruszać bez czytania)

Pasek nie jest „na oko" — ma trafić na moment znikania nakładki:

- `CURVE_S` w bootstrapie na każdej stronie **musi** równać się `MIN_SHOW_MS / 1000`
  w `js/loader.js` (obecnie `1.8` / `1800`). Pilnuje tego asercja w strażniku.
- Krzywa: `0.05 + 0.89 * (t / CURVE_S) ** 1.6`, więc po sekundzie jest ~32%,
  a 94% dokładnie w chwili `doHide` — na końcu nie ma skoku.
- `set(v)` to **brama** (maksimum), nie wartość: bez zdarzenia `load` pasek nie
  przekracza 0.55, a po 3 s brama wolno rośnie (max 0.9). 100% tylko na koniec.
- Etapy (`RJProgress.stage`) mają minima po 520 ms każdy — inaczej migają.
- Przechwycenie paska przez JS (`is-managed`) musi zachować to, co już pokazała
  animacja CSS, i nigdy nie cofnąć wartości (`paint()`).

## 3a. Efekt 3D kart (tilt) — zasady wydajności

Karty projektów mają w środku żywą ramkę (iframe). Obrót takiej karty musi być
tani, inaczej strona „glitchuje": karta znika i wraca, a reszta strony się przycina.

- Prostokąt karty mierzymy **raz na hover** (`measure()`), nigdy w `pointermove`.
- Najwyżej **jedna aktualizacja stylu na klatkę**; zapisujemy tylko wtedy, gdy kąt
  faktycznie się zmienił (zaokrąglenie do 0,1°).
- `transition` ustawiamy **dwa razy** (wejście, wyjście). Nadpisywanie go w ruchu
  restartuje animację kilkadziesiąt razy na sekundę — to był główny powód drgania.
- `--mx/--my` idą na **`.card-sheen`**, nie na kartę: inaczej każdy ruch myszy
  unieważnia style całego poddrzewa razem z iframe.
- **Żadnego `transform-style: preserve-3d`** na kartach — rozbija kartę na warstwy
  3D i gubi elementy przy obrocie. Perspektywę daje rodzic (`perspective: 1000px`).
- Karta obraca się **od pierwszej klatki**, także gdy podgląd się wczytuje (ramka
  ma wtedy `opacity: 0`, więc nie ma czego rozjechać). Blokowanie efektu na czas
  wczytywania wyglądało dokładnie jak usunięcie animacji — nie wracać do tego.
- `will-change` żyje wyłącznie w klasie `.is-tilting` (czas hoveru).
- **NIE MA żadnego automatycznego wyłączania ani zmniejszania kąta w trakcie.**
  Efekt jest włączony przez całą sesję; jedyne wyjście to ręczne `RJTilt.disable()`.
  Dwa razy próbowałem tu „bezpiecznika” mierzącego tempo klatek i dwa razy psuł
  efekt: `rAF` odpala się **tylko przy ruchu myszy**, więc każda pauza kursora
  (>48 ms, potem >90 ms) liczyła się jako zgubiona klatka. Po kilku pauzach kąt się
  połowił, po kilkunastu efekt gasł do końca wizyty — użytkownik widzi: „trochę
  działało i zniknęło”. Nie wracać do mierzenia czasu w tym miejscu.
- Decyzja jest **stała i oparta na faktach o urządzeniu**: efekt wyłącza tylko
  `saveData` + `hover:hover/pointer:fine` + brak `prefers-reduced-motion`.
  Połysk (najdroższy element) znika dodatkowo przy `deviceMemory <= 4` lub
  `hardwareConcurrency <= 4`, ale obrót zostaje.
- Diagnostyka w konsoli: `RJTilt.enabled`, `RJTilt.sheen`, `RJTilt.reason`.

## 4. Testy loadera

Dwa zestawy, oba trzeba przepuścić po każdej zmianie w `js/loader.js`, `css/loader.css`
albo w bloku loadera na stronach:

```bash
# 1. Strażniczy (bez zależności) — inwarianty HTML/CSS/JS na 4 stronach
python3 scripts/test_loader_first.py

# 2. Zachowanie w jsdom — pasek, kolejność chowania, podglądy, słabe urządzenie
cd scripts/jsdom && npm install && node loader.test.js
```

Test jsdom wymaga serwera na `:8000` dla sekcji e2e (`python3 -m http.server 8000`);
bez niego sekcja H jest pomijana, reszta działa.

## 5. Testy efektu 3D kart

Po każdej zmianie w bloku tiltu (`js/app.js`) albo w regułach kart (`css/style.css`):

```bash
cd scripts/jsdom && node tilt.test.js
```

Test liczy realne koszty: odczyty layoutu, zapisy stylu na klatkę, zmiany `transition`,
miejsce zmiennych połysku. Sekcja G odtwarza scenariusz z życia: 12 serii ruchów
myszy przeplatanych dłuższymi pauzami — kąt musi zostać pełny przez cały czas.
Fixture udaje desktop (8 rdzeni / 8 GB), bo jsdom sam z siebie raportuje 2. Da się go puścić na starszej wersji
kodu — `RJ_APP=… RJ_CSS=… node tilt.test.js` — i pokazać, co było zepsute (na wersji
z 26.10.2026 wypada 19 z 37 asercji).

**Czego pilnują (błędy, które już się zdarzyły):**
- pasek **nigdy nie cofa się** (`paint()` przyjmuje tylko większe wartości),
- pasek **nie stoi pusty**, gdy wątek jest zablokowany (pierwszy ruch robi CSS),
- **nikt nie pauzuje animacji samej nakładki** — `pause()` łapało jej zanikanie
  i nakładka zamarzała w połowie znikania, zakrywając stronę na zawsze,
- nakładka **znika z układu** (`display:none`) po zaniknięciu,
- przejście na podstronę **nie zeruje paska**,
- podglądy startują **pojedynczo**, nie pięć iframe-ów w jednej klatce.
