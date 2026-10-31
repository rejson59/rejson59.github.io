# Wyszukiwarki i statyczne linki

`robots.txt` wskazuje `sitemap.xml`. Mapa zawiera wybrane, publiczne, stabilne adresy tej domeny; nie zawiera logowania, panelu administracyjnego ani RejFile (strona ma `noindex` i służy m.in. do prywatnych linków). Nie wpisujemy wymyślonych dat `lastmod`.

Na stronie głównej pięć wyróżnionych projektów oraz kilka dodatkowych kart mają prawdziwe linki w HTML, dostępne również bez JavaScriptu. JS zastępuje te dodatkowe karty dynamiczną listą z GitHuba, a w razie niedostępności API korzysta z `js/projects-data.js`. Efekt 3D i daty dynamicznych kart pozostają bez zmian.

Statyczny wybór i mapa **nie aktualizują się automatycznie**. Aby odświeżyć statyczne opisy, daty i kopię danych z publicznego API GitHuba, uruchom z katalogu repozytorium:

```sh
python3 scripts/fetch-repos.py
python3 scripts/test_seo.py
cd scripts/jsdom && npm install && node seo.test.js
```

Listę dodatkowych projektów określa `STATIC_PROJECTS` w skrypcie; po dodaniu/usunięciu lub zmianie adresu projektu zweryfikuj wdrożenie i ręcznie zaktualizuj `sitemap.xml`. Skrypt pobiera maksymalnie pierwszych 100 repozytoriów, dlatego przy większej liczbie należy go rozbudować o paginację. Nie wpisuj do mapy stron prywatnych, technicznych, przekierowań ani adresów z parametrami lub sekretami.

Właściciel może zweryfikować domenę i zgłosić `https://rejson59.github.io/sitemap.xml` w Google Search Console oraz Bing Webmaster Tools. Mapa i linki ułatwiają odkrywanie, lecz nie gwarantują indeksacji ani pojawienia się w odpowiedziach AI.
