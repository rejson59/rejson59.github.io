# Podgląd zmian: ProStudent

Wyłącznie do czytania; prawdziwe pliki i ich sumy są w planie. Końcowe odstępy pominięto.

```diff
--- a/index.html
+++ b/index.html
@@ -1,6 +1,21 @@
 <!doctype html>
 <html lang="pl">
   <head>
+    <!-- rj-portal-bootstrap:start: tylko ta sama domena i powrót z portalu -->
+    <script>
+      (function () {
+        try {
+          if (location.origin !== "https://rejson59.github.io" || window.top !== window.self ||
+              !sessionStorage.getItem("rj_portal_arrival_v1") ||
+              document.querySelector('script[src*="/js/portal-arrival.js"]')) return;
+          // Parser ładuje arkusz przed skryptem, zanim zacznie się aplikacja.
+          document.write('<link rel="stylesheet" href="/css/portal.css?v=11" data-rj-portal-style>' +
+            '<scr' + 'ipt src="/js/portal-arrival.js?v=10"></scr' + 'ipt>');
+        } catch (_) { /* Bez pamięci sesji gra/aplikacja działa normalnie. */ }
+      })();
+    </script>
+    <!-- rj-portal-bootstrap:end -->
+
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <title>Plecak — szkolne centrum dowodzenia</title>
--- a/package.json
+++ b/package.json
@@ -5,10 +5,10 @@
   "type": "module",
   "scripts": {
     "dev": "vite",
-    "build": "vite build",
+    "build": "vite build && node --test scripts/portal-bootstrap.test.mjs",
     "preview": "vite preview",
     "typecheck": "tsc --noEmit",
-    "test": "vitest run"
+    "test": "vitest run && node --test scripts/portal-bootstrap.test.mjs scripts/service-worker.test.mjs"
   },
   "dependencies": {
     "clsx": "2.1.1",
--- a/README.md
+++ b/README.md
@@ -152,3 +152,9 @@
 2. Utwórz branch: `git checkout -b feat/nazwa-zmiany`
 3. Przed commitem: `npm run typecheck && npm run build`
 4. Otwórz Pull Request — CI (`.github/workflows/ci.yml`) sprawdzi typy i build.
+
+## Przejście z portalu Rejson
+
+Na `https://rejson59.github.io` dokument rozpoznaje jednorazowy znacznik przejścia i wczytuje animację wyjścia przed startem aplikacji — również wtedy, gdy projekt ma własny service worker. Bez znacznika, w ramce, na innych domenach i przy niedostępnej pamięci sesji kod nie pobiera zasobów portalu. Skrypt nie przenosi kont ani danych między domenami; na innych originach wyjście z portalu nie jest gwarantowane.
+
+Plecak zachowuje własny tryb offline; jego service worker czyści tylko stare cache o prefiksie `plecak-` i przechwytuje POST wyłącznie dla zadeklarowanego w manifeście udostępniania. Nie usuwa cache innych projektów.
--- a/public/sw.js
+++ b/public/sw.js
@@ -10,7 +10,10 @@
  * czyszczenia danych.
  */

-const VERSION = "plecak-v1";
+const VERSION = "plecak-v2";
+const CACHE_PREFIX = "plecak-";
+const scope = new URL(self.registration.scope);
+const shareAction = new URL("./index.html?akcja=import", scope);
 const SHELL = [
   "./",
   "./index.html",
@@ -36,7 +39,7 @@
   event.waitUntil(
     caches
       .keys()
-      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
+      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== VERSION).map((key) => caches.delete(key))))
       .then(() => self.clients.claim())
   );
 });
@@ -66,7 +69,9 @@

   if (request.method === "POST") {
     const target = new URL(request.url);
-    if (target.origin === self.location.origin) {
+    // Przechwytuj wyłącznie deklarowany w manifeście cel systemowego udostępniania.
+    // Żądania POST innych aplikacji na tej samej domenie muszą przejść do sieci.
+    if (target.origin === shareAction.origin && target.pathname === shareAction.pathname && target.search === shareAction.search) {
       event.respondWith(handleShare(request));
     }
     return;
@@ -75,7 +80,7 @@
   if (request.method !== "GET") return;

   const url = new URL(request.url);
-  if (url.origin !== self.location.origin) return; // czcionki i agent zostają poza cache
+  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return; // inne projekty i czcionki zostają poza cache

   // Dokumenty: sieć, a bez sieci ostatnia zapisana kopia.
   if (request.mode === "navigate" || request.destination === "document") {
@@ -86,7 +91,10 @@
           void caches.open(VERSION).then((cache) => cache.put("./index.html", copy));
           return response;
         })
-        .catch(async () => (await caches.match("./index.html")) ?? (await caches.match("./")) ?? Response.error())
+        .catch(async () => {
+          const cache = await caches.open(VERSION);
+          return (await cache.match("./index.html")) ?? (await cache.match("./")) ?? Response.error();
+        })
     );
     return;
   }
@@ -94,12 +102,13 @@
   if (!isAsset(request.url)) return;

   event.respondWith(
-    caches.match(request).then((cached) => {
+    caches.open(VERSION).then(async (cache) => {
+      const cached = await cache.match(request);
       const network = fetch(request)
         .then((response) => {
           if (response.ok) {
             const copy = response.clone();
-            void caches.open(VERSION).then((cache) => cache.put(request, copy));
+            void cache.put(request, copy);
           }
           return response;
         })
--- /dev/null
+++ b/scripts/portal-bootstrap.test.mjs
@@ -0,0 +1,33 @@
+import { readFileSync, existsSync } from 'node:fs';
+import { runInNewContext } from 'node:vm';
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+
+function scriptFrom(path) {
+  const html = readFileSync(path, 'utf8');
+  const match = html.match(/rj-portal-bootstrap:start[\s\S]*?<script>([\s\S]*?)<\/script>[\s\S]*?rj-portal-bootstrap:end/);
+  assert.ok(match, `Brak wczesnego skryptu w ${path}`);
+  assert.ok(html.indexOf('rj-portal-bootstrap:start') < html.indexOf('id="root"'));
+  return match[1];
+}
+function execute(script, { origin = 'https://rejson59.github.io', marker = '{"path":"/project/","at":1}', existing = false, iframe = false, throws = false } = {}) {
+  let html = '';
+  const self = {};
+  const window = { self, top: iframe ? {} : self };
+  const sessionStorage = { getItem(k) { assert.equal(k, 'rj_portal_arrival_v1'); if (throws) throw Error('storage unavailable'); return marker; } };
+  const document = { querySelector() { return existing ? {} : null; }, write(s) { html += s; } };
+  runInNewContext(script, { location: { origin }, window, sessionStorage, document });
+  return html;
+}
+for (const path of ['index.html', ...(existsSync('dist/index.html') ? ['dist/index.html'] : [])]) {
+  test(`${path}: tylko prawdziwy powrót na wspólnej domenie ładuje CSS i JS`, () => {
+    const script = scriptFrom(path);
+    const html = execute(script);
+    assert.match(html, /href="\/css\/portal\.css\?v=11"[^>]*data-rj-portal-style/);
+    assert.match(html, /<script src="\/js\/portal-arrival\.js\?v=10"><\/script>/);
+    assert.ok(html.indexOf('<link') < html.indexOf('<script'));
+    for (const opts of [{ marker: null }, { origin: 'https://example.com' }, { existing: true }, { iframe: true }, { throws: true }]) {
+      assert.equal(execute(script, opts), '');
+    }
+  });
+}
--- /dev/null
+++ b/scripts/service-worker.test.mjs
@@ -0,0 +1,64 @@
+import { readFileSync } from 'node:fs';
+import { runInNewContext } from 'node:vm';
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+
+function harness({ offline = false, initial = [] } = {}) {
+  const handlers = {};
+  const names = new Set(initial);
+  const deleted = [];
+  let claimed = false;
+  const own = { match: async (request) => request === './index.html' ? { id: 'own-offline-document' } : undefined, put: async () => {}, addAll: async () => {} };
+  const caches = {
+    keys: async () => [...names],
+    delete: async (key) => { deleted.push(key); return names.delete(key); },
+    open: async (key) => { assert.equal(key, 'plecak-v2'); names.add(key); return own; },
+    match: async () => { throw Error('Nie wolno odczytywać cudzych cache!'); },
+  };
+  const self = {
+    location: new URL('https://rejson59.github.io/ProStudent/sw.js'),
+    registration: { scope: 'https://rejson59.github.io/ProStudent/', update() {} },
+    addEventListener: (type, fn) => { handlers[type] = fn; },
+    clients: { claim: async () => { claimed = true; } }, skipWaiting: async () => {},
+  };
+  const fetch = async () => { if (offline) throw Error('offline'); return { ok: true, clone() { return this; } }; };
+  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, URL, URLSearchParams, Response, Request, fetch, Promise, console });
+  function event(request) {
+    let response;
+    handlers.fetch({ request, respondWith(promise) { response = promise; } });
+    return response;
+  }
+  return { handlers, names, deleted, event, get claimed() { return claimed; } };
+}
+
+test('aktywacja usuwa tylko stare cache Plecaka, nie inne projekty', async () => {
+  const h = harness({ initial: ['plecak-v1', 'plecak-v2', 'rejson-pages-v1', 'rejfile-v5', 'other'] });
+  let pending;
+  h.handlers.activate({ waitUntil(p) { pending = p; } });
+  await pending;
+  assert.deepEqual(h.deleted, ['plecak-v1']);
+  assert.equal(h.claimed, true);
+  assert.ok(h.names.has('rejson-pages-v1') && h.names.has('rejfile-v5'));
+});
+test('POST przechwytuje tylko dokładny cel share_target', async () => {
+  const h = harness();
+  const share = { method: 'POST', url: 'https://rejson59.github.io/ProStudent/index.html?akcja=import', formData: async () => new Map([['text', 'Praca domowa']]) };
+  const result = await h.event(share);
+  assert.equal(result.status, 303);
+  assert.equal(new URL(result.headers.get('location')).searchParams.get('text'), 'Praca domowa');
+  for (const url of [
+    'https://rejson59.github.io/other/api', 'https://rejson59.github.io/ProStudent/api',
+    'https://rejson59.github.io/ProStudent/index.html?akcja=inny', 'https://example.com/ProStudent/index.html?akcja=import'
+  ]) assert.equal(h.event({ method: 'POST', url }), undefined);
+});
+test('inne projekty i obce domeny nie są przechwytywane przez cache', () => {
+  const h = harness();
+  for (const url of ['https://rejson59.github.io/css/portal.css', 'https://rejson59.github.io/RejStream/index.html', 'https://example.com/ProStudent/icon.svg']) {
+    assert.equal(h.event({ method: 'GET', url, mode: 'navigate' }), undefined);
+  }
+});
+test('offline strona Plecaka używa tylko własnego cache', async () => {
+  const h = harness({ offline: true });
+  const response = await h.event({ method: 'GET', url: 'https://rejson59.github.io/ProStudent/', mode: 'navigate' });
+  assert.equal(response.id, 'own-offline-document');
+});
```
