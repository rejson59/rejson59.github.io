# Podglądy kart projektów

Podglądy pozostają rzeczywistymi stronami w ramkach, a nie atrapami. Observer uruchamia je z wyprzedzeniem (800 px): wspólna kolejka daje pierwszeństwo widocznym kartom i rozkłada starty. Fokus, najechanie oraz ręczne ponowienie mogą rozpocząć podgląd od razu. Na stronie z IntersectionObserver przewijanie nie wywołuje dodatkowego pomiaru każdej karty; awaryjny skan jest dla starszych przeglądarek, powrotu z bfcache i nietypowych sytuacji.

Odległe o ponad 1200 px ramki po krótkiej przerwie są zwalniane, żeby ich filmy, animacje i skrypty nie obciążały strony przez całą wizytę. Po powrocie uruchamiają się automatycznie, zwykłym adresem, dzięki czemu przeglądarka może użyć cache. Nie zwalniamy karty z focusem ani poprawnej migawki. Udane i nieudane podglądy nadal zachowują odpowiednio podgląd albo przycisk ponowienia. Krótkie oddalenie nie przeładowuje ramki. To kompromis: bardzo szybki powrót po dłuższym scrollowaniu może wymagać ponownego wczytania strony projektu i zależy od sieci oraz zasad cache danego projektu.

Wyróżnione karty mają loader w HTML; pozostałe dostają go dynamicznie. Nie tworzymy duplikatu istniejącego loadera. Animacje małych kulek startują dopiero w trakcie ładowania podglądu i są usuwane po zakończeniu lub błędzie; ponowienie je uruchamia ponownie. To nie dotyczy głównej nakładki strony. Ramki bliskie widoku nadal mogą zużywać zasoby i zależą od dostępności oraz zachowania osobnych projektów.

Kontrola: `cd scripts/jsdom && npm test`, `node preview-performance.test.js` i `CHROME_BIN=… node preview-performance.browser.js`, `CHROME_BIN=… node preview-retention.browser.js`; układ kart: `CHROME_BIN=… node project-cards.browser.js`. Animacja 3D nie jest mierzona ani automatycznie wyłączana przez te optymalizacje.
