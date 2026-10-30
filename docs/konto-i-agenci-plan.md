# Wspólne konto i koordynacja agentów — stan i plan

Stan na 29.10.2026. To plan techniczny, nie opis gotowego SSO ani automatyzacji.

## Co już działa

- `logowanie` i `spolecznosc` korzystają z obecnego konta społeczności (nazwa + czterocyfrowy PIN) i tej samej sesji w `localStorage` na tym samym originie. Ekran logowania nie jest nowym systemem tożsamości.
- RejStream już używa tego samego konta: jego repozytorium opisuje chmurowy zapis ulubionych, historii i postępu. Jest naturalnym pierwszym projektem do testowania nowej tożsamości, a nie dopiero kandydatem do napisania integracji od zera. Najpierw trzeba ochronić istniejące dane, a nie podłączać kolejne aplikacje do PIN-u.
- ProStudent trzyma m.in. dane szkolne lokalnie. Nie należy wysyłać ich do chmury bez odrębnego projektu prywatności, zabezpieczeń i świadomej zgody użytkownika.

## Prototyp wspólnego logowania (30.10.2026)

W `eksperymenty/wspolne-konto/` znajduje się izolowane lokalne demo dwóch klientów OIDC z PKCE, `state`, `nonce` oraz przykładową konfiguracją Keycloak z opcjonalnym e-mailem i ochroną przed zgadywaniem. Nie jest podłączone do istniejących danych, PIN-u ani projektów produkcyjnych. Test Chromium używa serwera OIDC wyłącznie w pamięci; prawdziwy Keycloak, jego formularz rejestracji i blokada prób nie zostały tu uruchomione. Demo nie jest gotowe na publiczny serwer.

**Korekta wcześniejszego planu:** kody odzyskiwania Keycloak służą standardowo jako awaryjny drugi składnik, nie są same w sobie odzyskiwaniem zapomnianego hasła. W tym prototypie reset hasła jest wyłączony; jego bezpieczne odzyskiwanie bez e-maila nadal trzeba zaprojektować i przetestować. Nie obiecywać gotowych kodów resetujących hasło.

## Konto docelowe

Właściciel wybrał **nazwę i hasło bez e-maila**. Bez e-maila należy zaprojektować bezpieczne odzyskiwanie hasła, np. odrębne kody odzyskiwania; dopóki nie zostaną wdrożone i sprawdzone, utrata hasła może oznaczać brak dostępu. Sam Supabase Auth według dokumentacji standardowo łączy trwałą tożsamość z e-mailem, telefonem lub dostawcą zewnętrznym; nie zakładać sztucznych adresów e-mail ani nie zmieniać globalnej konfiguracji istniejącego projektu w ciemno.

Zbadać dostawcę tożsamości z logowaniem bez e-maila, np. Keycloak (opcjonalny e-mail, OIDC i PKCE), wraz z realnym hostingiem, kosztami, backupami i utrzymaniem. Nie wystawiać własnego, niesprawdzonego protokołu logowania. Wymagania:

1. Hasła haszowane właściwym algorytmem KDF, ograniczanie prób logowania także na poziomie infrastruktury, odporność na wyliczanie kont i nadużycia, unieważnianie sesji, odzyskiwanie z jednorazowymi kodami.
2. Dla innych domen: OIDC authorization code + PKCE, lista konkretnych adresów powrotu, state/nonce, ograniczone uprawnienia, weryfikacja po stronie serwera, sesje i kontrola dostępu właściwej aplikacji. Nie przenosić tokena społeczności w URL ani na inne domeny. Wspólny `localStorage` działa tylko w tym samym originie i nie jest izolacją między aplikacjami z tego samego originu.
3. Migracja istniejących kont zachowuje stabilną tożsamość i dane, wymaga zweryfikowanego właściciela oraz planu awaryjnego. PIN ma tylko 10 000 możliwości; sama znajomość PIN-u nie jest silnym dowodem własności. Po przejściu na nowe konto nie wolno pozostawić działającej starej ścieżki PIN do tych samych danych, ani aktywnych starych sesji. Trzeba wcześniej zaktualizować **wszystkie** klienty i RPC używające `community_session_user` — inaczej stary dostęp może obejść nowe hasło. Planować w izolowanym środowisku testowym przed zmianą produkcji.
4. Testy: błędne hasła i throttling, przejęcie/łączenie kont, odzyskiwanie, cofanie sesji, izolacja danych, CSRF, niedozwolone redirecty, XSS oraz migracja i rollback istniejących kont.

## Agenci — rzeczywiste możliwości

Obecna sesja Arena nie ma narzędzia do pisania do innych rozmów ani do ich automatycznego uruchomienia. Dokumentacja Arena opisuje pracę przez rozmowę i połączone repozytorium, nie potwierdzono wspieranego API do uruchomienia konkretnej istniejącej rozmowy Agent Mode.

**Proponowana architektura:** po ręcznym zatwierdzeniu zgłoszenia prywatna kolejka zapisuje zadanie z projektem, zakresem, statusem i ID; agent projektu odbiera je i odsyła link do PR oraz testy. Treści zgłoszeń są danymi, nie uprawnieniami agenta. Prywatne zgłoszenia, kontakty, tokeny i logi nie mogą trafiać automatycznie do publicznych GitHub Issues. PR wymaga kontroli przed scaleniem; koszty i uprawnienia są ograniczone. Bez działającego workera jest to kolejka do odebrania, **nie automatyczne uruchomienie**.

Alternatywa: GitHub dokumentuje przypisanie Issue do Copilot cloud agent także przez API — może utworzyć PR. To inny agent i inna sesja niż czaty Arena; wymaga sprawdzenia uprawnień i planu. GitHub podaje dostępność cloud agenta w płatnych planach; dodatkowo obowiązują limity/rozliczenia. Nie włączać płatnych usług ani nie wysyłać danych bez zgody właściciela.

### Źródła

- https://supabase.com/docs/guides/auth/users
- https://www.keycloak.org/docs/latest/server_admin/index.html
- https://help.arena.ai/articles/1655691990-how-to-use-coding-in-agent-mode
- https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/assign-copilot-to-an-issue
- https://docs.github.com/en/copilot/how-tos/manage-your-account/manage-policies
