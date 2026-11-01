# Podglądy kart projektów

Podglądy pozostają rzeczywistymi stronami w ramkach, a nie atrapami. Są włączane w pobliżu widoku: observer i awaryjny skan dodają je do wspólnej kolejki, która rozkłada starty w czasie. Fokus, najechanie oraz ręczne ponowienie mogą rozpocząć podgląd od razu. Zmiany niezwiązane z kartami, np. liczników, nie wyzwalają ponownego skanowania całego dokumentu. Awaryjne sprawdzenie podczas przewijania nie uruchamia się w każdej klatce.

Wyróżnione karty mają loader w HTML; pozostałe dostają go dynamicznie. Nie tworzymy duplikatu istniejącego loadera. Animacje małych kulek startują dopiero w trakcie ładowania podglądu i są usuwane po zakończeniu lub błędzie; ponowienie je uruchamia ponownie. To nie dotyczy głównej nakładki strony. Same uruchomione ramki mogą nadal zużywać zasoby i zależą od dostępności oraz zachowania osobnych projektów.

Kontrola: `cd scripts/jsdom && npm test`, `node preview-performance.test.js` i `CHROME_BIN=… node preview-performance.browser.js`; układ kart: `CHROME_BIN=… node project-cards.browser.js`. Animacja 3D nie jest mierzona ani automatycznie wyłączana przez te optymalizacje.
