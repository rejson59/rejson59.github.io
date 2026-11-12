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

## Pozycje menu i szkło (październik 2026)

- Pozycje główne (ikony): Konto, RejFile, RejSejf, RejChat, RejTools.
- Panel „Więcej”: Tworzenie stron, Partnerstwo, **RejClass**, Licencja, „Szklane studio” (tylko administrator), GitHub.
- Strona `/widzety` została usunięta razem z kopią w `rejhub2/`. Stare adresy (`/widzety`, `/widzety.html`, `/board`, `/rejson-widgets/board`) przekierowują trwale (301) na `/`, a odnośnik zniknął z menu, stopki reklam i `sitemap.xml`.
- „Szklane studio” ma w topbarze atrybut `data-admin-only`. Domyślnie jest schowane (`css/shared-topbar.css`), a pokazuje je `html.rj-admin-session` ustawiana przez `js/shared-topbar.js` na podstawie czytelnej podpowiedzi `rejhub_admin_hint`. To wyłącznie warstwa wygody — dostęp do strony nadal chroni podpisane, HttpOnly ciasteczko `rejhub_admin` i `middleware.js`.
- Szkło jest bardziej przezroczyste: mocniejszy obiektyw (`blur(26px) saturate(175%)`), jaśniejsze refleksy i wyraźniejsza krawędź, a tapeta pod spodem ma mniejsze przyciemnienie (`brightness(1)` i lżejsza zasłona). Czytelność tekstu zapewnia kontrast tokenów `--hub-ink`/`--hub-muted`, nie ciężka mgła.
- Panel admina na telefonie: zakładki to jedna przyklejona, przewijana linia z celami 46 px i przyciąganiem (`scroll-snap`), a kafelki przeglądu układają się w dwie kolumny.

## Mini reklamy na telefonie i pasek przewijania (listopad 2026)

- Pasek mini reklam **nie leży już na dole ekranu** — stoi tuż pod topbarem (`position: sticky`, `top` mierzone skryptem z dolnej krawędzi nagłówka i aktualizowane przy przewijaniu). Dzięki temu nie koliduje z wyspą, formularzami ani stopką, a pod nim zostaje cała wysokość na treść. Pusty „spacer” na dole strony zniknął.
- **Widać dokładnie jedną promocję naraz** — kafel zajmuje całą szerokość paska (bez drugiej kolumny), a zmiana następuje **co 3,5 sekundy** i wraca do pierwszej po ostatniej. Gdy ktoś dotknie paska, kafelka albo użyje kółka, jazda zatrzymuje się na 6 sekund; w tle karty i przy `prefers-reduced-motion` nie startuje. Podpis „przesuń →” został usunięty.
- Kropki po prawej pokazują, która promocja jest na ekranie (chowają się poniżej 420 px). Na wąskim telefonie (≤560 px) etykieta „mini reklamy” również chowa się, oddając miejsce treści; pasek ma 60 px wysokości.
- **Pasek przewijania** (`css/scrollbar.css` + `js/scrollbar.js`) jest wspólny dla całego serwisu: zaokrąglona „kropla” na desktopie, na telefonie 4 px i prawie przezroczysta, dopóki strona stoi. Klasa `rj-scrolling` (dodawana na 700 ms po ruchu) rozjaśnia suwak tylko wtedy, gdy naprawdę się przewija.
- Panel admina na telefonie: pozioma, przyklejona szyna zakładek (46 px, `scroll-snap`), a nie kolumna pigułek. Wcześniejsza reguła `grid` + `width: 100%` w `css/glass-last.css` działa teraz wyłącznie od 1101 px — na telefonie to ona rozdmuchiwała listę sekcji na cały ekran.

## Profil 2.0, ikony RejTools i RejClass (listopad 2026)

- **Nawigacja:** RejTools dostał ikonę narzędzi (`#tools` w `assets/ui-icons.svg`), a RejClass — książkę
  (`#book`). RejClass wyszedł z panelu „Odkryj więcej” i stoi teraz w głównym pasku, zaraz po RejTools,
  czyli z resztą podstron zaczynających się na „Rej”. Kolejność na każdej stronie:
  Konto · RejFile · RejSejf · RejChat · RejTools · RejClass · Więcej.
- **Adresy:** pozycja RejClass w pasku ma być zawsze `/rejclass` (bezwzględny) — pilnuje tego
  `scripts/jsdom/profile-studio.test.js`.
- **Profil (`/profil`)** to teraz dwie zakładki: *Profil* (to, co widzą inni) i *Edytuj* (ten sam
  ekran, w którym podgląd na żywo zmienia się razem z wyborami). Nowy arkusz `css/profile-studio.css`
  ma własny, ciemniejszy tint szkła (`--pf-glass`), bo wspólne warstwy `glass-update.css` i
  `glass-last.css` rozjaśniały kartę na tyle, że na tęczowej tapecie ginął tekst. Karta profilu jest
  teraz wyjęta z obu tych list — nie dokładaj jej tam ponownie.
- **Galeria awatarów:** 24 wzory w czterech kategoriach (Kosmos, Zwierzęta, Natura, Klimat) plus
  wyszukiwarka i przycisk „Zaskocz mnie”. Katalog jest jedno źródło: `js/rejchat-profiles.js`
  (`avatarCatalog`), pliki leżą w `assets/avatars/`.
- **Nowe rzeczy w profilu:** ramka awatara (6 wariantów), tło nagłówka (6 wariantów), kompletność
  profilu, licznik znaków bio z podpowiedziami, oznaczanie niezapisanych zmian i przycisk
  „Przywróć”. Wszystko zapisuje się jednym RPC `rejchat_update_profile`.
- **Baza:** migracja `supabase/2026-11-12_rejchat_profile_studio.sql` dodaje kolumny `frame` i
  `banner`, poszerza listę awatarów i przekazuje je w `rejchat_get_profiles` (razem z `updated_at`).
  Stare wywołanie z czterema argumentami dalej działa, bo nowe parametry mają wartości domyślne.

## Wyspa, mini RejChat i panel admina na telefonie (listopad 2026)

- **Wyspa zawsze przy dolnej krawędzi.** `syncAdsOffset()` w `rejhub2/hub/island.js` liczył samą
  wysokość paska mini reklam, nie patrząc, gdzie pasek stoi. Odkąd reklamy przeniosły się pod topbar,
  wyspa dostawała `--rj-ads: 60px` i „lewitowała” nad dołem ekranu. Teraz odstęp liczy się tylko wtedy,
  gdy pasek naprawdę jest przyklejony do dołu (`rect.top > innerHeight / 2`).
- **Pionowa wyspa.** Nowa opcja w ustawieniach (`data-switch="vertical"`, klucz
  `rj_island_orientation_v1`) zamienia pigułkę w wąską kolumnę przy krawędzi: zwinięta wyspa to
  58 × 96 px z logo i strzałką, a dock układa dziewięć przycisków jeden pod drugim. Pionowa wyspa
  automatycznie wybiera prawą krawędź (na środku zasłaniałaby treść), a przy niskim ekranie kolumna
  staje się przewijana, więc żaden przycisk nie znika.
- **Więcej ustawień:** pionowa wyspa, „Zaczynaj schowana”, wibracje (zapamiętywane w
  `rj_island_haptics_v1`), dotychczasowa pozycja lewo/środek/prawo, jasny motyw, animacje, cisza oraz
  „Przywróć domyślne”. Panel ustawień ma własne przewijanie i rośnie razem z treścią (`fit()`).
- **Mini RejChat pokazuje każdy czat:** zakładki *Ogólny*, *Linki* i *Prywatne*. Prywatne to skrzynka
  `rejchat_dm_inbox` z licznikiem nieprzeczytanych; kliknięcie rozmowy otwiera `rejchat_dm_list_v2`
  (każda rozmowa, nie tylko główna), a wysyłka idzie do `rejchat_dm_send_v2`. Strzałka w nagłówku
  wraca do listy rozmów, a „Otwórz ↗” prowadzi wtedy do `/rejchat#rozmowy`. Kropka na przycisku czatu
  w docku uwzględnia teraz również nieprzeczytane wiadomości prywatne.
- **Panel admina na telefonie:** tabela projektów nie ma już `min-width: 720px`. Poniżej 760 px każdy
  wiersz jest kafelkiem — nazwa projektu u góry, a pod nią wszystkie liczby z podpisami
  (`data-label`), więc online, kliknięcia, wejścia i unikalne osoby są widoczne bez przewijania w bok.
  Numery identyfikatorów (`#4821`) w liście identyfikatorów i liście odwiedzających dostały własne,
  nieprzezroczyste plakietki z mocnym kontrastem w obu motywach — wcześniej numery „pochodne”
  (IP + przeglądarka, sesja) miały kolor `--muted` i ginęły na jasnej tapecie.
- **Zero zieleni:** kropki stanu (online, sieć, statusy) w `island.css`, `admin-panel.css`,
  `community.css` i `rejson-widgets/css/admin.css` używają błękitu (`#6ea8ff` / `#4d8df6`) zamiast
  zieleni.

## Reklamy z opisami i nowe aplikacje (listopad 2026)

### Mini reklamy mobilne — wersja 10

- Pasek ma teraz **72 px** (`--rj-top-ads-height`), bo każda promocja dostała drugą, mniejszą linię:
  tytuł (`13 px`, mocny) i krótki opis (`10,5 px`, przygaszony). Opisy są krótkie celowo — mieszczą się
  w jednej linii i kończą wielokropkiem, więc na 320 px nic się nie ucina w połowie słowa.
- Cały zestaw promocji leży w **zaokrąglonej ramce** (`20 px`, cienka krawędź, delikatne wypełnienie),
  a pojedynczy kafel ma własny promień `15 px`. Pasek czyta się jak karta szkła, nie jak taśma napisów.
- Treść promocji jest w jednym miejscu: tablica `ADS` w `js/mobile-ads.js`. Ten sam układ jest
  w `<noscript>` na 24 stronach — bez JavaScriptu widać identyczne tytuły i opisy.
- Wersje: `mobile-ads.css?v=10`, `mobile-ads.js?v=10`. Test `mobile-ads.test.js` pilnuje liczby
  tytułów i opisów, a `mobile-ads.browser.js` — wysokości 72 px i tego, że kafel nie wychodzi za ramkę.

### Nowe aplikacje: `js/rejapps.css` + `/aplikacje`

- **Strona `/aplikacje`** zbiera wszystko w jednym miejscu. W menu „Więcej” (na każdej podstronie)
  jest link **Aplikacje**, a na stronie głównej sekcja „Aplikacje RejHuba” z pięcioma kartami.
- Wspólny arkusz `css/rejapps.css`: szkło, jeden błękitny akcent, promienie 22–26 px, przyciski
  min. 46 px, siatki zwijające się do jednej kolumny poniżej 980 px. Zero zieleni.
- **RejPlanner** (`js/rejplanner.js`): miesiąc od poniedziałku, 42 dni, wydarzenia i zadania,
  odhaczanie, wyszukiwanie w całym planie, przypomnienia `Notification` (tylko przy otwartej karcie),
  eksport `.ics` i kopia JSON. Dane w `localStorage` pod `rj_planner_v1`; daty jako `YYYY-MM-DD`
  w czasie lokalnym (bez `toISOString()`, które przesuwałoby dzień przy zmianie strefy).
- **RejGames** (`js/rejgames.js`): stała lista gier z kategoriami i wyszukiwaniem. Pozycje, które nie
  mają działającej wersji online (AbsurdalneGry, roblox-online), są oznaczone „W przygotowaniu”
  i prowadzą do repozytorium — lepiej pokazać prawdę niż martwy link.
- **RejMusic** (`js/rejmusic.js`): pliki z dysku przez `URL.createObjectURL`, playlista linków
  ze Spotify/YouTube/SoundCloud/Deezer przez oficjalne osadzenia (`iframe`). Świadomie **nie ma**
  „przesyłania utworów ze Spotify” — te serwisy nie pozwalają na pobieranie ani kopiowanie utworów.
- **RejMeme** (`js/rejmeme.js`): od rundy 2026-11-15 to **galeria memów społeczności + kolejka
  moderacji** (szczegóły niżej), a nie generator canvas. Stara wysyłka do RejChatu została zastąpiona
  wgrywaniem do galerii z zatwierdzaniem przez admina.
- **RejAsystent** (`js/rejassistant.js`): lokalne polecenia (otwieranie stron, motyw, „dodaj zadanie
  … na jutro”, wyszukiwanie) i opcjonalny model zgodny z OpenAI — klucz zostaje w `localStorage`
  (`rj_assistant_ai_v1`), adres API musi być `https://`, a bez klucza nic nie wychodzi z przeglądarki.

### Instalacja jako aplikacja (PWA)

- `rejhub2/manifest.webmanifest` + ikony `assets/app/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` (wygenerowane lokalnie, bez zewnętrznych źródeł).
- `js/install-prompt.js` pokazuje na telefonie zachętę „Dodaj do ekranu”: na Androidzie/Chrome używa
  `beforeinstallprompt`, na iPhonie tłumaczy kroki Safari. „Później” chowa baner na 30 dni,
  a w zainstalowanej aplikacji ( `display-mode: standalone` ) baner nie wraca.

### Powiadomienia — wersja 3

- Po włączeniu powiadomień od razu leci **powiadomienie testowe**, a przy włączonych powiadomieniach
  jest przycisk „Wyślij powiadomienie testowe”.
- `push-sw.js` (v4) obsługuje `RJ_NOTIFY_TEST` i odpowiada `RJ_NOTIFY_TEST_DONE`, więc panel wie,
  czy system naprawdę pokazał powiadomienie.
- Komunikaty mówią wprost, co zawiodło: brak zgody, zablokowana witryna, brak klucza VAPID, brak sesji.
- iPhone: push wymaga dodania RejHub do ekranu głównego (iOS 16.4+) — panel mówi o tym od razu.

### Bezpieczeństwo

- `rejhub2/vercel.json`: HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`,
  `COOP` oraz **CSP w trybie raportowania** (na start, żeby nie zablokować istniejących skryptów).
- `api/session.js`: limit 10 nieudanych logowań na 10 minut z jednego IP (`Retry-After`), sprawdzanie
  `Origin` (ochrona przed CSRF) i czyszczenie licznika po udanym logowaniu.

### RejHub 2.0 — runda „jeden pasek, muzyka i memy” (2026-11-15)

#### 1. Jeden topbar na każdej podstronie

- Znaczniki `<header class="site-header rj-shared-header rj-alerts-header">` są **identyczne co do
  znaku** na wszystkich 22 stronach z paskiem (`scripts/jsdom/topbar.test.js` pilnuje tego testem).
- Sam HTML nie wystarczał: strony aplikacji (`/aplikacje`, `/rejmusic`, `/rejmeme`, `/rejgames`,
  `/rejplanner`, `/rejasystent`) nie ładowały `css/glass-update.css`, więc pasek nie miał
  `--rju-vessel` (czyli tła), a osiem stron nie miało `css/liquid.css`. Teraz **każda** strona
  ładuje ten sam zestaw 18 arkuszy w tej samej kolejności:

  `style.css` → `liquid.css` → `responsive.css` → (arkusze strony) → `side-ads` → `mobile-ads` →
  `shared-topbar` + `<noscript>` `shared-topbar-nojs` → `rejchat-notifications` → `glass-update` →
  `glass2` → `loader` → `text-filter` → `push` → `topbar-split` → `page-reveal` → `island` →
  `scrollbar` → `glass-last`.

- Ujednolicono też wersje: `style.css?v=2026-11-12-posters-1`, `responsive.css?v=3` oraz jeden
  adres fontów (Inter / Space Grotesk / JetBrains Mono) — wcześniej część stron renderowała
  fallback systemowy, co samo w sobie zmieniało wygląd paska i treści.

#### 2. RejMusic — wyszukiwarka utworów (`js/rejmusic.js` v2)

- Jedno pole szuka w **dwóch oficjalnych katalogach**: Deezer (`api.deezer.com/search`, JSONP)
  i Apple Music (`itunes.apple.com/search`, JSONP). Wyniki są scalane i deduplikowane.
- Odsłuch to **oficjalna 30-sekundowa zapowiedź** (`preview` / `previewUrl`) — bez pobierania i bez
  obchodzenia zabezpieczeń. Przy każdym wyniku jest też „Otwórz ↗” do platformy.
- Utwory z Deezer można dodać do playlisty jako **oficjalny osadzony odtwarzacz**
  (`widget.deezer.com`), tak samo jak linki Spotify/YouTube/SoundCloud wklejane ręcznie.
- Nowe widoki playlisty: **Playlista / Ulubione / Historia** (`rj_music_favs_v1`,
  `rj_music_history_v1`). Dalej działa wrzucanie plików z dysku (zostają na urządzeniu).
- Przyciski platform (Spotify, YouTube, SoundCloud, Deezer) przenoszą to samo zapytanie na stronę
  serwisu — bez scrapowania i bez proxy.

#### 3. RejMeme — galeria i kolejka moderacji (`js/rejmeme.js` v2)

- Generator canvas zniknął. Są cztery zakładki: **Galeria**, **Szablony (na czasie)**,
  **Wgraj mem**, **Moje zgłoszenia**.
- Galeria pokazuje wyłącznie memy ze statusem `approved`, z filtrem tagów, sortowaniem
  (najnowsze / najczęściej oglądane) i podglądem w lightboxie.
- Zakładka „Szablony” opisuje 12 najpopularniejszych formatów memów i linkuje do Know Your Meme —
  nie kopiujemy cudzych obrazków.
- Wgranie: JPG/PNG/GIF/WebP do 2 MiB + tytuł, tagi i **potwierdzenie etyki**. Plik leci przez
  `rejmeme_submit` do kolejki `pending`; autor widzi status i powód ewentualnego odrzucenia.
- Pliki trzymamy w `bytea` (bez publicznego Storage) i wydajemy przez RPC.

#### 4. Baza: `supabase/2026-11-15_rejmeme_gallery.sql`

- Tabele: `rejmeme_memes` (status `pending|approved|rejected`, autor, tagi, `bytea`, licznik
  wyświetleń) oraz `rejmeme_usage` (limit 10 plików / 20 MiB na dobę).
- Funkcje: `rejmeme_submit`, `rejmeme_gallery`, `rejmeme_image`, `rejmeme_mine`,
  `rejmeme_own_image`, `rejmeme_withdraw` oraz administracyjne `rejmeme_admin_queue`,
  `rejmeme_admin_image`, `rejmeme_moderate`.
- Bezpieczeństwo: `security definer`, `search_path`, magic bytes, limit 2 MiB na plik, globalny
  sufit 128 MiB, RLS bez polityk dla `anon`/`authenticated` (dostęp tylko przez RPC), a moderacja
  wymaga `public.is_widget_admin()` (konto z tabeli `widget_admins`).

#### 5. Panel admina — zakładka „Memy”

- Nowa zakładka `#tab-memes` (`js/admin-memes.js`, `css/admin-memes.css`) z licznikami
  (oczekujące / zatwierdzone / odrzucone), filtrem statusu i kartami memów.
- Zatwierdzenie publikuje mem w galerii, odrzucenie zapisuje powód widoczny dla autora,
  „Usuń” kasuje plik bezpowrotnie. Każda decyzja idzie przez RPC — nie da się jej wykonać z
  publicznej strony.
