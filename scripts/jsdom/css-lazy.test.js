/* Test odraczania niekrytycznych arkuszy (runda 23).
 *
 * `island.css` (49 KB) opisuje wyłącznie wyspę, którą `island.js` montuje po
 * DOMContentLoaded — blokowanie nim pierwszego malowania było stratą czasu.
 * Arkusz jedzie jako `preload`, a `css-lazy.js` zamienia go w stylesheet.
 *
 * Ważne: CSP RejHuba ma `script-src-attr 'none'`, więc `onload="this.media=…"`
 * NIGDY by nie zadziałał. Ten test pilnuje, żeby ktoś nie „uprościł” tego
 * z powrotem do inline handlera.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let failures = 0;
const check = (name, fn) => {
  try {
    const d = fn();
    console.log("  ✔ " + name + (d ? "  [" + d + "]" : ""));
  } catch (e) {
    failures++;
    console.log("  ✘ " + name + "  [" + e.message + "]");
  }
};

const index = read("rejhub2/index.html");
const lazySrc = read("js/css-lazy.js");

check("island.css nie blokuje pierwszego malowania", () => {
  assert.match(index, /rel="preload"[^>]+island\.css[^>]+as="style"/, "brak preload dla island.css");
  /* Tylko realne tagi <link>, nie komentarze HTML; <noscript> to zamierzony
     fallback dla osób bez JS, więc nie liczy się jako blokada renderu. */
  const bezNoscript = index.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  const blocking = [...bezNoscript.matchAll(/<link[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /rel="stylesheet"/.test(tag) && /island\.css/.test(tag));
  assert.deepEqual(blocking, [], "island.css nadal blokuje render: " + blocking.join(" "));
  return "preload";
});

check("odroczony arkusz ma data-rj-css i fallback w <noscript>", () => {
  assert.match(index, /data-rj-css/, "brak znacznika data-rj-css");
  assert.match(index, /<noscript><link[^>]+island\.css/, "brak fallbacku bez JS");
  return "znacznik + noscript";
});

check("nie używamy inline onload (CSP by go zablokował)", () => {
  assert.equal(/onload\s*=\s*["'][^"']*media/.test(index), false, "znalazłem onload w index.html");
  const csp = JSON.parse(read("rejhub2/vercel.json"));
  const all = JSON.stringify(csp);
  assert.match(all, /script-src-attr 'none'/, "CSP nie blokuje atrybutów — test traci sens");
  return "script-src-attr 'none'";
});

check("arkusz, który stylizuje karty na pierwszym ekranie, NIE jest odroczony", () => {
  /* glass2.css maluje .project-card na starcie — odroczenie go powodowałoby
     przeskok wyglądu (FOUC). Ta asercja zapobiega „optymalizacji” na ślepo. */
  const blocking = index.match(/<link[^>]+rel="stylesheet"[^>]+glass2\.css[^>]*>/);
  assert.ok(blocking, "glass2.css musi blokować render");
  return "glass2.css w ścieżce krytycznej";
});

check("css-lazy.js podłącza arkusz dopiero po DOMContentLoaded", () => {
  assert.match(lazySrc, /DOMContentLoaded/);
  assert.match(lazySrc, /rel = "stylesheet"/);
  assert.match(lazySrc, /insertBefore\(style, preload\.nextSibling\)/, "arkusz musi trafić w to samo miejsce (kaskada)");
  return "kaskada zachowana";
});

check("każda podstrona z island.css ma go w wersji island.js", () => {
  /* Reguła z rebuild.test.js, ale zawężona do odroczonego pliku. */
  const pages = ["index.html", "rejchat.html"];
  for (const p of pages) {
    const s = read("rejhub2/" + p);
    const css = (s.match(/island\.css\?v=([\w.-]+)/) || [])[1];
    const js = (s.match(/island\.js\?v=([\w.-]+)/) || [])[1];
    if (css && js) assert.equal(css, js, p + ": island.css v" + css + " ≠ island.js v" + js);
  }
  return "wersje zgodne";
});

console.log(failures ? "\nWYNIK: " + failures + " błędów ✘" : "\nWYNIK: wszystko ✔");
process.exit(failures ? 1 : 0);
