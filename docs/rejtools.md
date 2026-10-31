# RejTools

Publiczna strona `/rejtools`: zmiana szerokości/formatu PNG, JPEG i WebP, licznik i proste formatowanie tekstu, formatowanie JSON, generator haseł i SHA-256 pliku. Narzędzia są darmowe, bez konta; dane narzędzi przetwarza lokalnie JavaScript w przeglądarce. Zewnętrzne elementy strony (np. widżet zgłoszeń) pozostają osobnymi funkcjami witryny. Obszar z danymi narzędzi oznaczono `data-rj-private` dla ochrony migawek widżetu.

Obrazy do 20 MiB i 40 mln pikseli; szerokość 1–6000 px, bez powiększania oryginału. JPEG wypełnia przezroczystość bielą; wsparcie WebP zależy od przeglądarki. SHA-256 obsługuje pliki do 100 MiB, które są wczytywane do pamięci, i wymaga Web Crypto (zwykle HTTPS). Hasła powstają przez `crypto.getRandomValues`; kopiowanie wymaga dostępnego schowka, z ręcznym fallbackiem.

Sprawdzenie działania w prawdziwej przeglądarce (bez sieci backendu, z lokalnym serwerem uruchamianym przez test):

```sh
cd scripts/jsdom && npm install
CHROME_BIN=/ścieżka/do/chromium node rejtools.browser.js
npm test
```
