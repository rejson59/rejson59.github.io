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

**Czego pilnują (błędy, które już się zdarzyły):**
- pasek **nigdy nie cofa się** (`paint()` przyjmuje tylko większe wartości),
- pasek **nie stoi pusty**, gdy wątek jest zablokowany (pierwszy ruch robi CSS),
- **nikt nie pauzuje animacji samej nakładki** — `pause()` łapało jej zanikanie
  i nakładka zamarzała w połowie znikania, zakrywając stronę na zawsze,
- nakładka **znika z układu** (`display:none`) po zaniknięciu,
- przejście na podstronę **nie zeruje paska**,
- podglądy startują **pojedynczo**, nie pięć iframe-ów w jednej klatce.
