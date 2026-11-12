# RejHub na Androida

Aplikacja to **cienka powłoka** (Capacitor + WebView) wokół `https://rejhub.vercel.app`.
Nie ma w niej zamrożonej kopii strony: przy każdym otwarciu ładuje aktualny
RejHub, więc nowe funkcje i treści widać od razu po wdrożeniu, bez wydawania
nowego APK.

Nowy APK jest potrzebny tylko wtedy, gdy zmienia się **sama powłoka**
(uprawnienia, obsługa linków, pobieranie plików, ekran offline, ikona).
Wtedy GitHub Actions buduje plik, publikuje wydanie i zapisuje metadane,
a aplikacja pokazuje w środku baner „Nowa wersja RejHuba”.

## Jak to działa

| Element | Gdzie |
| --- | --- |
| Konfiguracja powłoki | `mobile/capacitor.config.json` |
| Adres serwisu | `server.url = https://rejhub.vercel.app` |
| Ekran bez internetu | `mobile/www/offline.html` (`server.errorPath`) |
| Kod natywny | `mobile/android/app/src/main/java/pl/rejson59/rejhub/MainActivity.java` |
| Ikony i ekran startowy | `mobile/android/app/src/main/res/` |
| Klucz podpisujący | `mobile/keystore/rejhub-release.p12` |
| Pipeline wydania | `.github/workflows/android.yml` |
| Metadane dla strony | `rejhub2/app/latest.json` (zapisuje CI) |
| Strona pobierania | `rejhub2/pobierz.html` |
| Baner nowej wersji | `js/app-update.js` |

`MainActivity` robi cztery rzeczy poza samym WebView:

1. dopisuje `RejHubApp/<wersja> (<kod>)` do User-Agenta — po tym strona
   rozpoznaje aplikację i wie, czy jest nowsza wersja,
2. obsługuje przycisk **Wstecz** (historia strony, potem wyjście),
3. otwiera w aplikacji linki `https://rejhub.vercel.app/...` (App Links,
   weryfikowane przez `rejhub2/assetlinks.json`) i `rejhub://...`,
4. pobiera pliki przez systemowy `DownloadManager` — dlatego klik w nowy
   APK naprawdę coś robi.

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

## Aktualizacje

- **Treść** — zawsze aktualna, bo aplikacja ładuje stronę z serwera.
- **Powłoka** — aplikacja porównuje swój `versionCode` z `latest.json`
  i pokazuje baner z przyciskiem „Pobierz”. „Później” odkłada przypomnienie
  na 24 godziny.
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
- **Web Push nie działa w WebView** (Android nie udostępnia Push API w WebView).
  Powiadomienia push działają w Chrome / po „Dodaj do ekranu”; w aplikacji
  jest zakładka powiadomień w wyspie,
- nie kopiuje treści RejHuba na urządzenie — bez internetu pokazuje ekran
  „Brak połączenia” z ponowieniem.
