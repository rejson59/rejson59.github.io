# Wspólne powiadomienia

Jeden dzwonek w nagłówku na stronach głównej witryny łączy dwa istniejące źródła. Nie jest to powiadomienie push: sprawdzanie działa, gdy strona jest otwarta i widoczna.

- **RejChat:** nowe reakcje i komentarze do wpisów oraz odpowiedzi na komentarze. Baza zapisuje je dla odbiorcy i weryfikuje token; odczyt synchronizuje się między urządzeniami. Kliknięcie prowadzi do konkretnego wpisu.
- **Projekty i tablica:** dla obserwowanych projektów porównywane są prawdziwe daty GitHuba i nowe publiczne zgłoszenia; dla podpisanych nickiem zgłoszeń także status i odpowiedź. Dodatkowo można zobaczyć potwierdzoną obecność właściciela. Te powiadomienia, obserwacje, punkt odniesienia i odczyt pozostają **na tym urządzeniu**, w przeglądarce. Nie są to prywatne, uwierzytelnione zgłoszenia: tablica jest publiczna, a historyczny system wiąże wpis z nickiem. Tablica zwraca maksymalnie 120 pozycji i nie zwraca zamkniętych; dlatego nie wszystkie starsze lub zamknięte zgłoszenia są widoczne. Projektowe API GitHuba bywa ograniczane lub niedostępne; wówczas zachowujemy ostatnią migawkę zamiast udawać zdarzenie.

Pierwsza wizyta dla konta tworzy punkt odniesienia, bez importu wcześniejszej historii. Odczytane zdarzenia mają stabilne identyfikatory, aby opóźnione odświeżenie nie przywracało ich do listy. Wyniki dla wcześniejszej sesji nie mogą być pokazane po zmianie konta. Kliknięcie zgłoszenia prowadzi na tablicę; jeśli nie ma go już na publicznej liście, tablica informuje o tym zamiast udawać sukces.

Sam wspólny panel nie podłącza automatycznie osobnych aplikacji ani ich prywatnych zdarzeń. Kolejne źródło należy dopiero bezpiecznie zintegrować z prawdziwymi danymi i kontem odbiorcy; nie wysyłać tokenu do obcej domeny i nie generować sztucznych zdarzeń.
