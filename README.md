# RejHub — rejhub.vercel.app

**Serwis działa pod [https://rejhub.vercel.app](https://rejhub.vercel.app).**

Repozytorium `rejson59/rejson59.github.io` jest od teraz **hostem treści**
dla RejHub 2.0 (Vercel, Root Directory `rejhub2/`) oraz domem samodzielnych
projektów w podkatalogach (`/OffChat/`, `/RejSearch/`, `/RejClass/` itd.).

## Co się stało ze starą stroną

Stara witryna RejHuba (`rejson59.github.io/…`) została **wyłączona**.
Każdy jej adres odpowiada teraz lekką stroną przekierowania, która przenosi
odwiedzającego na ten sam adres w nowym serwisie — razem z parametrami
(`?…`) i kotwicą (`#…`):

| Stary adres | Nowy adres |
| --- | --- |
| `rejson59.github.io/` | `rejhub.vercel.app/` |
| `rejson59.github.io/rejchat` · `.html` | `rejhub.vercel.app/rejchat` |
| `rejson59.github.io/profil` | `rejhub.vercel.app/profil` |
| `rejson59.github.io/uslugi` | `rejhub.vercel.app/uslugi` |
| `rejson59.github.io/podroz/` | `rejhub.vercel.app/podroz` |
| … | … (pełna lista w `js/przeniesienie.js` i `scripts/jsdom/przeniesienie.test.js`) |

Przekierowanie działa bez JavaScriptu (`<meta http-equiv="refresh">`),
a dla wyszukiwarek strony mają `noindex, follow` i `canonical` na nowy adres —
dlatego stare linki nie znikają z wyników jako błąd, tylko prowadzą dalej.

## Gdzie co leży

```
rejhub2/             # cały serwis RejHub 2.0 (deploy: Vercel, Root = rejhub2)
  index.html         # strona główna (wyspa, aplikacje, RejAsystent)
  aplikacje.html     # lista aplikacji RejHuba
  pobierz.html       # aplikacja Android (APK) + metadane wydania
  middleware.js      # brama: chroni tylko panel (/admin, /panel, /api, studio)
  api/               # funkcje serwerowe (sesja administratora, powiadomienia)
  hub/               # powłoka: wyspa, loader, tło, glass2
js/                  # wspólne skrypty serwisu (serwowane też przez Vercel)
css/                 # wspólne arkusze
mobile/              # powłoka Android (Capacitor) + klucz podpisu
supabase/            # migracje SQL i funkcje brzegowe
scripts/jsdom/       # testy jsdom (`npm test`)
docs/                # dokumentacja techniczna (m.in. nawigacja)
```

Pozostałe katalogi (`OffChat/`, `RejSearch/`, …) to osobne projekty
publikowane przez GitHub Pages — **nie są częścią RejHuba 2.0** i działają
bez zmian.

## Nowa strona jest otwarta

Brama serwerowa (`rejhub2/middleware.js`) nie ukrywa już całego serwisu.
Publicznie działa wszystko poza logiką administracyjną:

- **publiczne:** `/`, `/aplikacje`, `/rejchat`, `/rejclass`, `/rejfile`,
  `/rejgames`, `/rejmeme`, `/rejmusic`, `/rejplanner`, `/rejsejf`, `/rejtools`,
  `/spolecznosc`, `/uslugi`, `/partnerstwo`, `/pobierz`, `/licencja`,
  `/logowanie`, `/konto-demo`, `/profil`,
- **za sesją administratora:** `/admin`, `/panel`, `/studio-source`,
  `/szklane-studio` oraz `/api/*` poza `/api/session` i `/api/push-send`,
- po zalogowaniu na `/login` brama wraca dokładnie pod żądany adres (`?next=`).

Strona „w budowie” została usunięta; `/w-budowie` przekierowuje na stronę główną.

## Uruchomienie lokalne

```bash
python3 -m http.server 8000        # podgląd katalogu repo (stare adresy → przekierowania)
cd rejhub2 && npm run check        # składnia funkcji serwerowych i bramy
cd scripts/jsdom && npm install && npm test
```

## Publikacja

- **RejHub 2.0:** push na `main` → Vercel buduje `rejhub2/` (bez kroku budowania).
- **Stare adresy:** GitHub Pages publikuje z `main` (folder `/`) — tam leżą
  wyłącznie strony przekierowania i samodzielne projekty.
- **Aplikacja Android:** `.github/workflows/android.yml` przy zmianie w `mobile/**`
  buduje podpisany APK i publikuje go w wydaniu `RejHub.apk`.

## Dla agentów AI

Agenci pracujący nad tym repo w sesjach Arena AI czytają najpierw
**[AGENTS.md](AGENTS.md)** — tam są konwencje projektu oraz zasada publikowania
wpisów z konta „Agent AI Rejsona” na Społeczności przy wartych uwagi aktualizacjach.
