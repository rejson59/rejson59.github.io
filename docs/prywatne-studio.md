# Prywatne studio

`/szklane-studio` (RejHub 2.0) to publiczna bramka, bez materiałów studia. Materiały znajdują się wyłącznie w `studio_private.content` w Supabase.

Adres `/testy` na starej stronie został usunięty — studio mieszka teraz w RejHubie
pod `/szklane-studio`. Zapytanie `admin_private_studio` i brama serwerowa działają
bez zmian; nowe sekcje (pigułka 2.0, topbary, podglądy urządzeń) mają źródła
w `rejhub2/studio-source/`. Funkcja `admin_private_studio()` używa sesji panelu administratora i serwerowego `is_widget_admin()`; sama bramka nie jest zabezpieczeniem. Schemat i tabela nie są dostępne rolom publicznym, a odpowiedź RPC ma `Cache-Control: no-store, private`. Zmiany zawartości należy wprowadzać wyłącznie do prywatnej tabeli lub innego prywatnego repozytorium/magazynu, nigdy do publicznego Git ani migracji. Plik migracji odtwarza uprawnienia i schemat, nie zawiera i nie przywraca zawartości — konieczna jest osobna bezpieczna kopia zawartości bazy. Nie umieszczaj jej w publicznym repozytorium.

Wcześniejsza wersja studia była publiczna; stare commity i ewentualne kopie są nadal dostępne. Ta ochrona dotyczy bieżącego adresu i przyszłej zawartości, nie cofa wcześniejszej publikacji. Nie należy publikować sekretów w GitHub Pages.

Testy przeglądarkowe galerii wymagają prywatnych plików testowych w katalogu wskazanym przez `STUDIO_PRIVATE_FIXTURE_DIR`, pod nazwami `html`, `css` i `js`. Używają atrapy RPC i osobnego testowego stanu sesji, nie testują uprawnień backendu. Zabezpieczenia RPC należy osobno testować w bazie i przez API; testy nie wymagają i nie powinny używać prawdziwych danych logowania. `testy.test.js` sprawdza publiczną bramkę również bez prywatnej zawartości.
