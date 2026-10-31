# RejTools

Publiczna strona `/rejtools` to lista zwijanych narzędzi z wyszukiwaniem i kategoriami. Linki do sekcji (np. `/rejtools#obraz`) otwierają odpowiednie narzędzie. Obszar danych narzędzi oznaczono `data-rj-private` dla ochrony migawek widżetu.

## Konwersja audio i wideo

Konwerter korzysta z lokalnego, jednowątkowego FFmpeg.wasm. Przy pierwszej konwersji pobierany jest z tej samej strony silnik ok. 31 MiB, ale wybrany plik nie jest wysyłany na serwer. Plik wejściowy do 100 MiB jest wczytywany do pamięci. Wydajność i dostępna pamięć zależą od urządzenia; duże pliki mogą być powolne lub nie zmieścić się w pamięci. Przycisk anulowania kończy worker i zwalnia jego zasoby.

- Rozpoznawane rozszerzenia plików wideo: MP4, M4V, MOV, MKV, WebM, AVI, FLV, MPEG, MPG, TS, 3GP. Wyjście: MP4/MOV/MKV (H.264 i AAC), WebM (VP8 i Vorbis) albo animowany GIF bez dźwięku (maks. 640 px szerokości, 10 kl./s).
- Rozpoznawane rozszerzenia audio: MP3, WAV, M4A, AAC, OGG/OGA, OPUS, FLAC, AIF/AIFF, WMA. Wyjście: MP3, M4A (AAC), WAV (PCM), OGG (Vorbis), FLAC. Ze źródła wideo można też wyodrębnić pierwszą ścieżkę dźwięku.
- Dostępność zależy od kodeków wewnątrz pliku, a nie tylko jego rozszerzenia. Pliki uszkodzone, chronione DRM lub pozbawione potrzebnej ścieżki mogą się nie dać przekonwertować. Zachowywana jest pierwsza ścieżka wideo i pierwsza ścieżka audio; napisy, dodatkowe ścieżki i metadane mogą zostać pominięte. Konwersja stratna może obniżyć jakość, a FLAC nie odzyska jakości utraconej we wcześniejszym kodowaniu.
- [Informacje o komponentach, źródłach i licencjach](../vendor/ffmpeg/README.md): `@ffmpeg/ffmpeg` 0.12.15 (MIT) i `@ffmpeg/core` 0.12.10 (GPL-2.0-or-later).

## Pozostałe narzędzia

Zmiana szerokości/formatu PNG, JPEG i WebP, licznik i proste formatowanie tekstu, formatowanie JSON, generator haseł i SHA-256 pliku działają w przeglądarce. Zewnętrzne elementy strony (np. widżet zgłoszeń) pozostają osobnymi funkcjami witryny.

Obrazy do 20 MiB i 40 mln pikseli; szerokość 1–6000 px, bez powiększania oryginału. JPEG wypełnia przezroczystość bielą; wsparcie WebP zależy od przeglądarki. SHA-256 obsługuje pliki do 100 MiB, które są wczytywane do pamięci, i wymaga Web Crypto (zwykle HTTPS). Hasła powstają przez `crypto.getRandomValues`; kopiowanie wymaga dostępnego schowka, z ręcznym fallbackiem.

## Testy

```sh
cd scripts/jsdom && npm install
CHROME_BIN=/ścieżka/do/chromium node rejtools.browser.js
# Rzeczywiste konwersje WebM do wszystkich oferowanych formatów, audio WAV → MP3,
# test uszkodzonego pliku, limitu, anulowania, nawigacji i geometrii strony.
# Opcjonalny ffprobe dodatkowo weryfikuje kodeki plików wynikowych.
CHROME_BIN=/ścieżka/do/chromium FFPROBE_BIN=/ścieżka/do/ffprobe node rejtools-convert.browser.js
npm test
```

Test używa małego, syntetycznego `fixtures/rejtools-sample.webm` (kolorowa klatka i ton). Przeglądarka nie łączy się z backendem; lokalny serwer testowy obsługuje typ MIME WebAssembly.

## Nowe narzędzia PDF i pozostałe dodatki

- **PDF**: łączenie do 20 dokumentów w kolejności wybrania, wybieranie i zmiana kolejności stron przez podanie np. `3, 1-2`, obrót wybranych stron oraz obrazy PNG/JPEG do PDF (jedna strona A4 na obraz). Limity: 50 MiB łącznie, do 1000 stron i 20 plików. Nie obsługujemy zabezpieczonych hasłem dokumentów; modyfikacja może unieważnić podpisy cyfrowe i nie zawsze zachowuje formularze, zakładki lub inne dodatkowe dane. Wybór stron można wykorzystać do usunięcia niepotrzebnych stron.
- **Kody QR**: lokalne generowanie PNG z linku lub tekstu, łącznie z polskimi znakami. **Kodowanie tekstu**: Base64 UTF-8 oraz kodowanie komponentu URL; nie jest to szyfrowanie.
- Kalkulator procentów, przelicznik jednostek długości, masy i temperatury, różnica między datami oraz kryptograficzne losowanie liczb i identyfikatorów UUID v4.
- Dodatkowe biblioteki pobierane są z tej samej witryny tylko przy pierwszym użyciu danego narzędzia: [pdf-lib](../vendor/pdf-lib/README.md), [qrcode-generator](../vendor/qrcode/README.md). Dane plików i tekstu nie są wysyłane przez narzędzia na serwer. Liczniki i widżet pozostają odrębnymi elementami strony.

Dodatkowe testy (z katalogu `scripts/jsdom` po `npm install`):

```sh
CHROME_BIN=/ścieżka/do/chromium node rejtools-extra.browser.js
CHROME_BIN=/ścieżka/do/chromium node shared-topbar.browser.js
```

Test PDF faktycznie generuje, łączy i odczytuje dokumenty, sprawdza kolejność oraz obroty; kod QR jest dekodowany z wygenerowanego obrazu.
