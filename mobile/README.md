# RejHub na Androida

Aplikacja RejHuba to **powłoka** (Capacitor + WebView) wokół `https://rejhub.vercel.app`.
Nie ma w niej zamrożonej kopii strony: przy każdym otwarciu ładuje aktualny
RejHub, więc nowe funkcje i treści widać od razu po wdrożeniu, bez wydawania
nowego APK. Nowy APK jest potrzebny tylko wtedy, gdy zmienia się **sama powłoka**.

Od tego wydania powłoka przestała być „ukrytą przeglądarką”: ma powiadomienia
systemowe, natywne udostępnianie, aparat, zapis plików, aktualizację
bez wychodzenia z aplikacji i blokadę RejSejfu odciskiem palca.

## Co jest w środku

| Element | Gdzie |
| --- | --- |
| Konfiguracja powłoki | `mobile/capacitor.config.json` |
| Adres serwisu | `server.url = https://rejhub.vercel.app` |
| Ekran bez internetu | `mobile/www/offline.html` (`server.errorPath`) |
| Kod natywny | `mobile/android/app/src/main/java/pl/rejson59/rejhub/` |
| Warstwa łącząca ze stroną | `/js/native-shell.js` |
| Ikony, splash, widżet | `mobile/android/app/src/main/res/` |
| Klucz podpisujący | `mobile/keystore/rejhub-release.p12` |
| Pipeline wydania | `.github/workflows/android.yml` |
| Metadane dla strony | `rejhub2/app/latest.json` (zapisuje CI) |
| Strona pobierania | `rejhub2/pobierz.html` |
| Baner nowej wersji | `js/app-update.js` |
| Powiadomienia (FCM) | `js/push.js` + `rejhub2/api/push-send.js` |

### Kod natywny

| Plik | Rola |
| --- | --- |
| `MainActivity.java` | linki App Links, Wstecz (także gest z podglądem na Androidzie 13+), „Udostępnij do RejHub”, długie dotknięcie linku, pobieranie plików |
| `RejUpdaterPlugin.java` | pobranie APK w aplikacji, weryfikacja SHA-256, przekazanie do systemowego instalatora |
| `InstallResultReceiver.java` | pokazuje systemowe pytanie „Zaktualizować aplikację?” |
| `RejBiometricPlugin.java` | odblokowanie RejSejfu odciskiem palca |
| `RejWidgetProvider.java` | widżet „RejHub · skróty” na ekran główny |

### Pluginy Capacitora (wersja 6)

`status-bar`, `splash-screen`, `haptics`, `share`, `browser`, `clipboard`,
`network`, `camera`, `filesystem`, `local-notifications`, `push-notifications`.

Ich JavaScript **nie jest** dołączany do strony — natywny mostek Capacitora
sam wystawia `window.Capacitor.Plugins.<Nazwa>`, więc `js/native-shell.js`
woła pluginy bez bundlera. W przeglądarce skrypt kończy pracę w pierwszej linii.

## Co potrafi aplikacja, a czego nie potrafi przeglądarka

- **Pasek stanu w kolorze motywu** — jasny motyw nie udaje już ciemnego.
- **Wibracje** przy wyspie, menu i wysłaniu wiadomości.
- **Własne menu linku** (długie dotknięcie): Udostępnij, Kopiuj link,
  Otwórz w przeglądarce — zamiast menu WebView.
- **Linki zewnętrzne** otwierają się w karcie w aplikacji, nie w Chrome.
- **„Udostępnij do RejHub”** z innych aplikacji — treść trafia do pola
  wiadomości w RejChacie.
- **Zdjęcia** z aparatu lub galerii w miejsce systemowego wyboru pliku.
- **Pobieranie plików z RejSejfu/RejFile** — WebView nie umie pobierać
  `blob:`, więc plik jest zapisywany w pamięci aplikacji i przekazywany do
  systemowego arkusza „Zapisz lub wyślij”.
- **Aktualizacja bez wychodzenia** — postęp w banerze, SHA-256, systemowe
  pytanie o instalację.
- **Powiadomienia FCM** — działają też przy zamkniętym RejHubie; dotknięcie
  otwiera właściwe miejsce w aplikacji.
- **Blokada RejSejfu** odciskiem palca (tylko na tym telefonie).
- **Widżet i skróty** pod ikoną: RejChat, RejFile, RejClass, RejPlanner.

## Powiadomienia (Firebase)

WebView nie ma Push API, więc aplikacja używa FCM. Trzeba to włączyć **raz**:

1. W konsoli Firebase utwórz projekt (darmowy plan wystarczy) i dodaj
   aplikację Android o identyfikatorze `pl.rejson59.rejhub`.
2. Pobierz `google-services.json` i połóż go w
   `mobile/android/app/google-services.json` (plik można commitować — nie
   zawiera sekretów; zawiera identyfikator projektu i klucz API aplikacji).
3. W Firebase: **Project settings → Service accounts → Generate new private
   key**. Cały plik JSON wklej w Vercelu jako zmienną `FIREBASE_SERVICE_ACCOUNT`
   (można też w base64), a następnie wdróż projekt ponownie.
4. Zbuduj nowy APK (zmiana w `mobile/**` uruchomi pipeline).

Bez pliku `google-services.json` build **nadal działa** — plugin
`google-services` nie jest wtedy stosowany, a aplikacja po prostu nie
rejestruje tokenu i pokazuje w panelu uczciwy komunikat. Bez zmiennej
`FIREBASE_SERVICE_ACCOUNT` serwer wysyła tylko Web Push.

Kanał powiadomień nazywa się `rejhub`, ma błękitny akcent `#8BBDFF`
i ikonę `rj_notification` — zgodnie z zasadą „zero zieleni”.

## Uprawnienia

| Uprawnienie | Po co |
| --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | strona i pasek „brak połączenia” |
| `REQUEST_INSTALL_PACKAGES` | aktualizacja z wnętrza aplikacji |
| `POST_NOTIFICATIONS` | powiadomienia (Android 13+, pytanie przy włączeniu) |

Aplikacja **nie** prosi o dostęp do plików, kontaktów ani lokalizacji.
Zdjecia z aparatu idą przez systemowe narzędzie (`ACTION_IMAGE_CAPTURE`),
więc uprawnienie `CAMERA` nie jest potrzebne.

## Wydanie

Wydanie powstaje automatycznie po zmianie w `mobile/**` na `main`.
Ręcznie: **Actions → „Aplikacja Android (APK)” → Run workflow**.

Co robi pipeline:

1. `npm ci` + `npx cap sync android`,
2. wstrzykuje wersję do User-Agenta (`appendUserAgent`),
3. buduje `assembleRelease` z `RJ_VERSION_CODE` i `RJ_VERSION_NAME`
   (wersja `1.0.<numer uruchomienia>`, kod = numer uruchomienia),
4. sprawdza podpis (`apksigner verify --print-certs`),
5. publikuje GitHub Release z plikiem **`RejHub.apk`** — stały adres:
   `https://github.com/rejson59/rejson59.github.io/releases/latest/download/RejHub.apk`,
6. zapisuje `rejhub2/app/latest.json` (wersja, rozmiar, data, SHA-256, linki),
7. commituje ten plik na `main` (Vercel wdraża go razem z resztą strony).

**Pobieranie dla ludzi:** strona i baner w przeglądarce prowadzą do
`https://rejhub.vercel.app/app/RejHub.apk`. To nasza funkcja `api/apk.js`:
pobiera najnowsze wydanie z GitHuba po stronie serwera i oddaje plik
strumieniem z nagłówkiem `Content-Disposition: attachment`. Dzięki temu
pobieranie zaczyna się od razu — bez przekierowania na stronę wydania GitHuba
i bez limitu 4,5 MB dla zwykłych odpowiedzi funkcji. Natywna aktualizacja
w aplikacji dalej pobiera plik bezpośrednio z GitHuba (jest szybsza), a gdy
GitHub nie odpowiada, funkcja oddaje przekierowanie na wydanie.

## Aktualizacje

- **Treść** — zawsze aktualna, bo aplikacja ładuje stronę z serwera.
- **Powłoka** — aplikacja porównuje swój `versionCode` z `latest.json`.
  W aplikacji baner ma przycisk **„Zaktualizuj”**: plik leci w tle z postępem,
  jest sprawdzany SHA-256 i trafia do systemowego instalatora. „Później”
  odkłada przypomnienie na 24 godziny. W przeglądarce zostaje zwykły link.
- **Instalacja na wierzch** — każde wydanie jest podpisane tym samym kluczem,
  więc Android traktuje nowy APK jak zwykłą aktualizację: konto i ustawienia
  zostają, nic nie trzeba odinstalowywać.

## Klucz podpisujący

`mobile/keystore/rejhub-release.p12` leży w repozytorium razem z hasłem
w `keystore.properties`. To świadoma decyzja: dzięki temu pipeline działa
bez sekretów GitHub, a **każde wydanie ma tę samą sygnaturę**, co jest
warunkiem aktualizacji „na wierzch”.

Konsekwencje, o których trzeba wiedzieć:

- repozytorium jest publiczne, więc klucz też — ktoś mógłby podpisać własny
  plik jako RejHub; instaluj APK wyłącznie z wydań tego repozytorium,
- do **Google Play** potrzebny jest osobny, prywatny klucz (Play App Signing);
  ten plik nie nadaje się do sklepu,
- odcisk certyfikatu musi się zgadzać z `rejhub2/assetlinks.json`
  (obecnie `08:60:76:…:7F:38`). Zmiana klucza wymaga aktualizacji obu miejsc.

## Budowanie lokalnie

Wymagania: Node 20+, JDK 17, Android SDK z platformą 35.

```bash
cd mobile
npm ci
npx cap sync android
cd android
./gradlew assembleRelease
# plik: app/build/outputs/apk/release/app-release.apk
```

Bez zmiennych środowiskowych build użyje wersji `1.0.0` (kod `1`) i klucza
z `mobile/keystore`. Podgląd w Android Studio: `npm run open`.

## Czego aplikacja nie robi

- nie ma własnego backendu ani analityki — cała logika zostaje w serwisie,
- nie kopiuje treści RejHuba na urządzenie — bez internetu pokazuje ekran
  „Brak połączenia” z ponowieniem,
- nie odtwarza RejMusic w tle — to oficjalne osadzenia YouTube, a ich
  odtwarzanie poza aplikacją wymagałoby wyciągania strumieni, na co YouTube
  nie pozwala,
- blokada RejSejfu jest zasłoną prywatności, nie szyfrowaniem plików:
  dane nadal pochodzą z serwera po zalogowaniu.
