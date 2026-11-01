# Notatki RejFile

Notatka korzysta z tego samego magazynu i mechanizmu dostępu co plik: link z sekretem we fragmencie lub wskazane konto, wygaśnięcie po 3 dniach oraz cofnięcie dostępu przez nadawcę. Nie jest szyfrowana end-to-end. Link umożliwia dostęp każdej osobie, która go otrzyma. Udostępnienie w RejChat wymaga świadomego dodania i wysłania wiadomości na czacie publicznym.

Edytor i podgląd obsługują tekst, podstawowe wyróżnienia, akapity, nagłówki, listy, wybrane style tekstu i bezpieczne odnośniki. Wklejane złożone dokumenty mogą wyglądać inaczej: obrazy, tabele i część układu nie są zachowywane. Limit notatki to 1 MiB (włącznie z formatowaniem), a zwykłego pliku nadal 100 MiB. Przycisk kopiowania próbuje skopiować tekst z formatowaniem, a jeśli przeglądarka nie obsługuje zapisu HTML, kopiuje sam tekst.

Format `.rjnote` to JSON z rodzajem `rejfile-note`, wersją 1, tytułem i HTML zawężonym do bezpiecznego podzbioru. Przy wklejaniu, tworzeniu oraz ponownie w podglądzie tworzone są nowe elementy wyłącznie z listy dozwolonych znaczników i stylów; aktywna zawartość i źródła zewnętrzne nie są kopiowane. Nawet plik o takim rozszerzeniu może nie być notatką — wtedy pozostaje normalne pobieranie. Nie należy renderować pola `html` jako zaufanego.

Testy: `node scripts/jsdom/rejfile.test.js`, `node scripts/jsdom/rejfile-chat.test.js` oraz `CHROME_BIN=… node scripts/jsdom/rejfile-notes.browser.js` (ostatni używa mocka API i magazynu).
