# Wspólny topbar

Strona główna i podstrony używają tej samej nawigacji oraz `css/shared-topbar.css`: te same pozycje, rozmiar logo, kolory, układ i menu dla danego rozmiaru okna i motywu. Oznaczenie `rj-shared-header` i `rj-shared-inner` pozwala odizolować wygląd od starszych arkuszy poszczególnych stron. Odnośniki do profilu w zalogowanej sesji korzystają z `js/rejchat-profiles.js`. Przy braku JavaScriptu `css/shared-topbar-nojs.css` odsłania menu.

**Ustawień wyglądu nie ma w topbarze.** Motyw i animacje przełącza się w wyspie (pigułka na dole, widok „Ustawienia” z kołem zębatym) — topbar został samą nawigacją. Dzięki temu na telefonie nie ma trzech przycisków obok logo, a menu mieści się w całości.

Na ekranach do 1200 px menu (`#site-nav`) liczy szerokość od całego topbaru — `.header-right` ma `position: static`, więc kafle nie są ściskane do szerokości grupki ikon. Pozycje główne układają się w dwie kolumny, „Więcej” zajmuje cały wiersz, a podmenu ma dwie równe kolumny na pełnej szerokości. Wiersze mają min. 46 px, a lista ma limit wysokości, żeby nie wchodziła pod wyspę.

Powiadomienia oraz liczniki strony głównej są nadal dostępne w oddzielnym wierszu poniżej topbaru (ich dane i logika nie zmieniły się). Status tablicy i wylogowanie admina również pozostają poza wspólnym topbarem jako funkcje konkretnych podstron. Strony przekierowań i tymczasowa plansza podróży nie zastępują nawigacji docelowych stron.

Porównanie topbaru strony głównej i podstron, stanów zalogowanych, jasnego/ciemnego motywu, rozwiniętego menu, fallbacku bez JS i kolizji z reklamą:

```sh
cd scripts/jsdom && npm install
node home-link.test.js
CHROME_BIN=/ścieżka/do/chromium node home-link.browser.js
CHROME_BIN=/ścieżka/do/chromium node topbar-consistency.browser.js
CHROME_BIN=/ścieżka/do/chromium node responsive.browser.js
CHROME_BIN=/ścieżka/do/chromium node account-sidebar.browser.js
```

Ikona domku ma własny kształt SVG w HTML (nie zależy od pobrania zewnętrznego pliku ikon), prowadzi na `/` i jest widoczna na wszystkich stronach ze wspólnym topbarem, poza zwijanym menu; działa też bez JavaScriptu. Ta sama ikona pozostaje na stronie głównej, by nie zmieniać geometrii nawigacji między stronami.

Na starszych stronach przekierowujących i awaryjnych ekranach podróży domek jest osobnym odnośnikiem, bo te krótkotrwałe strony nie używają topbaru.
