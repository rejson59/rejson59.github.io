# RejHub 2.0 — produkcja

To jest **cały serwis RejHub**, wdrażany przez Vercel pod
[rejhub.vercel.app](https://rejhub.vercel.app). Stara witryna na GitHub Pages
została wyłączona i tylko przekierowuje tutaj (szczegóły w `js/przeniesienie.js`).

## Jak działa ochrona panelu

Serwis jest publiczny — brama nie ukrywa już zwykłych podstron.

1. `login.html` wysyła e-mail i hasło do `/api/session`.
2. Funkcja serwerowa sprawdza je w Supabase Auth i pyta bazę o `is_widget_admin()`.
3. Tylko wtedy ustawia ciasteczko `rejhub_admin` — `HttpOnly`, `Secure`,
   podpisane HMAC-SHA256 kluczem `REJHUB_SESSION_SECRET` (12 godzin).
4. `middleware.js` sprawdza podpis **tylko dla panelu**: `/admin`, `/panel`,
   `/studio-source`, `/szklane-studio` oraz `/api/*` (poza `/api/session`
   i `/api/push-send`). Bez sesji te adresy przekierowują do `/login?next=…`,
   a API odpowiada `401`.

Brak ukrywania w DOM i brak sprawdzania po stronie przeglądarki: decyduje serwer.

## Wymagane zmienne środowiskowe (Vercel → Settings → Environment Variables)

| Zmienna | Wartość |
| --- | --- |
| `SUPABASE_URL` | `https://hzbqzfimtroixnldzjeq.supabase.co` |
| `SUPABASE_ANON_KEY` | publiczny klucz anon projektu |
| `REJHUB_SESSION_SECRET` | losowy ciąg min. 32 znaki, **tylko w Vercel — nie commitować** |

## Struktura

- `index.html`, `hub/` — strona główna z wyspą, aplikacjami i RejAsystentem,
- `aplikacje.html`, `pobierz.html` — lista aplikacji i strona APK,
- `login.html` — logowanie administratora (wraca pod `?next=`),
- `api/session.js` — weryfikacja w Supabase + podpisana sesja,
- `middleware.js` — brama wyłącznie dla panelu i API,
- `sitemap.xml`, `robots.txt` — adresy publiczne dla wyszukiwarek.

## Konfiguracja projektu Vercel

- Root Directory: `rejhub2`
- Framework Preset: Other
- Build Command / Output Directory: puste

## Lokalnie

```bash
npm run check
```

## Licencja

© 2026 rejson59 — wszystkie prawa zastrzeżone. Ten katalog jest częścią
chronionego projektu RejHub: kopiowanie kodu i wyglądu bez pisemnej zgody jest
zabronione. Pliki: [LICENSE](LICENSE), [ai.txt](ai.txt), [NOTICE](NOTICE).
Strona `/licencja` jest publiczna mimo bramy administratora — inaczej nikt nie
przeczytałby zasad korzystania.
