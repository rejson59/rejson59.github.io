/* Testy tablicy zgłoszeń (jsdom) — ukrywanie zakończonych i plakietka „czeka na reakcję”.
 *
 * Uruchomienie:
 *   cd scripts/jsdom && npm install && node board.test.js
 *
 * Po co: wcześniej pozycje „zamknięte” znikały z tablicy po cichu, bez słowa.
 * Ktoś mógł pomyśleć, że jego zgłoszenie wyparowało. Test pilnuje, że teraz:
 *  - domyślnie widać WSZYSTKO (także zamknięte),
 *  - ukrywanie jest jawnym kliknięciem, zapamiętanym między wejściami,
 *  - zgłoszenie bez odpowiedzi mówi wprost „czeka na reakcję”.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const BOARD = fs.readFileSync(path.join(ROOT, "rejson-widgets", "js", "board.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ROOT, "tablica-pomyslow.html"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "rejson-widgets", "css", "board.css"), "utf8");

const out = [];
const check = (name, cond, detail) => {
  out.push(!!cond);
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (detail ? "  [" + detail + "]" : ""));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ITEMS = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Nowy pomysł bez odpowiedzi", type: "idea",
    status: "new", project_slug: "mconline", project_name: "mconline", author_name: "Ktos",
    admin_reply: null, upvotes_count: 5, created_at: "2026-10-27T10:00:00Z", has_voted: false },
  { id: "aaaaaaaa-0000-0000-0000-000000000002", title: "Pomysł już wdrożony", type: "idea",
    status: "completed", project_slug: "mconline", project_name: "mconline", author_name: "Ktos",
    admin_reply: "Zrobione!", admin_replied_at: "2026-10-26T10:00:00Z", upvotes_count: 9,
    created_at: "2026-10-20T10:00:00Z", has_voted: false },
  { id: "aaaaaaaa-0000-0000-0000-000000000003", title: "Błąd odrzucony", type: "bug",
    status: "closed", project_slug: "mconline", project_name: "mconline", author_name: "Ktos",
    admin_reply: null, upvotes_count: 1, created_at: "2026-10-10T10:00:00Z", has_voted: false }
];

function mk(storage) {
  const dom = new JSDOM(
    '<!doctype html><html><body>' +
      '<div class="board-toolbar">' +
      '  <button data-type-filter="all"></button><button data-type-filter="idea"></button><button data-type-filter="bug"></button>' +
      '  <select id="filter-project"><option value="all">Wszystkie</option></select>' +
      '  <select id="filter-sort"><option value="top">top</option><option value="new">new</option></select>' +
      '  <button id="toggle-hide-done" aria-pressed="false"></button>' +
      '  <button id="btn-refresh"></button><span id="board-updated"></span>' +
      '</div>' +
      '<section id="board-feed"></section><p id="board-empty" hidden></p>' +
      '<span id="board-live-badge"></span><span id="board-live-label"></span><span id="board-cloud-state"></span>' +
      '<div id="board-toast"></div>' +
      '<button id="theme-toggle"></button>' +
      '<span id="kpi-total"></span><span id="kpi-ideas"></span><span id="kpi-bugs"></span>' +
      '<span id="kpi-votes"></span><span id="kpi-progress"></span>' +
      '</body></html>',
    { url: "https://rejson59.github.io/tablica-pomyslow", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const w = dom.window;
  if (storage) Object.keys(storage).forEach((k) => w.localStorage.setItem(k, storage[k]));

  w.RejsonCloud = {
    rpc: (fn) => {
      if (fn === "list_public_board") return Promise.resolve(ITEMS.map((i) => Object.assign({}, i)));
      if (fn === "get_ecosystem_summary") return Promise.resolve({});
      return Promise.resolve(null);
    },
    getVoterKey: () => "rjv_aaaaaaaaaaaaaaaaaaaa",
    loadMirror: () => ({ items: [], votedIds: {} }),
    saveMirror: () => {},
    computeSummaryFromMirror: () => null
  };

  w.eval(BOARD);
  return { dom, w, doc: w.document };
}

const titles = (doc) =>
  Array.prototype.map.call(doc.querySelectorAll(".board-item-title"), (el) => el.textContent.trim());

(async () => {
  console.log("\n=== A. DOMYŚLNIE WIDAĆ WSZYSTKO ===");
  {
    const t = mk();
    await wait(40);
    const all = titles(t.doc);
    check("wszystkie trzy zgłoszenia na tablicy", all.length === 3, all.join(" | "));
    check("zamknięte zgłoszenie NIE znika po cichu", all.indexOf("Błąd odrzucony") !== -1);
    check("wdrożone też jest widoczne", all.indexOf("Pomysł już wdrożony") !== -1);
    check("przełącznik mówi, co zrobi (a nie co zrobił)", /Ukryj zakończone/.test(t.doc.getElementById("toggle-hide-done").textContent));
    check("stan przełącznika: nieaktywny", t.doc.getElementById("toggle-hide-done").getAttribute("aria-pressed") === "false");
  }

  console.log("\n=== B. UKRYWANIE JEST JAWNE I ZAPAMIĘTANE ===");
  {
    const t = mk();
    await wait(40);
    t.doc.getElementById("toggle-hide-done").click();
    await wait(20);
    const left = titles(t.doc);
    check("po kliknięciu zostaje tylko to, co czeka", left.length === 1 && left[0] === "Nowy pomysł bez odpowiedzi", left.join(" | "));
    check("przełącznik zmienia tekst na powrót", /Pokaż zakończone/.test(t.doc.getElementById("toggle-hide-done").textContent));
    check("stan zapisany lokalnie", t.w.localStorage.getItem("rj_board_hide_done") === "1");
    check("użytkownik dostaje informację, co zniknęło",
      /Ukryto 2/.test(t.doc.getElementById("board-toast").textContent),
      t.doc.getElementById("board-toast").textContent);

    const again = mk({ rj_board_hide_done: "1" });
    await wait(40);
    check("po powrocie na tablicę wybór nadal obowiązuje",
      titles(again.doc).length === 1, titles(again.doc).join(" | "));

    again.doc.getElementById("toggle-hide-done").click();
    await wait(20);
    check("można to cofnąć jednym kliknięciem", titles(again.doc).length === 3);
    check("cofnięcie też jest zapamiętane", again.w.localStorage.getItem("rj_board_hide_done") === "0");
  }

  console.log("\n=== C. PLAKIETKA „CZEKA NA REAKCJĘ” ===");
  {
    const t = mk();
    await wait(40);
    const waits = Array.prototype.slice.call(t.doc.querySelectorAll(".tag-wait"));
    check("jest dokładnie jedna taka plakietka", waits.length === 1, "sztuk: " + waits.length);
    check("mówi wprost, na co czeka", /Czeka na reakcję/.test(waits[0].textContent), waits[0].textContent);
    check("plakietka jest przy zgłoszeniu bez odpowiedzi",
      waits[0].closest(".board-item").textContent.indexOf("Nowy pomysł bez odpowiedzi") !== -1);
    check("nie ma jej przy zgłoszeniu z odpowiedzią",
      !Array.prototype.some.call(t.doc.querySelectorAll(".board-item"), (el) =>
        /Pomysł już wdrożony/.test(el.textContent) && el.querySelector(".tag-wait")));
    check("nie ma jej przy zamkniętym zgłoszeniu",
      !Array.prototype.some.call(t.doc.querySelectorAll(".board-item"), (el) =>
        /Błąd odrzucony/.test(el.textContent) && el.querySelector(".tag-wait")));
  }

  console.log("\n=== D. STRONA ===");
  {
    check("przełącznik jest w pasku filtrów", /id="toggle-hide-done"/.test(PAGE));
    check("pasek filtrów ma opis dla czytników ekranu", /aria-pressed/.test(PAGE));
    check("arkusz ma styl plakietki i przełącznika", /\.tag-wait/.test(CSS) && /\.btn-hide-done/.test(CSS));
    check("wersje plików podbite (świeży cache)", /board\.js\?v=3/.test(PAGE) && /board\.css\?v=3/.test(PAGE));
  }

  const passed = out.filter(Boolean).length;
  console.log("\n" + "=".repeat(56));
  console.log(passed === out.length ? `WYNIK: ${passed}/${out.length} ✔` : `WYNIK: ${passed}/${out.length} ✘`);
  /* board.js trzyma setInterval (auto-odświeżanie co 30 s), więc sam proces
     nie wyjdzie — kończymy jawnie, żeby test nie wisiał w CI. */
  process.exit(passed === out.length ? 0 : 1);
})();
