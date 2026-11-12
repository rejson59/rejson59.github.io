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
