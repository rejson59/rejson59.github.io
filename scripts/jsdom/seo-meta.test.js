/* Test metadanych SEO na wszystkich stronach RejHub 2.0 (runda 23).
 *
 * Powód: przy audycie 24.11 okazało się, że `meta description` brakowało na
 * 6 stronach, `og:*` miała 1 strona z 24, a canonical 15 z 24. Link do
 * RejHuba wklejony w Messengerze czy na Discordzie nie miał wtedy ani
 * tytułu, ani grafiki.
 *
 * Test jest celowo „twardy”: nowa strona bez opisu i OG go wywali. To
 * zamierzone — łatwiej dopisać cztery linijki przy tworzeniu strony niż
 * szukać braków po pół roku.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) pages.push(p);
  }
})(path.join(root, "rejhub2"));

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

console.log("Stron HTML: " + pages.length);

/* ------------------------------------------------------- A. meta description */
const bezOpisu = [];
for (const p of pages) {
  const s = fs.readFileSync(p, "utf8");
  const m = s.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!m || m[1].trim().length < 40) bezOpisu.push(path.relative(root, p));
}
check("każda strona ma meta description (min. 40 znaków)", () => {
  assert.deepEqual(bezOpisu, [], "brak opisu: " + bezOpisu.join(", "));
  return pages.length + " stron";
});

/* ------------------------------------------------------------- B. Open Graph */
const bezOG = [];
for (const p of pages) {
  const s = fs.readFileSync(p, "utf8");
  const ma = ["og:title", "og:description", "og:url", "og:image", "og:type"].every((k) =>
    s.includes('property="' + k + '"')
  );
  if (!ma) bezOG.push(path.relative(root, p));
}
check("każda strona ma komplet og:title/description/url/image/type", () => {
  assert.deepEqual(bezOG, [], "brak OG: " + bezOG.join(", "));
  return pages.length + " stron";
});

check("karta OG wskazuje na istniejący plik", () => {
  const img = path.join(root, "rejhub2", "assets", "og", "rejhub.jpg");
  assert.ok(fs.existsSync(img), "brak assets/og/rejhub.jpg");
  const size = fs.statSync(img).size;
  assert.ok(size > 15000, "grafika OG jest podejrzanie mała: " + size + " B");
  /* Facebook wymaga min. 200×200, ale 1200×630 daje duży podgląd. */
  return Math.round(size / 1024) + " KB";
});

check("adres og:image jest absolutny i prowadzi do produkcji", () => {
  const s = fs.readFileSync(path.join(root, "rejhub2", "index.html"), "utf8");
  const m = s.match(/property="og:image"\s+content="([^"]+)"/);
  assert.ok(m, "brak og:image");
  assert.match(m[1], /^https:\/\/rejhub\.vercel\.app\/assets\/og\/rejhub\.jpg$/);
  return m[1];
});

/* ---------------------------------------------------------------- C. canonical */
const bezCanonical = pages
  .filter((p) => !fs.readFileSync(p, "utf8").includes('rel="canonical"'))
  .map((p) => path.relative(root, p));
check("każda strona ma rel=canonical", () => {
  assert.deepEqual(bezCanonical, [], "brak canonical: " + bezCanonical.join(", "));
  return pages.length + " stron";
});

check("canonical nie wskazuje na przekierowanie", () => {
  /* /spolecznosc robi location.replace na /rejchat — nie może być kanoniczny. */
  for (const p of pages) {
    const s = fs.readFileSync(p, "utf8");
    const m = s.match(/rel="canonical"\s+href="([^"]+)"/);
    if (!m) continue;
    assert.ok(!/\/spolecznosc\/?$/.test(m[1]), path.relative(root, p) + " wskazuje na /spolecznosc");
  }
  return "bez przekierowań";
});

/* ------------------------------------------------------------------- D. sitemap */
const sitemap = fs.readFileSync(path.join(root, "rejhub2", "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check("sitemap nie zawiera duplikatów ani /spolecznosc", () => {
  assert.equal(new Set(urls).size, urls.length, "duplikaty w sitemap");
  assert.ok(!urls.some((u) => /\/spolecznosc\/?$/.test(u)), "/spolecznosc przekierowuje");
  return urls.length + " adresów";
});

check("sitemap zawiera strony dodane w rundzie 23", () => {
  for (const u of ["/logowanie", "/profil", "/co-nowego", "/rejchat/regulamin"]) {
    assert.ok(urls.some((x) => x.endsWith(u)), "brak " + u + " w sitemap");
  }
  return "4 nowe adresy";
});

check("każdy adres z sitemap ma odpowiednik pliku", () => {
  const brak = [];
  for (const u of urls) {
    const p = u.replace("https://rejhub.vercel.app", "").replace(/^\//, "").replace(/\/$/, "");
    const cel = p === "" ? "index.html" : p + ".html";
    const idx = p === "" ? null : path.join(root, "rejhub2", p, "index.html");
    if (!fs.existsSync(path.join(root, "rejhub2", cel)) && !(idx && fs.existsSync(idx))) {
      brak.push(u);
    }
  }
  assert.deepEqual(brak, [], "nie ma pliku dla: " + brak.join(", "));
  return "wszystkie " + urls.length;
});

/* -------------------------------------------------- E. strony techniczne noindex */
check("panel, admin, login i studio nie są indeksowane", () => {
  for (const f of ["admin.html", "panel.html", "login.html", "szklane-studio.html"]) {
    const s = fs.readFileSync(path.join(root, "rejhub2", f), "utf8");
    assert.match(s, /name="robots"\s+content="[^"]*noindex/, f + " jest indeksowany");
  }
  return "4 strony";
});

console.log(failures ? "\nWYNIK: " + failures + " błędów ✘" : "\nWYNIK: wszystko ✔");
process.exit(failures ? 1 : 0);
