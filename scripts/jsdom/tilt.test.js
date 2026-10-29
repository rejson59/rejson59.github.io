/* Testy efektu 3D kart (tilt + połysk) — czysta logika, bez przeglądarki.
 *
 * Uruchomienie:
 *   cd scripts/jsdom && npm install && node tilt.test.js
 *
 * Po co: użytkownik zgłosił, że przy najechaniu na kartę (najczęściej
 * VibeAnimations) karta „znika i pojawia się", a strona przycina. Nie da się
 * tego zobaczyć w jsdom, ale DA SIĘ zmierzyć mechanizmy, które to powodowały:
 *  - ile razy na jeden ruch myszy zmieniamy styl (karta drga przy każdej zmianie),
 *  - ile razy mierzymy layout (getBoundingClientRect w pointermove = przecinanie
 *    się odczytu i zapisu stylów, czyli wymuszanie przeliczania układu),
 *  - czy `transition` jest nadpisywany w trakcie ruchu (restart animacji
 *    kilkadziesiąt razy na sekundę),
 *  - czy obracamy kartę, której podgląd dopiero się wczytuje,
 *  - czy połysk unieważnia style całej karty (razem z ramką) zamiast swojego tła,
 *  - czy jest bezpiecznik: gdy przeglądarka gubi klatki, efekt ma się wyłączyć.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const APP_PATH = process.env.RJ_APP || path.join(ROOT, "js", "app.js");
const APP = fs.readFileSync(APP_PATH, "utf8");
const CSS_PATH = process.env.RJ_CSS || path.join(ROOT, "css", "style.css");
const CSS = fs.readFileSync(CSS_PATH, "utf8");
const INDEX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* Wyciągamy z app.js wyłącznie blok tiltu — reszta pliku potrzebuje sieci. */
const tiltStart = APP.indexOf("/* ---------- Efekt 3D (tilt + połysk za kursorem) ----------");
const tiltEnd = APP.indexOf("/* ---------- Filtry i wyszukiwarka ----------");
if (tiltStart === -1 || tiltEnd === -1) throw new Error("nie znalazłem bloku tiltu w js/app.js");
const TILT = APP.slice(tiltStart, tiltEnd);

const out = [];
const check = (name, cond, detail) => {
  out.push(!!cond);
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (detail ? "  [" + detail + "]" : ""));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const CARD_HTML = `
<div class="project-card is-vibe" data-tilt data-repo="VibeAnimations">
  <div class="card-inner">
    <div class="card-sheen" aria-hidden="true"></div>
    <a class="card-preview" href="https://rejson59.github.io/VibeAnimations/">
      <div class="card-preview-frame"><iframe data-src="https://rejson59.github.io/VibeAnimations/"></iframe></div>
    </a>
    <h3 class="card-title">VibeAnimations</h3>
  </div>
</div>`;

/* rAF pod naszą kontrolą: dzięki temu „jedna klatka" jest w teście naprawdę jedną. */
function mk() {
  const dom = new JSDOM("<!doctype html><html><body>" + CARD_HTML + "</body></html>", {
    url: "https://rejson59.github.io/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;

  const mq = (q) => ({ matches: /hover/.test(q), media: q, addListener() {}, removeListener() {} });
  w.matchMedia = mq;
  /* jsdom udaje maszynę z 2 rdzeniami — a my testujemy zachowanie na zwykłym
     desktopie (pełny efekt, z połyskiem) */
  Object.defineProperty(w.navigator, "hardwareConcurrency", { value: 8, configurable: true });
  Object.defineProperty(w.navigator, "deviceMemory", { value: 8, configurable: true });

  let queue = [];
  w.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  w.cancelAnimationFrame = () => { queue = []; };
  const runFrames = (ts) => {
    const pending = queue;
    queue = [];
    pending.forEach((fn) => fn(ts === undefined ? 1000 : ts));
    return pending.length;
  };
  const framesQueued = () => queue.length;

  const doc = w.document;
  const card = doc.querySelector(".project-card");
  const inner = doc.querySelector(".card-inner");
  const sheen = doc.querySelector(".card-sheen");
  const preview = doc.querySelector(".card-preview");

  /* Pomiar: liczba zapisów do atrybutu style karty i do połysku. */
  const writes = { inner: 0, sheen: 0, card: 0 };
  const obs = (el, key) => new w.MutationObserver((list) => { writes[key] += list.length; })
    .observe(el, { attributes: true, attributeFilter: ["style"] });
  obs(inner, "inner"); obs(sheen, "sheen"); obs(card, "card");

  let rectReads = 0;
  card.getBoundingClientRect = () => {
    rectReads += 1;
    return { left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0 };
  };

  w.eval(TILT);
  /* Podpinamy ręcznie: fixture nie jest w .showcase-item, więc initStaticTilt
     sam by tej karty nie znalazł. Wchodzimy przez API, a gdy go nie ma (starsze
     wersje kodu) — przez samą funkcję attachTilt z bloku. Dzięki temu ten sam
     test da się puścić na STARYM kodzie i pokazać, co było zepsute. */
  const api = w.RJTilt || {};
  const attach = api.attach || w.attachTilt;
  if (typeof attach !== "function") throw new Error("brak funkcji attachTilt w js/app.js");
  attach(card, inner, 5);
  const isOff = () => !!(api.isOff ? api.isOff() : doc.documentElement.classList.contains("rj-tilt-off"));

  return { dom, w, doc, card, inner, sheen, preview, writes, obs, runFrames, framesQueued, isOff,
           rectReads: () => rectReads };
}

const move = (w, el, x, y, type) => el.dispatchEvent(new w.MouseEvent(type || "pointermove", {
  bubbles: true, clientX: x, clientY: y,
}));

const angles = (transform) => {
  const rx = /rotateX\((-?[\d.]+)deg\)/.exec(transform || "");
  const ry = /rotateY\((-?[\d.]+)deg\)/.exec(transform || "");
  return { x: rx ? parseFloat(rx[1]) : null, y: ry ? parseFloat(ry[1]) : null };
};

(async () => {
  console.log("\n=== A. JEDNA AKTUALIZACJA NA KLATKĘ ===");
  {
    const t = mk();
    const { w, card, inner, writes } = t;
    await wait(0);
    writes.inner = 0; writes.sheen = 0;

    check("API wystawione dla testów", !!(w.RJTilt && typeof w.RJTilt.attach === "function"),
      w.RJTilt ? "jest" : "brak window.RJTilt");

    move(w, card, 150, 100, "pointerenter");
    await wait(0);
    const poWejsciu = writes.inner;

    /* 40 ruchów w JEDNEJ klatce — tak wygląda szybkie machnięcie myszą */
    for (let i = 0; i < 40; i++) move(w, card, 60 + i * 4, 40 + i);
    const przedKlatka = writes.inner;
    check("ruchy przed klatką nie piszą do stylu", przedKlatka === poWejsciu,
      "zapisów: " + (przedKlatka - poWejsciu));

    const ran = t.runFrames(1000);
    await wait(0);
    check("40 ruchów → dokładnie 1 aktualizacja stylu", writes.inner - poWejsciu === 1,
      "zapisów: " + (writes.inner - poWejsciu) + ", klatek: " + ran);
    check("kolejka rAF nie puchnie (nie ma 40 klatek)", ran === 1, "klatek: " + ran);
    check("layout mierzony raz na hover", t.rectReads() === 1, "odczytów: " + t.rectReads());
  }

  console.log("\n=== B. PRZEJŚCIE NIE JEST NADPISYWANE W RUCHU ===");
  {
    const t = mk();
    const { w, card, inner, writes } = t;
    await wait(0);
    writes.inner = 0;

    move(w, card, 150, 100, "pointerenter");
    await wait(0);
    const transitionWejscie = inner.style.transition;
    check("na wejściu jest przejście tylko na obramowanie/tło",
      /border-color/.test(transitionWejscie) && !/transform/.test(transitionWejscie),
      transitionWejscie);

    const przejscia = new Set();
    for (let f = 0; f < 12; f++) {
      for (let i = 0; i < 6; i++) move(w, card, 40 + f * 12 + i, 30 + f * 5);
      t.runFrames(1000 + f * 16);
      await wait(0);
      przejscia.add(inner.style.transition);
    }
    check("w trakcie ruchu przejście się nie zmienia (0 restartów)",
      przejscia.size === 1, [...przejscia].join(" | "));
  }

  console.log("\n=== C. OBRÓT: ZAKRES, ZAOKRĄGLENIE, PODNIESIENIE ===");
  {
    const t = mk();
    const { w, card, inner } = t;
    await wait(0);

    move(w, card, 150, 100, "pointerenter");
    move(w, card, 300, 200);  /* prawy dolny róg */
    t.runFrames(1000);
    await wait(0);
    const a = angles(inner.style.transform);
    check("kąt nie przekracza maksimum (5°)", Math.abs(a.x) <= 5 && Math.abs(a.y) <= 5,
      "x=" + a.x + " y=" + a.y);
    const miejsca = (v) => (String(v).split(".")[1] || "").length;
    check("kąty zaokrąglone do 0,1° (mniej zmian stylu)",
      miejsca(a.x) <= 1 && miejsca(a.y) <= 1, "x=" + a.x + " y=" + a.y);
    check("podniesienie karty wliczone w transform (brak skoku 2 px)",
      /translateY\(-2px\)/.test(inner.style.transform), inner.style.transform);

    move(w, card, 0, 0);
    t.runFrames(1016);
    await wait(0);
    const b = angles(inner.style.transform);
    check("przeciwny róg daje przeciwny kąt", b.x > 0 && b.y < 0, "x=" + b.x + " y=" + b.y);
  }

  console.log("\n=== D. POŁYSK NIE UNIEWAŻNIA CAŁEJ KARTY ===");
  {
    const t = mk();
    const { w, card, inner, sheen } = t;
    await wait(0);

    move(w, card, 150, 100, "pointerenter");
    move(w, card, 90, 60);
    t.runFrames(1000);
    await wait(0);

    check("zmienne połysku są na .card-sheen", sheen.style.getPropertyValue("--mx") !== "",
      "--mx=" + sheen.style.getPropertyValue("--mx"));
    check("karta nie dostaje zmiennych połysku (iframe nie jest przeliczany)",
      inner.style.getPropertyValue("--mx") === "" && inner.style.getPropertyValue("--my") === "",
      "inner --mx=" + JSON.stringify(inner.style.getPropertyValue("--mx")));
    check("połysk nie podlega własnemu transformowi",
      !/transform/.test(sheen.style.cssText), sheen.style.cssText);
  }

  console.log("\n=== E. EFEKT JEST OD PIERWSZEJ KLATKI (TAKŻE PRZY WCZYTYWANIU) ===");
  {
    /* Regresja: blokowanie obrotu na czas wczytywania podglądu sprawiało, że przy
       pierwszym najechaniu na kartę w sekcji wyróżnionych efektu w ogóle nie było. */
    const t = mk();
    const { w, card, inner, preview, writes } = t;
    await wait(0);
    writes.inner = 0;

    preview.classList.add("is-loading");
    move(w, card, 150, 100, "pointerenter");
    move(w, card, 290, 190);
    t.runFrames(1000);
    await wait(0);
    check("karta obraca się mimo wczytywania podglądu",
      /rotate/.test(inner.style.transform || ""), JSON.stringify(inner.style.transform));
    check("nadal jeden zapis stylu na klatkę", writes.inner <= 2,
      "zapisów: " + writes.inner);

    preview.classList.remove("is-loading");
    preview.classList.add("is-loaded");
    check("po wczytaniu podglądu efekt działa dalej", card.classList.contains("is-tilting"));
  }

  console.log("\n=== F. POWRÓT DO NEUTRALNEGO I SPRZĄTANIE ===");
  {
    const t = mk();
    const { w, card, inner, sheen } = t;
    await wait(0);

    move(w, card, 150, 100, "pointerenter");
    move(w, card, 250, 150);
    t.runFrames(1000);
    await wait(0);
    check("karta obrócona w trakcie hoveru", /rotate/.test(inner.style.transform));
    check("klasa .is-tilting jest tylko w czasie hoveru", card.classList.contains("is-tilting"));

    move(w, card, 250, 150, "pointerleave");
    await wait(0);
    check("po wyjściu transform wraca do zera", inner.style.transform === "",
      JSON.stringify(inner.style.transform));
    check("powrót jest animowany (transition z transform)",
      /transform \.38s/.test(inner.style.transition), inner.style.transition);

    await wait(520);
    check("po powrocie zdjęta klasa is-tilting", !card.classList.contains("is-tilting"));
    check("styl oddany arkuszowi (brak inline transition)", inner.style.transition === "",
      JSON.stringify(inner.style.transition));
    check("zmienne połysku posprzątane", sheen.style.getPropertyValue("--mx") === "",
      JSON.stringify(sheen.style.getPropertyValue("--mx")));
  }

  console.log("\n=== G. EFEKT NIE WYŁĄCZA SIĘ SAM (NAWET PRZY PAUZACH KURSORA) ===");
  {
    /* Regresja z życia: „przez chwilę działało i znowu się wyłączyło”.
       Poprzedni bezpiecznik mierzył odstępy między wywołaniami rAF, a te lecą
       TYLKO przy ruchu myszy — więc każda pauza kursora (>90 ms) liczyła się jako
       zgubiona klatka. Kilka pauz → kąt się połowił, potem efekt gasł na sesję.
       Ten test robi dokładnie to: najechanie z pauzami i ruchami w seriach. */
    const t = mk();
    const { w, card, inner, doc } = t;
    await wait(0);

    move(w, card, 150, 100, "pointerenter");
    let ts = 1000;
    const katy = [];
    for (let s2 = 0; s2 < 12; s2++) {
      for (let f = 0; f < 4; f++) {          /* krótka seria ruchów */
        move(w, card, 295 - (f % 2), 8 + f);
        t.runFrames(ts);
        ts += 16;
        await wait(0);
      }
      katy.push(Math.abs(angles(inner.style.transform).y));
      ts += 400;                             /* i dłuższa pauza kursora */
      await wait(30);
    }

    check("po 12 seriach z pauzami efekt nadal działa", t.isOff() === false);
    check("karta nie dostała klasy wyłączenia",
      !doc.documentElement.classList.contains("rj-tilt-off"),
      doc.documentElement.className || "brak klasy");
    check("kąt się nie zmniejszył (nie ma „połowienia” w trakcie)",
      Math.min.apply(null, katy) > 4.5,
      "najmniejszy kąt: " + Math.min.apply(null, katy).toFixed(1) + " | pełny: " + Math.max.apply(null, katy).toFixed(1));
    check("efekt trzyma się karty po pauzie",
      /rotate/.test(inner.style.transform || ""), JSON.stringify(inner.style.transform));
  }

  console.log("\n=== G2. WYŁĄCZENIE TYLKO RĘCZNE (RJTilt.disable) ===");
  {
    const t = mk();
    const { w, card, inner, doc } = t;
    await wait(0);

    move(w, card, 150, 100, "pointerenter");
    move(w, card, 290, 12);
    t.runFrames(1000);
    await wait(0);
    check("przed wyłączeniem karta jest obrócona", /rotate/.test(inner.style.transform));

    w.RJTilt.disable("test");
    await wait(0);
    check("disable() wyłącza efekt", t.isOff() === true);
    check("disable() oznacza stronę klasą", doc.documentElement.classList.contains("rj-tilt-off"));
    check("disable() prostuje kartę", inner.style.transform === "",
      JSON.stringify(inner.style.transform));

    move(w, card, 10, 10);
    t.runFrames(1016);
    await wait(0);
    check("po disable() ruch myszy nic nie robi", inner.style.transform === "");
  }

  console.log("\n=== G3. DECYZJA STAŁA, BRAK POMIARU CZASU W KODZIE ===");
  {
    const bezKomentarzy = TILT.replace(/\/\*[\s\S]*?\*\//g, "");
    check("nie ma licznika „zgubionych klatek”",
      !/strikes|longFrame|probeFrames|performance\.now/.test(bezKomentarzy),
      (bezKomentarzy.match(/strikes|longFrame|probeFrames|performance\.now/g) || []).join(", ") || "brak");
    check("decyzja o efekcie opiera się na cechach urządzenia",
      /hardwareConcurrency/.test(bezKomentarzy) && /saveData/.test(bezKomentarzy));
    check("diagnostyka dostępna w konsoli (RJTilt.reason)",
      /reason:/.test(bezKomentarzy) && /sheen:/.test(bezKomentarzy));
  }

  console.log("\n=== H. CSS: BEZ ROZWIJANIA KARTY NA WARSTWY 3D ===");
  {
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");   /* komentarze to nie kod */

    check("brak transform-style: preserve-3d w arkuszach", !/transform-style\s*:\s*preserve-3d/.test(css));
    check("perspektywę daje rodzic (.project-card)", /\.profile-card,\s*\.project-card\s*\{\s*perspective:\s*1000px/.test(css));

    const hoverPreview = /\.card-preview:hover\s*\{([^}]*)\}/.exec(css);
    check("podgląd nie ma własnego transformu na hover",
      !!hoverPreview && !/transform\s*:/.test(hoverPreview[1]),
      hoverPreview ? hoverPreview[1].trim().slice(0, 90) : "brak reguły");

    /* .btn-live ma will-change od zawsze (to nie karta) — patrzymy tylko na karty */
    const karty = css.split("}").filter((blok) => /card-inner|card-preview-frame|profile-card/.test(blok));
    const zla = karty.filter((blok) => /will-change\s*:\s*transform/.test(blok) && !/is-tilting/.test(blok));
    check("will-change na kartach wyłącznie w klasie .is-tilting", zla.length === 0,
      zla.length ? zla.join(" || ").trim().slice(0, 120) : "ok");

    check("bezpiecznik ukrywa połysk po wyłączeniu",
      /html\.rj-tilt-off\s+\.card-sheen\s*\{\s*display\s*:\s*none/.test(css));
  }

  console.log("\n=== I. PODPIĘCIE NA STRONIE ===");
  {
    check("app.js woła attachTilt dla kart z siatki",
      /if \(canTilt && inner\) attachTilt\(el, inner, 6\)/.test(APP));
    check("app.js woła attachTilt dla kart wyróżnionych",
      /attachTilt\(card, inner, 5\)/.test(APP));
    check("karta profilu też ma efekt", /attachTilt\(profile, profile, 4\)/.test(APP));
    check("wersje podbite w index.html",
      /js\/app\.js\?v=2026-10-29-portal-2/.test(INDEX) && /css\/style\.css\?v=2026-10-27-1/.test(INDEX));
    const bezKomentarzy = TILT.replace(/\/\*[\s\S]*?\*\//g, "");
    check("jedno miejsce mierzenia layoutu w bloku tiltu",
      (bezKomentarzy.match(/getBoundingClientRect/g) || []).length === 1,
      "wystąpień: " + (bezKomentarzy.match(/getBoundingClientRect/g) || []).length);
  }

  const passed = out.filter(Boolean).length;
  console.log("\n" + "=".repeat(56));
  console.log(passed === out.length ? `WYNIK: ${passed}/${out.length} ✔` : `WYNIK: ${passed}/${out.length} ✘`);
  if (passed !== out.length) process.exitCode = 1;
})();
