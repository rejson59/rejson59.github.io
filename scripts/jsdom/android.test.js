/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Aplikacja RejHuba na Androida — powłoka, wydania i strona pobierania.
 *
 * Testy sprawdzają to, co decyduje o tym, czy użytkownik naprawdę dostanie
 * działającą aplikację i czy kolejne wersje zainstalują się na poprzednie:
 *
 *  1. powłoka Capacitora ładuje aktualny serwis (a nie zamrożoną kopię),
 *  2. każde wydanie jest podpisane tym samym kluczem, który jest w repo
 *     i którego odcisk trafia do /.well-known/assetlinks.json,
 *  3. GitHub Actions buduje APK, publikuje wydanie i zapisuje metadane,
 *  4. strona /pobierz i baner w aplikacji czytają te metadane,
 *  5. aplikacja rozpoznaje nowszą wersję po User-Agencie i nie pokazuje
 *     banera w zwykłej przeglądarce ani po „Później”.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

const WORKFLOW = '.github/workflows/android.yml';
const CONFIG = 'mobile/capacitor.config.json';

(async function main() {

console.log('\n=== A. POWŁOKA ANDROIDA ===');

await check('aplikacja ładuje aktualny serwis, a nie zamrożoną kopię strony', async () => {
  const config = JSON.parse(read(CONFIG));
  assert.equal(config.appId, 'pl.rejson59.rejhub', 'zły identyfikator aplikacji');
  assert.equal(config.appName, 'RejHub');
  assert.equal(config.server.url, 'https://rejhub.vercel.app', 'aplikacja nie otwiera RejHuba');
  assert.equal(config.server.errorPath, 'offline.html', 'brak ekranu offline');
  assert.ok(exists('mobile/www/offline.html'), 'brak pliku offline.html');
  assert.ok(/Brak połączenia/.test(read('mobile/www/offline.html')), 'ekran offline nie mówi, co się stało');
  assert.equal(config.android.allowMixedContent, false, 'aplikacja nie może dopuszczać HTTP');
  assert.equal(config.android.webContentsDebuggingEnabled, false, 'debugowanie WebView zostaje wyłączone w wydaniu');
  assert.match(config.appendUserAgent, /RejHubApp\//, 'strona nie rozpozna aplikacji po User-Agencie');
});

await check('manifest otwiera linki RejHuba w aplikacji i nie pozwala na kopie zapasowe', async () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/, 'dane aplikacji trafiłyby do kopii zapasowej');
  assert.match(manifest, /android:usesCleartextTraffic="false"/, 'ruch bez HTTPS byłby dozwolony');
  assert.match(manifest, /android:scheme="https" android:host="rejhub\.vercel\.app"/, 'brak linków https');
  assert.match(manifest, /android:autoVerify="true"/, 'linki nie są weryfikowane przez Androida');
  assert.match(manifest, /android:scheme="rejhub"/, 'brak własnego schematu rejhub://');
  assert.match(manifest, /android.permission.INTERNET/);
});

await check('MainActivity obsługuje wstecz, pobieranie APK i wersję w User-Agencie', async () => {
  const activity = read('mobile/android/app/src/main/java/pl/rejson59/rejhub/MainActivity.java');
  assert.match(activity, /onBackPressed/, 'przycisk Wstecz nie wraca w historii strony');
  assert.match(activity, /DownloadManager/, 'pobieranie APK nie działa w aplikacji');
  assert.match(activity, /RejHubApp\//, 'brak znacznika aplikacji w User-Agencie');
  assert.match(activity, /pathFromIntent/, 'linki nie otwierają właściwej podstrony');
  assert.match(activity, /https:\/\/rejhub\.vercel\.app/, 'brak adresu serwisu');
});

await check('ekran startowy i ikona są w stylu RejHuba (bez zieleni)', async () => {
  const styles = read('mobile/android/app/src/main/res/values/styles.xml');
  const colors = read('mobile/android/app/src/main/res/values/colors.xml');
  assert.match(styles, /AppTheme\.NoActionBarLaunch/, 'brak motywu startowego');
  assert.match(styles, /@drawable\/rj_splash/, 'start nie pokazuje ekranu powitalnego');
  assert.match(colors, /#0B111A/, 'brak ciemnego tła wyspy');
  assert.equal(/#34d399|#22c55e|#10b981|#30d158|#4ade80/i.test(colors + styles), false, 'zieleń w motywie');
  ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].forEach((density) => {
    ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].forEach((file) => {
      assert.ok(exists('mobile/android/app/src/main/res/mipmap-' + density + '/' + file),
        'brak ikony ' + density + '/' + file);
    });
  });
  assert.ok(exists('rejhub2/app/icon.png'), 'brak ikony do podglądu na stronie');
});

console.log('\n=== B. PODPIS I AKTUALIZACJE ===');

await check('każde wydanie podpisane tym samym kluczem — aktualizacja wchodzi na starą wersję', async () => {
  assert.ok(exists('mobile/keystore/rejhub-release.p12'), 'brak klucza podpisującego');
  const props = read('mobile/keystore/keystore.properties');
  assert.match(props, /storeFile=\.\.\/keystore\/rejhub-release\.p12/, 'zła ścieżka klucza');
  assert.match(props, /keyAlias=rejhub/);
  const gradle = read('mobile/android/app/build.gradle');
  assert.match(gradle, /signingConfigs \{/, 'brak konfiguracji podpisywania');
  assert.match(gradle, /storeType "PKCS12"/, 'klucz nie jest czytany jako PKCS12');
  assert.match(gradle, /signingConfig signingConfigs\.release/, 'wydanie nie jest podpisane');
  assert.match(gradle, /RJ_VERSION_CODE/, 'wersja nie pochodzi z wydania');
  assert.match(gradle, /versionCode rjVersionCode/);
  assert.match(gradle, /versionName rjVersionName/);
  assert.ok(!/minifyEnabled true/.test(gradle), 'modyfikacja kodu bez testów byłaby ryzykowna');
  const variables = read('mobile/android/variables.gradle');
  const target = Number((/targetSdkVersion = (\d+)/.exec(variables) || [])[1]);
  assert.ok(target >= 35, 'od sierpnia 2025 Android wymaga targetSdk 35: ' + target);
});

await check('assetlinks.json weryfikuje aplikację dla linków rejhub.vercel.app', async () => {
  const links = JSON.parse(read('rejhub2/assetlinks.json'));
  assert.ok(Array.isArray(links) && links.length > 0, 'plik musi być tablicą');
  const entry = links[0];
  assert.equal(entry.target.package_name, 'pl.rejson59.rejhub', 'zła nazwa pakietu');
  assert.ok(entry.relation.includes('delegate_permission/common.handle_all_urls'));
  const fingerprint = entry.target.sha256_cert_fingerprints[0];
  assert.match(fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, 'odcisk musi być w formacie SHA-256');
  assert.ok(read('mobile/keystore/keystore.properties').includes(fingerprint),
    'odcisk w assetlinks.json nie zgadza się z opisem klucza w repo');

  const vercel = JSON.parse(read('rejhub2/vercel.json'));
  const rewrite = vercel.rewrites.find((rule) => rule.source === '/.well-known/assetlinks.json');
  assert.ok(rewrite && rewrite.destination === '/assetlinks.json', 'Vercel nie wystawia assetlinks.json');
});

await check('GitHub Actions buduje APK, publikuje wydanie i zapisuje metadane', async () => {
  assert.ok(exists(WORKFLOW), 'brak workflow Androida');
  const workflow = read(WORKFLOW);
  assert.match(workflow, /assembleRelease/, 'workflow nie buduje wersji release');
  assert.match(workflow, /npx cap sync android/, 'workflow nie synchronizuje Capacitora');
  assert.match(workflow, /apksigner"?\s+verify/, 'workflow nie sprawdza podpisu');
  assert.match(workflow, /gh release create/, 'workflow nie publikuje wydania');
  assert.match(workflow, /releases\/latest\/download/, 'brak stałego adresu pobierania');
  assert.match(workflow, /latest\.json/, 'workflow nie zapisuje metadanych dla strony');
  assert.match(workflow, /sha256sum/, 'brak sumy kontrolnej');
  assert.match(workflow, /contents: write/, 'workflow nie może zapisać metadanych');
  assert.match(workflow, /paths:\s*\n\s*- 'mobile\/\*\*'/, 'workflow nie startuje po zmianie powłoki');

  const scripts = JSON.parse(read('mobile/package.json')).scripts;
  assert.ok(scripts.sync && scripts.build, 'brak lokalnych skryptów budowania');
});

console.log('\n=== C. STRONA POBIERANIA I BANER AKTUALIZACJI ===');

await check('/pobierz mówi, co się aktualizuje samo, a co wymaga nowego APK', async () => {
  const html = read('rejhub2/pobierz.html');
  assert.match(html, /<title>[^<]*Rej/, 'brak tytułu');
  assert.match(html, /<link rel="canonical" href="\/pobierz">/, 'brak adresu kanonicznego');
  assert.match(html, /id="apk-download"/, 'brak przycisku pobierania');
  assert.match(html, /releases\/latest\/download\/RejHub\.apk/, 'przycisk nie prowadzi do najnowszego APK');
  assert.match(html, /id="pobierz-status"/, 'brak statusu wersji');
  assert.match(html, /\/js\/app-update\.js\?v=\d+/, 'strona nie czyta metadanych wydania');
  assert.match(html, /class="license-line"/, 'brak informacji o licencji');
  assert.match(html, /\/hub\/island\.js\?v=/, 'brak wyspy');
  assert.match(html, /Jak zainstalować/, 'brak instrukcji instalacji');
  assert.match(html, /Aktualizacje/, 'brak wyjaśnienia aktualizacji');
  assert.ok(!/#34d399|#22c55e|#10b981/i.test(html), 'zieleń w stylach strony');

  const apps = read('rejhub2/aplikacje.html');
  assert.match(apps, /href="\/pobierz"/, 'lista aplikacji nie prowadzi do pobierania');
  const topbar = read('rejhub2/index.html');
  assert.match(topbar, /href="\/pobierz"/, 'menu nie ma aplikacji na Androida');
});

await check('każda strona pamięta o aktualizacji aplikacji, a nie tylko /pobierz', async () => {
  const pages = fs.readdirSync(path.join(root, 'rejhub2'))
    .filter((file) => file.endsWith('.html'))
    .filter((file) => !['w-budowie.html'].includes(file));
  const withPrompt = pages.filter((file) => read('rejhub2/' + file).includes('install-prompt.js'));
  withPrompt.forEach((file) => {
    assert.ok(read('rejhub2/' + file).includes('/js/app-update.js?v=2'),
      file + ': brak sprawdzania nowej wersji aplikacji');
  });
  assert.ok(withPrompt.length >= 20, 'za mało stron ze sprawdzaniem wersji');
});

function appPage(html, options) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(html, {
    url: options.url || 'https://rejhub.vercel.app/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', {
    value: options.userAgent,
    configurable: true
  });
  const calls = [];
  w.fetch = (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(options.latest)
    });
  };
  return { dom, w, calls };
}

await check('w aplikacji ze starszą wersją pojawia się baner z nową wersją', async () => {
  const { dom, w } = appPage('<main></main>', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) RejHubApp/1.0.5 (5)',
    latest: {
      versionCode: 9, versionName: '1.0.9', size: 8000000,
      sha256: 'a'.repeat(64), published: '2026-11-12T10:00:00Z',
      apk: 'https://github.com/rejson59/rejson59.github.io/releases/latest/download/RejHub.apk'
    }
  });
  w.eval(read('js/app-update.js'));
  await wait(60);
  const host = w.document.getElementById('rj-app-update');
  assert.ok(host && host.shadowRoot, 'brak banera aktualizacji');
  const text = host.shadowRoot.textContent;
  assert.match(text, /Nowa wersja RejHuba: 1\.0\.9/, 'baner nie pokazuje nowej wersji');
  assert.match(text, /Masz 1\.0\.5/, 'baner nie pokazuje zainstalowanej wersji');
  const link = host.shadowRoot.querySelector('a');
  assert.match(link.href, /releases\/latest\/download\/RejHub\.apk/, 'baner nie prowadzi do APK');
  assert.ok(w.RjApp && w.RjApp.latest && w.RjApp.installed, 'brak danych dla strony');

  /* „Później” chowa baner na dobę. */
  host.shadowRoot.querySelector('button').click();
  await wait(20);
  assert.equal(w.document.getElementById('rj-app-update'), null, '„Później” nie chowa banera');
  assert.ok(w.localStorage.getItem('rj_app_update_snooze_v2'), 'brak zapamiętania odroczenia');
  dom.window.close();
});

await check('w przeglądarce i przy aktualnej wersji baner się nie pojawia', async () => {
  const browser = appPage('<main></main>', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0',
    latest: { versionCode: 9, versionName: '1.0.9', size: 1, apk: 'https://x/RejHub.apk' }
  });
  browser.w.eval(read('js/app-update.js'));
  await wait(60);
  assert.equal(browser.w.document.getElementById('rj-app-update'), null, 'baner pokazuje się w przeglądarce');
  assert.equal(browser.w.RjApp.installed, null, 'przeglądarka nie jest aplikacją');
  browser.dom.window.close();

  const current = appPage('<main></main>', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) RejHubApp/1.0.9 (9)',
    latest: { versionCode: 9, versionName: '1.0.9', size: 1, apk: 'https://x/RejHub.apk' }
  });
  current.w.eval(read('js/app-update.js'));
  await wait(60);
  assert.equal(current.w.document.getElementById('rj-app-update'), null, 'baner przy aktualnej wersji');
  current.dom.window.close();
});

await check('/pobierz pokazuje wersję, rozmiar i SHA-256 z metadanych', async () => {
  const html = read('rejhub2/pobierz.html');
  const { dom, w } = appPage(html, {
    url: 'https://rejhub.vercel.app/pobierz',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) RejHubApp/1.0.5 (5)',
    latest: {
      versionCode: 9, versionName: '1.0.9', size: 8388608,
      sha256: 'b'.repeat(64), published: '2026-11-12T10:00:00Z',
      apk: 'https://github.com/rejson59/rejson59.github.io/releases/latest/download/RejHub.apk',
      page: 'https://github.com/rejson59/rejson59.github.io/releases/tag/android-v1.0.9',
      minAndroid: '7.0'
    }
  });
  /* Strona ma własne skrypty; uruchamiamy tylko ten, który jest testowany. */
  w.eval(read('js/app-update.js'));
  await wait(80);
  const d = w.document;
  assert.equal(d.getElementById('apk-version').textContent, '1.0.9', 'zła wersja na stronie');
  assert.match(d.getElementById('apk-size').textContent, /8[.,]0 MB/, 'zły rozmiar: ' + d.getElementById('apk-size').textContent);
  assert.equal(d.getElementById('apk-date').textContent, '12 listopada 2026', 'zła data wydania');
  assert.equal(d.getElementById('apk-sha').textContent, 'b'.repeat(64), 'brak sumy kontrolnej');
  assert.match(d.getElementById('pobierz-status').textContent, /Masz wersję 1\.0\.5/, 'brak statusu wersji');
  assert.match(d.getElementById('apk-download').href, /download\/RejHub\.apk/, 'zły link pobierania');
  assert.match(d.getElementById('apk-release').href, /android-v1\.0\.9/, 'brak linku do wydania');
  assert.equal(d.getElementById('rj-app-update'), null, 'baner nie powinien dublować się na /pobierz');
  dom.window.close();
});


console.log('\n=== D. APLIKACJA, NIE UKRYTA PRZEGLĄDARKA ===');

await check('powłoka ma natywne pluginy, a nie sam WebView', async () => {
  const pkg = JSON.parse(read('mobile/package.json'));
  const deps = Object.keys(pkg.dependencies || {});
  ['@capacitor/status-bar', '@capacitor/splash-screen', '@capacitor/haptics',
   '@capacitor/share', '@capacitor/browser', '@capacitor/clipboard', '@capacitor/network',
   '@capacitor/camera', '@capacitor/filesystem', '@capacitor/local-notifications',
   '@capacitor/push-notifications'].forEach((name) => {
    assert.ok(deps.includes(name), 'brak pluginu ' + name);
  });
  assert.ok(read('mobile/README.md').includes('google-services.json'),
    'README nie mówi, jak włączyć powiadomienia FCM');
});

await check('manifest przyjmuje udostępnianie, powiadomienia, skróty i widżet', async () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.intent\.action\.SEND/, 'nie można udostępnić treści do RejHuba');
  assert.match(manifest, /android:mimeType="text\/\*"/, 'udostępnianie nie przyjmuje tekstu i linków');
  assert.match(manifest, /android\.app\.shortcuts/, 'brak skrótów pod ikoną');
  assert.match(manifest, /RejWidgetProvider/, 'brak widżetu na ekran główny');
  assert.match(manifest, /REQUEST_INSTALL_PACKAGES/, 'brak zgody na aktualizację w aplikacji');
  assert.match(manifest, /OPEN_REJHUB/, 'dotknięcie powiadomienia nie otworzy właściwego miejsca');
  assert.match(manifest, /default_notification_channel_id[\s\S]{0,80}rejhub/, 'brak kanału powiadomień');
  assert.match(manifest, /default_notification_icon|rj_notification/, 'brak ikony powiadomień');
  assert.match(manifest, /InstallResultReceiver/, 'system nie pokaże pytania o instalację');
  assert.match(manifest, /enableOnBackInvokedCallback="true"/, 'brak gestu wstecz z podglądem');
  assert.match(read('mobile/android/app/src/main/res/xml/shortcuts.xml'), /rejchat/, 'skróty nie prowadzą do aplikacji');
  assert.match(read('mobile/android/app/src/main/res/xml/rj_widget_info.xml'), /rj_widget/, 'zły opis widżetu');
});

await check('kod natywny robi coś, czego nie potrafi przeglądarka', async () => {
  const activity = read('mobile/android/app/src/main/java/pl/rejson59/rejhub/MainActivity.java');
  assert.match(activity, /registerPlugin\(RejUpdaterPlugin\.class\)/, 'brak aktualizacji w aplikacji');
  assert.match(activity, /registerPlugin\(RejBiometricPlugin\.class\)/, 'brak biometrii RejSejfu');
  assert.match(activity, /setOnLongClickListener/, 'brak własnego menu długiego dotknięcia');
  assert.match(activity, /rj:longpress/, 'strona nie dostaje informacji o długim dotknięciu');
  assert.match(activity, /EXTRA_TEXT/, 'udostępniona treść nie trafia do aplikacji');
  assert.match(activity, /OnBackInvokedDispatcher/, 'brak gestu wstecz na Androidzie 13+');

  const updater = read('mobile/android/app/src/main/java/pl/rejson59/rejhub/RejUpdaterPlugin.java');
  assert.match(updater, /PackageInstaller/, 'aktualizacja nie trafia do systemowego instalatora');
  assert.match(updater, /SHA-256/, 'brak weryfikacji pobranego APK');
  assert.match(updater, /canRequestPackageInstalls/, 'brak sprawdzenia zgody na instalację');
  assert.match(read('mobile/android/app/src/main/java/pl/rejson59/rejhub/InstallResultReceiver.java'),
    /STATUS_PENDING_USER_ACTION/, 'brak ekranu „Zaktualizować aplikację?”');

  const biometric = read('mobile/android/app/src/main/java/pl/rejson59/rejhub/RejBiometricPlugin.java');
  assert.match(biometric, /BiometricPrompt/, 'RejSejf nie pyta o odcisk palca');
});

await check('splash i pasek stanu pasują do motywu, bez czarnej belki', async () => {
  const styles = read('mobile/android/app/src/main/res/values/styles.xml');
  assert.match(styles, /windowOptOutEdgeToEdgeEnforcement/, 'treść wejdzie pod pasek stanu');
  const v31 = read('mobile/android/app/src/main/res/values-v31/styles.xml');
  assert.match(v31, /windowSplashScreenBackground/, 'brak ekranu startowego Androida 12+');
  assert.match(v31, /windowSplashScreenAnimatedIcon/, 'splash nie pokazuje znaku RejHuba');
  const shell = read('js/native-shell.js');
  assert.match(shell, /setBackgroundColor/, 'strona nie ustawia koloru paska stanu');
  assert.match(shell, /data-theme/, 'pasek stanu nie reaguje na motyw');
});

await check('baner aktualizacji instaluje APK bez wychodzenia z aplikacji', async () => {
  const script = read('js/app-update.js');
  assert.match(script, /nativeUpdate\(\)/, 'baner nie zna warstwy natywnej');
  assert.match(script, /installInApp/, 'brak aktualizacji w aplikacji');
  assert.match(script, /\.install\(latest/, 'brak wywołania natywnego instalatora');
  assert.match(script, /sha256/, 'brak sumy kontrolnej w żądaniu');
});
await check('zachęta „Dodaj do ekranu” nie pokazuje się w aplikacji', async () => {
  const script = read('js/install-prompt.js');
  assert.match(script, /RejHubApp\\\//, 'brak rozpoznawania aplikacji');
  assert.match(script, /inApp\(\)/, 'zachęta nie sprawdza trybu aplikacji');
});

console.log('\n========================================================');
if (failures.length) {
  console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
  failures.forEach((failure) => console.log(' - ' + failure));
  process.exit(1);
}
console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
console.log('PASS: powłoka Androida, natywne funkcje aplikacji, podpis i aktualizacje, strona pobierania i baner nowej wersji');

})().catch((error) => {
  console.error(error);
  process.exit(1);
});
