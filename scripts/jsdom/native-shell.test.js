/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Warstwa natywna aplikacji (js/native-shell.js).
 *
 * Sprawdzamy dwie rzeczy, które łatwo zepsuć po cichu:
 *
 *  1. w zwykłej przeglądarce skrypt nie robi absolutnie nic,
 *  2. w aplikacji naprawdę korzysta z pluginów: maluje pasek stanu,
 *     przyjmuje „Udostępnij do RejHub”, otwiera linki w karcie w aplikacji,
 *     pokazuje menu długiego dotknięcia, aktualizuje APK i blokuje RejSejf.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

/* ---------------------------------------------------------- atrapa mostka */

function boot(html, options = {}) {
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
    value: options.userAgent || 'Mozilla/5.0 (Linux; Android 14) RejHubApp/1.0.5 (5)',
    configurable: true
  });

  const calls = [];
  const listeners = {};
  const record = (plugin, method, args) => calls.push({ plugin, method, args });
  const ok = (value) => Promise.resolve(value || {});

  const Plugins = {
    StatusBar: {
      setStyle: (value) => { record('StatusBar', 'setStyle', value); return ok(); },
      setBackgroundColor: (value) => { record('StatusBar', 'setBackgroundColor', value); return ok(); }
    },
    SplashScreen: { hide: () => { record('SplashScreen', 'hide'); return ok(); } },
    Haptics: {
      impact: (value) => { record('Haptics', 'impact', value); return ok(); },
      notification: (value) => { record('Haptics', 'notification', value); return ok(); },
      selectionChanged: () => { record('Haptics', 'selectionChanged'); return ok(); }
    },
    Share: { share: (value) => { record('Share', 'share', value); return ok(); } },
    Browser: { open: (value) => { record('Browser', 'open', value); return ok(); } },
    Clipboard: { write: (value) => { record('Clipboard', 'write', value); return ok(); } },
    Network: {
      addListener: (event, callback) => { listeners.network = callback; return ok({ remove() {} }); },
      getStatus: () => ok({ connected: options.connected !== false })
    },
    Camera: {
      getPhoto: () => ok({ dataUrl: 'data:image/jpeg;base64,AAAA', format: 'jpeg' })
    },
    Filesystem: {
      writeFile: (value) => { record('Filesystem', 'writeFile', value); return ok(); },
      getUri: () => ok({ uri: 'file:///cache/RejHub/plik.pdf' })
    },
    RejUpdater: {
      status: () => ok({ supported: true, allowed: true }),
      install: (value) => { record('RejUpdater', 'install', value); return ok({ ok: true }); },
      settings: () => { record('RejUpdater', 'settings'); return ok(); },
      addListener: (event, callback) => { listeners.updater = callback; return ok({ remove() {} }); }
    },
    RejBiometric: {
      available: () => ok({ available: true }),
      authenticate: (value) => { record('RejBiometric', 'authenticate', value); return ok({ ok: true }); }
    }
  };

  if (options.native !== false) {
    w.Capacitor = { isNativePlatform: () => true, Plugins };
  }

  return { dom, w, calls, listeners, Plugins };
}

(async function main() {

console.log('\n=== A. PRZEGLĄDARKA ===');

await check('w przeglądarce skrypt nie robi nic', async () => {
  const { dom, w } = boot('<main><p>RejHub</p></main>', { native: false });
  w.eval(read('js/native-shell.js'));
  await wait(40);
  assert.equal(w.RejNative, undefined, 'warstwa natywna nie może istnieć w przeglądarce');
  assert.equal(w.document.getElementById('rj-native-toast'), null, 'przeglądarka dostała toast');
  dom.window.close();
});

console.log('\n=== B. PASEK STANU I MOTYW ===');

await check('pasek stanu ma kolor motywu i reaguje na przełączenie', async () => {
  const { dom, w, calls } = boot('<main></main>');
  w.eval(read('js/native-shell.js'));
  await wait(30);

  const first = calls.filter((call) => call.plugin === 'StatusBar');
  assert.ok(first.some((call) => call.method === 'setStyle' && call.args.style === 'LIGHT'),
    'ciemny motyw ma jasne ikony paska');
  assert.ok(first.some((call) => call.method === 'setBackgroundColor' && call.args.color === '#0b0e13'),
    'brak ciemnego tła paska');

  w.document.documentElement.setAttribute('data-theme', 'light');
  await wait(30);
  const last = calls.filter((call) => call.plugin === 'StatusBar').slice(-2);
  assert.ok(last.some((call) => call.method === 'setStyle' && call.args.style === 'DARK'),
    'jasny motyw ma ciemne ikony paska');
  assert.ok(last.some((call) => call.method === 'setBackgroundColor' && call.args.color === '#f7f8fb'),
    'jasny motyw nie zmienił tła paska');
  dom.window.close();
});

await check('aplikacja zna swoją wersję z User-Agenta', async () => {
  const { dom, w } = boot('<main></main>');
  w.eval(read('js/native-shell.js'));
  assert.equal(w.RejNative.isNative, true);
  assert.equal(w.RejNative.version.name, '1.0.5');
  assert.equal(w.RejNative.version.code, 5);
  dom.window.close();
});

console.log('\n=== C. UDOSTĘPNIANIE I LINKI ===');

await check('treść z „Udostępnij do RejHub” trafia do pola wiadomości', async () => {
  const { dom, w } = boot(
    '<form id="chat-form"><textarea id="chat-input"></textarea></form>',
    { url: 'https://rejhub.vercel.app/rejchat?share=Cze%C5%9B%C4%87%20ze%20%C5%9Bwiata' }
  );
  w.eval(read('js/native-shell.js'));
  await wait(220);
  const input = w.document.getElementById('chat-input');
  assert.equal(input.value, 'Cześć ze świata', 'treść nie trafiła do czatu');
  assert.equal(w.location.search, '', 'adres nadal zawiera treść udostępnienia');
  dom.window.close();
});

await check('zdarzenie rj:share wypełnia czat bez przeładowania strony', async () => {
  const { dom, w } = boot('<form id="chat-form"><textarea id="chat-input"></textarea></form>',
    { url: 'https://rejhub.vercel.app/rejchat' });
  w.eval(read('js/native-shell.js'));
  w.dispatchEvent(new w.CustomEvent('rj:share', { detail: { text: 'https://example.com/artykul' } }));
  await wait(40);
  assert.equal(w.document.getElementById('chat-input').value, 'https://example.com/artykul');
  dom.window.close();
});

await check('link zewnętrzny otwiera się w karcie w aplikacji', async () => {
  const { dom, w, calls } = boot('<main><a id="out" href="https://example.com/x">x</a></main>');
  w.eval(read('js/native-shell.js'));
  const link = w.document.getElementById('out');
  const event = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  await wait(20);
  assert.equal(event.defaultPrevented, true, 'przeglądarka przejęła link');
  const opened = calls.find((call) => call.plugin === 'Browser' && call.method === 'open');
  assert.ok(opened && opened.args.url === 'https://example.com/x', 'link nie trafił do Custom Tabs');
  dom.window.close();
});

await check('długie dotknięcie linku daje własne menu RejHuba', async () => {
  const { dom, w } = boot('<main></main>');
  w.eval(read('js/native-shell.js'));
  w.dispatchEvent(new w.CustomEvent('rj:longpress', { detail: { url: 'https://example.com/artykul' } }));
  await wait(30);
  const sheet = w.document.getElementById('rj-native-sheet');
  assert.ok(sheet && sheet.shadowRoot, 'brak menu długiego dotknięcia');
  assert.match(sheet.shadowRoot.textContent, /Udostępnij/, 'menu nie ma udostępniania');
  assert.match(sheet.shadowRoot.textContent, /Kopiuj link/, 'menu nie ma kopiowania');
  dom.window.close();
});

console.log('\n=== D. PLIKI, ZDJĘCIA I SIEĆ ===');

await check('plik z blob: idzie do systemowego „Zapisz lub wyślij”', async () => {
  const { dom, w, calls } = boot('<main><a id="dl" download="notatka.txt" href="blob:https://rejhub.vercel.app/123">pobierz</a></main>');
  w.fetch = () => Promise.resolve({ blob: () => Promise.resolve(new w.Blob(['hello'], { type: 'text/plain' })) });
  w.eval(read('js/native-shell.js'));
  const link = w.document.getElementById('dl');
  const event = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  await wait(120);
  assert.equal(event.defaultPrevented, true, 'WebView próbował pobrać blob sam');
  const write = calls.find((call) => call.plugin === 'Filesystem' && call.method === 'writeFile');
  assert.ok(write, 'plik nie trafił do pamięci aplikacji');
  assert.match(write.args.path, /notatka\.txt$/);
  assert.equal(write.args.encoding, 'base64');
  const share = calls.find((call) => call.plugin === 'Share' && call.method === 'share');
  assert.ok(share && Array.isArray(share.args.files) && share.args.files.length === 1,
    'brak arkusza „Zapisz lub wyślij”');
  dom.window.close();
});

await check('wybór zdjęcia korzysta z aparatu, a nie z pickera WebView', async () => {
  const { dom, w } = boot('<input id="photo" type="file" accept="image/jpeg">');

  /* jsdom nie ma DataTransfer ani FileList — dokładamy minimum, żeby sprawdzić
     samą ścieżkę: klik → natywny aparat → plik w polu formularza. */
  w.DataTransfer = class {
    constructor() {
      const files = [];
      this.items = { add: (file) => files.push(file) };
      this.files = files;
    }
  };

  let asked = 0;
  w.Capacitor.Plugins.Camera.getPhoto = () => {
    asked += 1;
    return Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAAA', format: 'jpeg' });
  };
  w.eval(read('js/native-shell.js'));

  const input = w.document.getElementById('photo');
  Object.defineProperty(input, 'files', { value: null, writable: true, configurable: true });
  const event = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  await wait(60);
  assert.equal(event.defaultPrevented, true, 'otworzył się systemowy wybór pliku');
  assert.equal(asked, 1, 'aparat nie został uruchomiony');
  assert.equal(input.files && input.files.length, 1, 'zdjęcie nie trafiło do formularza');
  dom.window.close();
});

await check('brak sieci pokazuje pasek z ponowieniem i znika po powrocie', async () => {
  const { dom, w, listeners } = boot('<main></main>');
  w.eval(read('js/native-shell.js'));
  await wait(30);
  listeners.network({ connected: false, connectionType: 'none' });
  assert.ok(w.document.getElementById('rj-native-offline'), 'brak paska o braku sieci');
  listeners.network({ connected: true, connectionType: 'wifi' });
  assert.equal(w.document.getElementById('rj-native-offline'), null, 'pasek nie zniknął');
  dom.window.close();
});

console.log('\n=== E. AKTUALIZACJA I REJSEJF ===');

await check('aktualizacja w aplikacji przekazuje adres i SHA-256', async () => {
  const { dom, w, calls, listeners } = boot('<main></main>');
  w.eval(read('js/native-shell.js'));
  const latest = {
    apk: 'https://github.com/rejson59/rejson59.github.io/releases/latest/download/RejHub.apk',
    sha256: 'c'.repeat(64),
    versionName: '1.0.9'
  };
  const percents = [];
  await w.RejNative.update.install(latest, (percent) => percents.push(percent));
  const call = calls.find((item) => item.plugin === 'RejUpdater' && item.method === 'install');
  assert.ok(call, 'nie wywołano natywnego instalatora');
  assert.equal(call.args.sha256, latest.sha256, 'brak weryfikacji sumy kontrolnej');
  assert.match(call.args.url, /RejHub\.apk$/);
  assert.ok(typeof listeners.updater === 'function', 'brak nasłuchu postępu');
  dom.window.close();
});

await check('RejSejf jest zasłonięty do czasu potwierdzenia odciskiem', async () => {
  const { dom, w, calls } = boot('<main><section class="safe-list-heading"></section></main>', {
    url: 'https://rejhub.vercel.app/rejsejf'
  });
  w.localStorage.setItem('rj_sejf_lock_v1', 'on');
  w.eval(read('js/native-shell.js'));
  assert.ok(w.document.getElementById('rj-sejf-gate'), 'sejf nie został zasłonięty');
  await wait(500);
  assert.ok(calls.some((call) => call.plugin === 'RejBiometric' && call.method === 'authenticate'),
    'nie zapytano o odcisk palca');
  assert.equal(w.document.getElementById('rj-sejf-gate'), null, 'zasłona nie zniknęła po odcisku');
  assert.ok(w.document.getElementById('rj-sejf-lock-toggle'), 'brak przełącznika blokady');
  dom.window.close();
});

console.log('\n=== F. PLIKI POWŁOKI ===');

await check('strona ładuje warstwę natywną na każdej podstronie', async () => {
  const pages = fs.readdirSync(path.join(root, 'rejhub2')).filter((file) => file.endsWith('.html'));
  const withNative = pages.filter((file) => read('rejhub2/' + file).includes('/js/native-shell.js?v=1'));
  assert.ok(withNative.length >= 20, 'za mało stron z warstwą natywną: ' + withNative.length);
  const without = pages.filter((file) => !read('rejhub2/' + file).includes('/js/app-update.js'));
  without.forEach((file) => {
    assert.equal(read('rejhub2/' + file).includes('native-shell.js'), false,
      file + ' nie ma apki, a ładuje warstwę natywną');
  });
});

await check('push.js zna FCM, a serwer umie wysłać powiadomienie do aplikacji', async () => {
  const push = read('js/push.js');
  assert.match(push, /PushNotifications/, 'brak natywnych powiadomień');
  assert.match(push, /push_subscribe_native/, 'token FCM nie trafia do bazy');
  assert.match(push, /createChannel/, 'brak kanału powiadomień');
  assert.match(push, /registration/, 'brak nasłuchu tokenu');

  const server = read('rejhub2/api/push-send.js');
  assert.match(server, /fcm\.googleapis\.com/, 'serwer nie wysyła do FCM');
  assert.match(server, /FIREBASE_SERVICE_ACCOUNT/, 'brak konta usługi Firebase');
  assert.match(server, /OPEN_REJHUB/, 'dotknięcie powiadomienia nie otworzy miejsca w aplikacji');

  assert.ok(fs.existsSync(path.join(root, 'supabase/2026-11-20_push_fcm.sql')),
    'brak migracji dla tokenów FCM');
});

console.log('\n========================================================');
if (failures.length) {
  console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
  failures.forEach((failure) => console.log(' - ' + failure));
  process.exit(1);
}
console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
console.log('PASS: warstwa natywna aplikacji — pasek stanu, udostępnianie, pliki, aktualizacja, RejSejf');

})().catch((error) => {
  console.error(error);
  process.exit(1);
});
