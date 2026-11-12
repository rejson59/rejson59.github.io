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
- Kafelki przewijają się **same: jedno przesunięcie co 2 sekundy** (w kółko). Gdy ktoś dotknie paska, kafelka albo użyje kółka, jazda zatrzymuje się na 6 sekund; w tle karty i przy `prefers-reduced-motion` nie startuje. Podpis „przesuń →” został usunięty.
- Na wąskim telefonie (≤560 px) etykieta „mini reklamy” chowa się, żeby dwie promocje mieściły się obok siebie; kafelek ma 50 px wysokości, a pasek 60 px.
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
