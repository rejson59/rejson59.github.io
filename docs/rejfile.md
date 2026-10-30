# RejFile

Podstrona `/rejfile`: plik do 100 MiB, dostępny do 3 dni po zakończeniu wysyłania. Przesyłanie nie wymaga konta; można wysłać link każdemu lub skierować plik do konkretnego konta społeczności. Adres linku zawiera losowy sekret we fragmencie URL; każdy, kto zna link, może pobrać plik. Nie jest to szyfrowanie end-to-end. Obecne konto społeczności używa czterocyfrowego PIN-u, więc nie należy traktować go jako odpowiedniego do poufnych plików. Pliki nie są skanowane antywirusowo.

## Przechowywanie i limity

Prywatny bucket `rejfile` mieści części po maksymalnie 10 MiB. Przyjmowanie większego pliku następuje przez dzielenie go na części, bez podnoszenia globalnego limitu pojedynczego obiektu. Metadane i uprawnienia są prywatne (RLS, funkcje dostępne tylko `service_role`). Plik zostaje udostępniony dopiero po sprawdzeniu liczby i rozmiarów wszystkich części. Link/klucz zarządzania to oddzielne losowe sekrety; w bazie przechowywane są ich skróty. Lista wysłanych plików i klucz zarządzania są zapisane lokalnie w przeglądarce nadawcy.

- RejFile rezerwuje maksymalnie 400 MiB wspólnego miejsca, w tym maksymalnie 200 MiB na skrót IP sieci; do 8 rozpoczętych przesyłek na sieć na 24 h.
- Ograniczane jest wystawianie adresów pobierania: 500 MiB na sieć i 2 GiB łącznie na 24 h. To nie jest twardy limit ruchu: podpisany adres jest wielokrotnego użytku w czasie swojej ważności (najwyżej 60 s).
- Po 3 dniach API odmawia dostępu; cron co 15 min wywołuje funkcję Edge, która usuwa wygasłe części przez Storage API. Anulowane lub nieukończone przesyłki są usuwane po ponad 2 h, gdy wygasną wcześniej wydane adresy uploadu. Cofnięcie natychmiast blokuje wystawianie kolejnych adresów, ale już wystawiony adres pobierania może działać do minuty.
- Publiczny endpoint czyszczenia może usuwać tylko rekordy kwalifikujące się do usunięcia; kolejne jego uruchomienia są ograniczane w bazie. Skróty IP i logi limitujące są usuwane po 2 dniach.
- Miejsce i transfer współdzielą istniejący projekt Supabase z innymi usługami. Limity RejFile nie gwarantują dostępności przestrzeni w całym projekcie; w razie przekroczenia limitów dostawcy operacja kończy się błędem.

## Kod i testy

`supabase/2026-10-30_rejfile.sql`, `supabase/2026-10-30_rejfile_cleanup.sql`, `supabase/functions/rejfile/index.js`, `js/rejfile.js`. Funkcja Edge używa wbudowanego `SUPABASE_SERVICE_ROLE_KEY` tylko po stronie serwera. Nie umieszczać tego klucza w kliencie. `node scripts/jsdom/rejfile.test.js` sprawdza klienta i API z makietami. `node scripts/rejfile-integration.mjs` to kosztujący prawdziwy transfer test 100 MiB (po wykonaniu cofa dostęp; rezerwacja może pozostać przez około 130 minut). Nie uruchamiać go automatycznie przy każdym commicie. Rzeczywiste limity i bezpieczeństwo zależą od konfiguracji dostawcy, w tym zaufania do nagłówków IP i krótkotrwałych podpisanych adresów.
