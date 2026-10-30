# Podgląd zmian: mconline

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
     <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
     <meta name="color-scheme" content="dark" />
--- a/package.json
+++ b/package.json
@@ -16,10 +16,10 @@
   ],
   "scripts": {
     "dev": "vite",
-    "build": "vite build",
+    "build": "vite build && node --test scripts/portal-bootstrap.test.mjs",
     "preview": "vite preview",
     "typecheck": "tsc --noEmit",
-    "test": "node .harness/run.mjs",
+    "test": "node .harness/run.mjs && node --test scripts/portal-bootstrap.test.mjs",
     "test:engine": "node .harness/run.mjs smoke",
     "test:ui": "node .harness/run.mjs ui",
     "deploy:branch": "npm run build && npx --yes gh-pages -d dist"
--- a/README.md
+++ b/README.md
@@ -799,3 +799,7 @@

 Kod gry: **MIT** – rób z nim, co chcesz.
 Projekt inspirowany grą *Minecraft* (Mojang Studios); nie jest z nią powiązany i nie zawiera jej zasobów – wszystkie tekstury rysowane są proceduralnie w przeglądarce.
+
+## Przejście z portalu Rejson
+
+Na `https://rejson59.github.io` dokument rozpoznaje jednorazowy znacznik przejścia i wczytuje animację wyjścia przed startem aplikacji — również wtedy, gdy projekt ma własny service worker. Bez znacznika, w ramce, na innych domenach i przy niedostępnej pamięci sesji kod nie pobiera zasobów portalu. Skrypt nie przenosi kont ani danych między domenami; na innych originach wyjście z portalu nie jest gwarantowane.
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
```
