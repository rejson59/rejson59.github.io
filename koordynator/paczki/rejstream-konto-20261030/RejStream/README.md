# RejStream

Polskojęzyczny katalog niezależnej animacji. Vite + JavaScript + Lucide, Node.js 22.12+.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite nasłuchuje na `0.0.0.0`, akceptuje host podglądu Arena. `base: './'` i routing hash pozwalają publikować pod `/RejStream/` na GitHub Pages. Build `dist/` jest ignorowany przez Git.

## Biblioteka i audio

- **The Amazing Digital Circus:** wszystkie 9 odcinków, jeden sezon; pilot jest odcinkiem 1.
- **Helluva Boss:** pełne sezony 1 (8) i 2 (12), osobne piloty i wszystkie 14 opublikowanych Helluva Shorts. Pięć wpisów S3 prowadzi do płatnego Prime Video, nie do bezpłatnych osadzeń.
- **Murder Drones:** cały serial, 8 odcinków z oficjalnego kanału GLITCH, od pilota do Absolute End. Wszystkie mają oficjalny polski dubbing BruDolina Studios w ścieżkach audio YouTube. Źródła, daty i ograniczenia w `SOURCES.md`.
- Big Buck Bunny nie jest częścią katalogu.

Oficjalny dubbing wybiera się w YouTube: **⚙ → Ścieżka dźwiękowa → Polski**. API iframe nie oferuje wiarygodnego automatycznego wyboru ścieżki audio. Nie udajemy takiej funkcji i nie tworzymy sztucznych osobnych uploadów językowych. Inne dubbingi/napisy zależą od źródła i regionu.

Helluva Boss: potwierdzone pełne fanduby całego S1, dziewięciu odcinków S2 (1, 3–5, 7–11), pilota 2019 i shorts 1, 3, 4. S2E2 ma lektora, nie dubbing. S1E1: NanoKarrin lub BruDolina Studios. S2E1 z ograniczeniem wieku otwiera YouTube zamiast obiecywać osadzenie. Brak potwierdzonego pełnego fandubu S2E6, S2E12 i Mission: Zero — UI mówi to wprost. Autorzy i kanały są podpisani.

Preferowane napisy PL: parametry URL plus ograniczone próby przez API po gotowości i zmianie modułów. `captions.track` to próba kompatybilności, nie gwarantowany kontrakt YouTube; potwierdzenie wymaga odczytu języka. Brak ścieżki lub obsługi API daje instrukcję ustawień, nie fałszywy komunikat sukcesu. Zmiana napisów nie przeładowuje iframe. Preferencja oryginału/polskiego uploadu pozostaje ustawieniem interfejsu na urządzeniu.

Zwiastuny są osadzone pod opisem i dopasowane do sezonu. Brak zweryfikowanego zwiastuna = brak playera, zamiast podmiany sezonu. Bez autoplay i bez zapisu zwiastunów do historii. Logo jest w `public/rejstream-mark.svg`.

## Konta społeczności i prywatność

RejStream używa **istniejących kont społeczności** z `rejson59.github.io/spolecznosc.html` w projekcie Supabase `rejson-widgets`. To ten sam własny system kont, nie Supabase Auth: stare konta mogą używać czterocyfrowego PIN-u, nowe i zaktualizowane — hasła. Zakładka `#account` loguje przez istniejące `community_login` lub rejestruje przez `community_register`, sprawdza `community_whoami` i pobiera bibliotekę konta. Rejestracja w RejStream wymaga hasła minimum 10 znaków i maksymalnie 72 bajty; RPC zachowuje nazwę parametru `p_pin` dla kompatybilności.

- Gość może oglądać odcinki i lokalne pliki; **nie zapisujemy ani nie wznawiamy jego historii**.
- Historia `#history`, zapisane sekundy (z ułamkami), ulubione i ręczne „obejrzane” wymagają konta; dane przechowywane są w Supabase, nie w localStorage/IndexedDB.
- W przeglądarce pozostają token sesji społeczności (`rejson_community_session_v1`, wspólny na tym samym originie) i preferencje interfejsu. Hasło ani PIN nie są zapisywane.
- Stare lokalne `rej-playback-v1`, `rej-recent`, `rej-favorites`, `rej-watched`, `rej-saved` są usuwane. **Nie przenosimy anonimowej historii na konto bez zgody.**
- Dane są w pamięci aplikacji podczas sesji; synchronizacja zmienionych wpisów odbywa się co około 5 s. Błąd jest widoczny globalnie, a kolejkę można ponowić z ekranu konta. Nie ma trwałego lokalnego fallbacku offline; zamknięcie karty przed udanym zapisem może utracić ostatnie sekundy.
- Wylogowanie i zmiana konta usuwają dane z pamięci; stary tracker nie może zapisać pozycji do nowego konta. Zmiany wspólnej sesji w innych kartach są obsługiwane przez `storage`.
- Odtwarzanie zewnętrzne w YouTube/Prime Video nie jest mierzone. Pomiar odtwarzania nie zlicza seeków, pauzy ani buforowania.

`supabase/rejstream.sql` zawiera wdrożoną migrację: tabela `rejstream_library` z RLS i odebranym bezpośrednim dostępem dla `anon`/`authenticated`. RPC odczytu/zapisu ustalają użytkownika **wyłącznie z tokena przez istniejące `community_session_user`**, nigdy z identyfikatora przesłanego przez klienta. Kod przeglądarki zawiera tylko istniejący publiczny klucz anon. Nie dodajemy klucza service-role i nie zmieniamy kont, PIN-ów ani tabel społeczności.

Odziedziczony PIN czterocyfrowy zapewnia mniejszą ochronę niż hasło; istniejące konto może go zmienić na hasło w ustawieniach konta na stronie głównej. Integracja nie dodaje MFA ani odzyskiwania zapomnianego hasła. Token sesji jest poufny. Nie należy umieszczać go w linkach ani logach.

## Player i interfejs

Katalog, wyszukiwanie seriali/odcinków, sezony, sortowanie, lista/siatka, poprzedni/następny odcinek i kolejka. Mobilne menu ma historię; konto jest pod awatarem nagłówka i w menu desktopowym. Ulubione i oznaczanie obejrzanych zachęcają do zalogowania, ale nie blokują oglądania.

Historia pokazuje najnowszą zapisaną pozycję materiału, datę i link do odcinka. Oddzielne uploady zachowują oddzielny postęp. Pasek przy odcinku pokazuje pozycję/długość, nie skumulowany czas. Wznawianie wykorzystuje `start` oraz najwyżej jedną korektę API po cue/play przy odchyleniu >1,5 s; bez redundantnego seekowania podczas `onReady`. Rzeczywisty punkt startu zależy od dekodera YouTube.

Informacja o buforowaniu i ręczne „Wczytaj ponownie” po długim oczekiwaniu/błędzie, bez automatycznej pętli restartów i bez zakrywania kontrolek. Nie gwarantujemy usunięcia problemów sieci i kodeków YouTube. Zwiastuny podpinają API blisko viewportu.

Własny player HTML5: legalnie posiadane lokalne pliki, SRT/VTT, ±10 s, seek, tempo, głośność i fullscreen. **Bajtów wideo i napisów nie wysyłamy.** Po zalogowaniu nazwa/identyfikator pliku i pozycja są zapisywane na koncie; po powrocie trzeba ponownie wybrać plik. Kodeki zależą od przeglądarki.

Dostępność: skip link, etykiety, aria-current/pressed, fokus dialogu, Escape, skrót `/`, reduced-motion. Fonty Fontsource są lokalne. Miniatury źródłowe mają fallback przy niedostępnej sieci.

## Walidacja i wdrożenie

- 73 testy Vitest/jsdom: dane, napisy/player, logowanie i izolacja sesji, cloud sync/retry, brak historii gościa, przejścia UI.
- Chromium: 32 kombinacje tras/szerokości (360, 390, 768, 1440), logowanie, historia/wznowienie, ulubione po reloadzie, brak lokalnego zapisu i wylogowanie. **Zamockowana sieć RPC/YouTube**, bez błędów JS i poziomego overflow.
- W działającym Supabase: RLS włączone, brak bezpośrednich praw anon do tabeli; transakcyjny test dwóch tymczasowych użytkowników potwierdził odmowę gościa, własny odczyt i brak odczytu/usuwania danych drugiego konta. Cały test wycofano (`ROLLBACK`), bez zmian prawdziwych kont.
- Produkcyjny build oraz npm audit. Rzeczywistego logowania przez przeglądarkę do Supabase, streamingu/dekodowania YouTube i wyboru języków nie da się sprawdzić w sandboxie z ograniczoną siecią.

Workflow `.github/workflows/pages.yml`: testy/build w PR, po scaleniu do `main` publikacja GitHub Pages. Frontend jest statyczny; funkcje konta wymagają Supabase. Filmów nie rehostujemy. Więcej o autorach i prawach: [SOURCES.md](SOURCES.md).

## Polskie tytuły i zachęta do konta

Wszystkie wpisy Digital Circus i Helluva Boss (także piloty, shorts i zewnętrzne wpisy S3) mają polski tytuł redakcyjny oraz oryginał: `Polski / English`. Nie przypisujemy tych tłumaczeń dystrybutorom ani autorom fandubów; informacja jest na liście i ekranie odcinka. Dla nietłumaczalnych nazw i celowego bełkotu jest to opisowa adaptacja redakcyjna. Murder Drones zachowuje wcześniej potwierdzone tytuły. Wyszukiwanie działa po obu wersjach. Historia konta wyświetla aktualny tytuł z katalogu, bez konieczności nadpisywania danych w Supabase.

Gość widzi niewielki baner z korzyściami (historia na koncie, zapisana sekunda, ulubione) przy wejściu i nad odtwarzaczem odcinka, również dla materiału zewnętrznego. Baner nie zasłania playera, nie odlicza czasu i nie blokuje odtwarzania. Zamknięcie usuwa tylko baner, nie iframe. Zamknięcie wejściowej zachęty obowiązuje do przeładowania strony, a odcinkowej — dla danego odcinka w tej sesji aplikacji; stan jest tylko w RAM, bez localStorage/cookies. Po zalogowaniu z banera wracamy do poprzedniej strony. Zalogowani nie widzą zachęty.

Dodatkowa walidacja: 24 kombinacje tras/szerokości Chromium (360, 390, 768, 1440), zamknięcie bez restartu iframe, powrót po logowaniu i brak banera po zalogowaniu. Sieć RPC/YouTube była symulowana; nie stanowi to testu rzeczywistej transmisji.

## Poprawka synchronizacji konta

Klient RPC akceptuje pustą udaną odpowiedź HTTP 200/204 (`rejstream_write` zwraca SQL `void`), zamiast zawsze wywoływać `response.json()` i zgłaszać fałszywy błąd po poprawnym zapisie. Odpowiedzi JSON nadal są odczytywane, a błędy HTTP zachowują status/kod do klasyfikacji. Błędna niepusta odpowiedź sukcesu nie jest traktowana jako potwierdzenie zapisu.

Po problemach sieciowych/408/429/5xx kolejka w RAM jest ponawiana automatycznie co 10, 20, 40, maksymalnie 60 s oraz po odzyskaniu połączenia (`online`). Nowe próbki odtwarzania nie resetują tego opóźnienia. Odrzucenie sesji/danych przez serwer nie powoduje ciągłej pętli żądań; użytkownik widzi odpowiedni komunikat i ma ręczne ponowienie. Równoległe wywołania synchronizacji czekają na tę samą operację. Historia nadal nie trafia do trwałej pamięci przeglądarki.

Aktualna walidacja: 81 testów, w tym transport HTTP z pustą odpowiedzią 200/204, JSON, błędy nie-JSON, usunięcie potwierdzonych wpisów z kolejki, automatyczne retry i brak zapętlenia przy nieważnej sesji. To testy symulowanej sieci, nie rzeczywistego logowania kontem użytkownika.

## Wycofane wpisy LEGO

Na życzenie użytkownika usunięto LEGO Marvel Spider-Man: Wkręcony w Venoma oraz kompilację LEGO Ninjago. Nie odpowiadały wymaganiu popularnych, aktualnych filmów pełnometrażowych. Nie są dostępne w katalogu ani pod starymi adresami playera. Historia usuniętych wpisów nie jest pokazywana jako lokalny film; zapisów konta w Supabase nie kasujemy. Pozostała biblioteka i funkcje konta pozostają bez zmian. Nie dodano zastępczych materiałów bez potwierdzonego źródła pełnego filmu.

### Meta Runner

Added GLITCH's Meta Runner: season 2 (10 episodes) and final season 3 (8 episodes), plus the official season-one Animated Movie Cut (124 minutes). The season-one edit is explicitly labelled, not advertised as a theatrical film or ten separate episodes. Polish audio/subtitles are unconfirmed. See SOURCES.md for provenance and playback-verification limitations.

### Przegląd kompletności (25.10.2026)

Helluva Shorts: wszystkie 14 opublikowanych numerowanych odcinków, w tym uzupełnione 2 oraz 5–14. Sezony 1–2 Helluva: 8/8 i 12/12; sezon 3: pięć dotąd opublikowanych odcinków, tylko w Prime Video, emisja trwa. Circus: 9/9; Drones: 8/8; Meta Runner S2/S3: 10/10 i 8/8. **Meta Runner S1 nie ma dziesięciu osobnych oryginalnych odcinków — nadal jest tylko skrócony montaż.** Pełna tabela audytu i ograniczenia w SOURCES.md. Testy kompletności utrwalają ten stan, nie sprawdzają dostępności online na bieżąco.

### Kolejność pierwszego seansu

Na stronie każdego serialu znajduje się propozycja redakcji z odnośnikami.
Helluva: Mission: Zero → S1 → S2 → S3 (Prime Video, zewnętrznie).
Pilot 2019 pozostaje opcjonalnym dodatkiem poza aktualnym kanonem; Shorts
polecamy po S2, nie wciskamy ich w główny ciąg. To rekomendacja na pierwszy
seans, nie oficjalna chronologia. Przyciski startu prowadzą do Mission: Zero.
Nawigacja poprzedni/następny przechodzi między sezonami i wstępem, ale
kolejka boczna pozostaje listą bieżącego sezonu. Nie ma automatycznego
przekierowania do Prime ani automatycznego uruchamiania kolejnego odcinka.
Circus i Drones zaczynają się od pilota będącego odcinkiem 1. Meta Runner:
S1 Movie Cut (nie 10 oryginałów) → pełne S2 → pełne S3.
Identyfikatory odcinków i zapisane pozycje nie zmieniają się.

### Metal Family

Piąty serial: 10 odcinków S1 i 7 dotąd wydanych S2 (sezon trwa), z oficjalnego
kanału Metal Family English. Polski fandub BruDolina do S1E1–5; pozostałe
odcinki z angielskim audio, bez obietnicy polskich napisów. Proponowana
kolejność: S1 → S2. Q&A, teledysk/prolog i zwiastuny nie są doliczane do
17 pełnych odcinków. Publiczne metadane sprawdzone 25.10.2026; ograniczenia
odtwarzania i źródła opisano w SOURCES.md. Nowa suma ciekawostki: około
29 godz. 16 min dla 5 seriali (w tym zewnętrzne odcinki Prime Video).

### Lackadaisy i Gameoverse

- Lackadaisy: pilot + 5 **wybranych** krótkich animacji w osobnej zakładce;
  to nie cały sezon 1. Zacznij od pilota; dodatki opcjonalne. Audio EN,
  polskie napisy/dubbing niepotwierdzone.
- Gameoverse (GLITCH, 2026): jeden wydany pilot 32:26 z oficjalnym dubbingiem
  PL w ustawieniach YouTube. Bez niewydanych odcinków i bez starej wersji 2009.
- Ciekawostka: 7 **tytułów**, około 30 godz. 25 min. To celowe rozróżnienie
  pilotów i pełnych seriali. Weryfikacja metadanych: 25.10.2026; SOURCES.md.

### Polecane i uzupełnienia PL (25.10.2026)

Kolejność: Circus → Helluva → Metal Family → Gameoverse → Drones → Lackadaisy
→ Meta Runner. Dodano 7 fandubów: Lackadaisy pilot (VOX record) i Stratagem
(Pawlikowe), Helluva Shorts 2 (Unima), Metal Family S1E7–9 (Serhiej) i S2E6
(HellsBroadcastStudio, wersja cenzurowana). Są wybierane domyślnie przy preferencji
polskiego audio. Nadal **nie ma potwierdzonego kompletu dubbingu do wszystkiego**;
pozostałe braki i wykluczenia opisano w SOURCES.md. Dubbingów nie doliczamy
ponownie do długości katalogu. Starsze wpisy dokumentacji odzwierciedlają stan
poprzednich aktualizacji; ten wpis aktualizuje ich informacje o polskim audio.
