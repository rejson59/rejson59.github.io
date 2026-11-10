# Szklane studio — źródła propozycji 2.0

Ten katalog zawiera **źródła nowych sekcji** szklanego studia, które trafiają do
prywatnej galerii `/szklane-studio` w RejHubie 2.0.

| plik | co zawiera |
| --- | --- |
| `propozycje.html` | sekcje: pigułka 2.0 (4 warianty), nowe topbary (4), podglądy urządzeń, mini-przykłady, przełącznik ruchu |
| `propozycje.css` | styl sekcji (prefiks `sx-`, jasny motyw, responsywność) |
| `propozycje.js` | interakcje: orbita, szuflada, fala, magnes, topbar z magnesem, paleta ⌘K, toasty, konfetti, podglądy 1440/834/390, przełącznik ruchu |

Treść galerii jest trzymana w Supabase (`studio_private.content`) i podawana
dopiero po weryfikacji administratora przez `admin_private_studio()`. Pliki
z tego katalogu są źródłem do wgrania tych sekcji (patrz `docs/prywatne-studio.md`).

Nowe sekcje są zakładką **„Nowości”** (`#nowe`) w studiu:

* `#pigułka` — cztery warianty dolnej pigułki zgłoszeń,
* `#topbary` — cztery propozycje górnej nawigacji,
* `#podglady` — podglądy strony na komputerze (1440), tablecie (834) i telefonie (390),
* `#przyklady` — sześć drobnych elementów (magnes, parallax, ⌘K, toasty, język, konfetti),
* `#ruch-nowy` — przełącznik odblokowania animacji (`js/motion-unlock.js`).

## Jak wgrać zmiany

1. Zmień pliki w tym katalogu.
2. Opublikuj je na `main` (albo na gałęzi roboczej).
3. Pobierz surowe pliki przez `net.http_get` i dopisz wynik do
   `studio_private.content` (`html` przed `</main>`, `css` i `javascript` na koniec).
4. Zanim cokolwiek nadpiszesz, zrób kopię:
   `create table studio_private.bak_<data> as select * from studio_private.content;`
