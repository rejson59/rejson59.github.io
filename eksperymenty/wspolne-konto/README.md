# Wspólne konto — odizolowany prototyp

**Tylko demonstracja na własnym komputerze. Nie jest uruchomiona produkcyjnie, nie zastępuje obecnego konta, nie łączy istniejących danych i nie jest połączona z Supabase.** Wystawienie tego środowiska do Internetu jest niebezpieczne: `start-dev`, dane demonstracyjne, HTTP i słabe hasło administratora są celowo lokalne.

Dwa małe projekty A i B korzystają z tego samego Keycloak przez OIDC Authorization Code + PKCE (S256), przy użyciu biblioteki `oidc-client-ts`. Każdy ma osobny identyfikator klienta i dokładny adres powrotu. Klient generuje nowe `state` i `nonce` dla każdego logowania, kod z adresu jest natychmiast usuwany z historii, a tokeny nie są dodawane do adresu URL. Demo korzysta z `sessionStorage`; przycisk czyści sesję tylko tej aplikacji w danej karcie, **nie wylogowuje całego konta u dostawcy**.

## Uruchomienie lokalnie

Wymagania: Docker Compose, Node.js 22+ oraz npm. Uruchamiaj tylko na prywatnym komputerze, nie na publicznym serwerze. Oba porty muszą być wolne.

```bash
cd eksperymenty/wspolne-konto
npm ci
npm run build
docker compose up -d
npm start
```

Po uruchomieniu Keycloak wejdź na `http://localhost:4173/projekt-a/`, zarejestruj **testowego** użytkownika, zaloguj się i przejdź do projektu B. Obydwa to demonstracyjne strony, nie RejStream ani pozostałe produkty. Do testu nie używaj prawdziwego hasła. Zakończenie: Ctrl+C w serwerze Node oraz `docker compose down` — baza demo nie jest trwałym magazynem, a usunięcie kontenera usuwa jego dane. Import realm odbywa się przy tworzeniu nowego kontenera, nie nadpisuje istniejącego realmu przy restarcie.

Przykładowa konfiguracja Keycloak włącza nazwę i hasło o długości co najmniej 12 znaków, czyni e-mail opcjonalnym oraz włącza tymczasowe ograniczanie błędnych logowań. Nie zapewnia niezależnego od konta ograniczenia ruchu na brzegu sieci ani ochrony przed blokowaniem kont ofiar przez atakujących. Ochrona dotyczy **wyłącznie testowego Keycloak**, nie istniejącego PIN-u. Konfiguracja Keycloak nie została uruchomiona/testowana w tym środowisku (brak Docker), dlatego przed użyciem należy sprawdzić import, rejestrację bez e-maila, realne blokowanie, obchodzenie blokady i zachowanie przy współbieżności. Nie zakładać, że sam zestaw ustawień zapewnia ochronę produkcyjną.

## Testy

`npm test` uruchamia Chromium i izolowany testowy serwer OIDC w pamięci. **To mock, nie Keycloak**, nie ma prawdziwego logowania i akceptuje dowolne hasło; nie wolno go wykorzystywać jako serwera kont. Test sprawdza przepływ dwóch klientów, PKCE, `state`, `nonce`, odrzucenie nieznanego `state`, zmienionego `nonce` oraz niezarejestrowanego adresu powrotu, czyszczenie adresu powrotu oraz konfigurację realm. `CHROME_BIN` umożliwia wskazanie istniejącego Chromium. Browser jest potrzebny tylko do testów.

## Czego jeszcze brakuje przed wdrożeniem

- Rzeczywisty hosting Keycloak z TLS, trwałą bazą, backupem, aktualizacjami, monitoringiem, oddzieleniem administracji i zabezpieczeniami sieciowymi. Docker Compose w tym katalogu nie jest konfiguracją produkcyjną.
- Bezpieczne odzyskiwanie utraconego **hasła** bez e-maila. Keycloakowe kody odzyskiwania są kodami awaryjnymi drugiego składnika, a nie automatycznie kodami resetu hasła. W demie reset hasła jest wyłączony; przy utracie hasła konto może być nieodzyskiwalne.
- Integracja z istniejącymi kontami i danymi oraz procedura ich ochrony. Stary czterocyfrowy PIN ma 10 000 kombinacji i nie dowodzi mocno własności konta. Potrzebna dodatkowa weryfikacja, plan migracji, testy i wyłączenie wszystkich starych ścieżek dostępu dopiero po przygotowaniu klientów. Żadne istniejące dane nie zostały zmienione.
- Globalne wylogowanie i unieważnianie sesji, bezpieczna obsługa wygaśnięcia, audyt, ograniczenie rejestracji i ataków, rozdzielenie danych projektów oraz weryfikacja dostępu przez backend.
- Klienci demo używają JavaScript i znajdują się w **tym samym originie**. Nie stanowi to izolacji bezpieczeństwa między projektami tego originu. Przed zastosowaniem do cudzych lub wrażliwych aplikacji należy rozdzielić originy i opracować odpowiednie sesje/BFF. Nie używać dostępu z frontendowego tokenu jako dowodu uprawnienia do danych na serwerze.
