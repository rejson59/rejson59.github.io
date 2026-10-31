# Strony i reklamy

`uslugi.html` opisuje tworzenie stron. Link „Napisz do mnie” prowadzi do istniejącego formularza `partnerstwo?temat=strona#propozycja`. Parametr ustawia w formularzu rodzaj `other` i widoczną, edytowalną treść; zapytanie trafia do tej samej prywatnej skrzynki w panelu admina. Nie uruchamia płatności ani zamówienia.

`js/side-ads.js` i `css/side-ads.css` tworzą jedną nieusuwalną ramkę po prawej przy szerokości od 1200 px. Na mniejszych ekranach wracają dwa stałe banery obok siebie u dołu. W obu wersjach widnieje podpis „mini reklamy i promocje :)”. Banery promują RejChat, RejFile i zapytania o reklamę; nie ma automatycznej sprzedaży, płatności ani dodatkowego śledzenia. Pasek mobilny rezerwuje miejsce pod treścią i odsuwa pigułkę; na stronach serwisu działa również bez JavaScriptu. Globalny worker może dołączać go do zgodnych projektów tego samego originu, ale obca domena, osobny worker lub CSP mogą to uniemożliwić.

Na stronie głównej oczko pokazuje przybliżoną liczbę przeglądarek z zarejestrowanym wejściem od północy czasu warszawskiego (`site_visitors_today`). Funkcja zwraca wyłącznie sumę z istniejących danych licznika; nie udostępnia identyfikatorów. Zabezpieczenie przed ponownym nabijaniem i wspólne IP mogą spowodować pominięcie części odwiedzin, zwłaszcza po północy. Przy błędzie lub nieaktualnej dacie zamiast wymyślonej wartości widnieje „—”.
