# RejHub 2.0 — wersja robocza

Nowa wersja RejHub rozwijana w osobnym katalogu, ale wdrażana **tylko przez Vercel**
(`rejhub.vercel.app`). GitHub Pages nie serwuje tego katalogu jako strony głównej,
więc publiczna strona `rejson59.github.io` działa bez zmian.

## Jak działa brama

1. `login.html` wysyła e-mail i hasło do `/api/session`.
2. Funkcja serwerowa sprawdza je w Supabase Auth i pyta bazę o `is_widget_admin()`.
3. Tylko wtedy ustawia ciasteczko `rejhub_admin` — `HttpOnly`, `Secure`,
   podpisane HMAC-SHA256 kluczem `REJHUB_SESSION_SECRET` (12 godzin).
4. `middleware.js` sprawdza podpis **przed** wydaniem jakiegokolwiek pliku.
   Bez ważnego ciasteczka nie ma HTML, CSS ani JS nowej wersji — dostaje się
   wyłącznie kartkę „w budowie”.

Brak ukrywania w DOM i brak sprawdzania po stronie przeglądarki: decyduje serwer.

## Wymagane zmienne środowiskowe (Vercel → Settings → Environment Variables)

| Zmienna | Wartość |
| --- | --- |
| `SUPABASE_URL` | `https://hzbqzfimtroixnldzjeq.supabase.co` |
| `SUPABASE_ANON_KEY` | publiczny klucz anon projektu |
| `REJHUB_SESSION_SECRET` | losowy ciąg min. 32 znaki, **tylko w Vercel — nie commitować** |

## Struktura

- `index.html`, `assets/` — panel roboczy (tylko administrator),
- `w-budowie.html` — publiczna kartka dla gości,
- `login.html` — logowanie administratora,
- `api/session.js` — weryfikacja w Supabase + podpisana sesja,
- `middleware.js` — serwerowa brama na każdym żądaniu.

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
