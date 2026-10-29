/* Testy modułu premium (jsdom) — bramka, scalanie tożsamości, powiadomienia.
 *
 * Uruchomienie:
 *   cd scripts/jsdom && npm install && node premium.test.js
 *
 * Po co: moduł dotyka dwóch delikatnych rzeczy — konta użytkownika i tego,
 * co mu pokazujemy jako „powiadomienie”. Ten test pilnuje, że:
 *  - bez konta nic nie jest „prawie zablokowane” po cichu: karta mówi wprost,
 *    co daje konto, i nie udaje, że użytkownik ma wybór, którego nie ma,
 *  - ŻADNE powiadomienie nie powstaje bez realnego zdarzenia w danych
 *    (pierwsze uruchomienie tylko zapisuje punkt odniesienia — bez zalewu),
 *  - „Rejson59 jest online” pojawia się wyłącznie wtedy, gdy naprawdę jest
 *    na liście obecności, i tylko raz na wizytę,
 *  - scalanie historii woła się raz na konto, nie przy każdym odświeżeniu.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const PREMIUM = fs.readFileSync(path.join(ROOT, "js", "premium.js"), "utf8");
const WIDGET = fs.readFileSync(path.join(ROOT, "rejson-widgets", "widget.js"), "utf8");
const INDEX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "css", "premium.css"), "utf8");
const STYLE_CSS = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");

const out = [];
const check = (name, cond, detail) => {
  out.push(!!cond);
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (detail ? "  [" + detail + "]" : ""));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SESSION = { token: "t".repeat(40), username: "RejsonFan" };

const PROJEKTY = [
  { name: "mconline", homepage: "https://rejson59.github.io/mconline/", pushed_at: "2026-10-20T10:00:00Z" },
  { name: "JoyPad", homepage: "https://rejson59.github.io/JoyPad/", pushed_at: "2026-10-21T10:00:00Z" }
];

function plansza(over) {
  return Object.assign([
    {
      id: "11111111-1111-1111-1111-111111111111",
      title: "Pasek postępu skacze",
      status: "new",
      author_name: "RejsonFan",
      admin_replied_at: null,
      updated_at: "2026-10-27T10:00:00Z"
    }
  ], over || []);
}

/* Jedno miejsce, w którym udajemy backend. Każda odpowiedź jest sterowana
   z zewnątrz, więc testy mogą sprawdzić, co moduł robi z konkretnymi danymi. */
function mk(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!doctype html><html><body><header class="site-header"><div class="header-inner">' +
      '<div class="header-metrics"></div></div></header>' +
      '<section class="rj-club container"><div id="rj-club"></div></section></body></html>',
    { url: "https://rejson59.github.io/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const w = dom.window;

  if (opts.loggedIn !== false) {
    w.localStorage.setItem("rejson_community_session_v1", JSON.stringify(opts.session || SESSION));
  }
  w.RJ_PROJECTS = opts.projects || PROJEKTY;

  const calls = [];
  w.fetch = function (url, init) {
    const fn = String(url).split("/rpc/")[1] || "";
    let body = {};
    try { body = JSON.parse(init.body || "{}"); } catch (e) { /* ignorujemy */ }
    calls.push({ fn, body });

    let payload = null;
    if (fn === "list_public_board") payload = opts.board || plansza();
    else if (fn === "community_online_users") payload = opts.online || [];
    else if (fn === "community_link_submissions") payload = { username: "RejsonFan", linked: 2 };
    else payload = null;

    if (opts.fail && opts.fail.indexOf(fn) !== -1) {
      return Promise.reject(new Error("sieć"));
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  };

  w.eval(PREMIUM);
  return { dom, w, calls, doc: w.document };
}

const count = (doc) => {
  const el = doc.getElementById("rj-bell-count");
  return el && !el.hidden ? el.textContent : "0";
};

(async () => {
  console.log("\n=== A. BRAMKA: BEZ KONTA MÓWI WPROST, CO DAJE KONTO ===");
  {
    const t = mk({ loggedIn: false });
    await wait(30);
    const card = t.doc.querySelector("#rj-club .rj-premium");
    const cta = t.doc.querySelector("#rj-club .rj-cta");

    check("karta premium jest widoczna", !!card);
    check("stan wizualny: zablokowana", card.classList.contains("is-locked"), card.className);
    check("tytuł mówi wprost, czego trzeba", /wystarczy się zalogować/i.test(card.textContent));
    check("tytuł zawiera całą obietnicę, nie tylko ogon",
      /Premium jest u mnie za darmo/.test(card.querySelector(".rj-club-title").textContent),
      card.querySelector(".rj-club-title").textContent);
    check("wymienione realne korzyści (6)",
      (card.querySelectorAll(".rj-premium__list li").length === 6),
      String(card.querySelectorAll(".rj-premium__list li").length));
    check("wśród nich wkład, moje zgłoszenia i nowości z obserwowanych",
      /Twój wkład/.test(card.textContent) && /Moje zgłoszenia/.test(card.textContent) &&
      /Nowości z obserwowanych/.test(card.textContent));
    check("karta ma warstwę połysku (animacja światła, nie tylko ramka)",
      !!card.querySelector(".rj-premium__sheen"));
    check("jest jedno wyraźne wezwanie do działania", !!cta && /konto|Zaloguj/.test(cta.textContent),
      cta ? cta.textContent : "brak");
    check("brak przycisku ukrywania stałej karty", !t.doc.getElementById("rj-club-later"));
    check("bez konta nie ma powiadomień (nie udajemy ich)", count(t.doc) === "0", count(t.doc));
    check("dzwonek istnieje i mówi, że funkcja jest dla zalogowanych", (() => {
      const bell = t.doc.getElementById("rj-bell");
      bell.click();
      const body = t.doc.getElementById("rj-bell-body").textContent;
      return bell && /dla zalogowanych/i.test(body);
    })());
  }

  console.log("\n=== B. STAŁA KARTA PREMIUM ===");
  {
    const t = mk({ loggedIn: false });
    t.w.localStorage.setItem("rj_club_snooze_v1", String(Date.now()));
    await wait(20);
    check("stare odłożenie nie ukrywa baneru", !t.doc.getElementById("rj-club").hidden);
    check("karta jest dostępna mimo starego odłożenia", !!t.doc.querySelector("#rj-club .rj-premium"));
    t.w.RJPremium.mount();
    check("ponowne montowanie nie ukrywa baneru", !t.doc.getElementById("rj-club").hidden);
  }

  console.log("\n=== C. PO ZALOGOWANIU: ODBLOKOWANE + SCALANIE RAZ ===");
  {
    const t = mk({ loggedIn: true });
    await wait(60);
    const card = t.doc.querySelector("#rj-club .rj-premium");

    check("stan wizualny: odblokowana", card.classList.contains("is-unlocked"), card.className);
    check("widać nick z konta", /RejsonFan/.test(card.textContent));
    check("odblokowana karta też ma połysk", !!card.querySelector(".rj-premium__sheen"));

    /* „Twój wkład” musi być policzony z danych, nie z sufitu */
    const stats = Array.prototype.map.call(card.querySelectorAll(".rj-stat"), (el) => el.textContent.trim());
    check("są cztery liczniki wkładu", stats.length === 4, stats.join(" | "));
    check("zgłoszenia policzone z tablicy (1 zgłoszenie RejsonFan)", /^1/.test(stats[0] || ""), stats[0]);
    check("wdrożone policzone ze statusów", /^0/.test(stats[1] || ""), stats[1]);
    check("obserwowane projekty = 0 na starcie", /^0/.test(stats[3] || ""), stats[3]);

    const link = t.calls.filter((c) => c.fn === "community_link_submissions");
    check("scalanie historii wywołane", link.length === 1, "wywołań: " + link.length);
    check("scalanie dostało token sesji",
      link.length === 1 && link[0].body.p_token === SESSION.token);

    t.w.RJPremium.refresh();
    await wait(40);
    check("kolejne odświeżenie nie woła scalania ponownie",
      t.calls.filter((c) => c.fn === "community_link_submissions").length === 1,
      "wywołań: " + t.calls.filter((c) => c.fn === "community_link_submissions").length);
  }

  console.log("\n=== D. OBSERWOWANIE PROJEKTÓW ===");
  {
    const t = mk({ loggedIn: true });
    await wait(40);

    check("na starcie nic nie obserwuję", t.w.RJPremium.following().length === 0);
    t.w.RJPremium.toggleFollow("mconline");
    check("obserwacja zapisana", t.w.RJPremium.isFollowing("mconline") === true);
    check("przetrwa odświeżenie strony",
      JSON.parse(t.w.localStorage.getItem("rj_following_v1")).indexOf("mconline") !== -1);
    t.w.RJPremium.toggleFollow("mconline");
    check("drugie kliknięcie zdejmuje obserwację", t.w.RJPremium.isFollowing("mconline") === false);

    const guest = mk({ loggedIn: false });
    await wait(20);
    check("bez konta nie da się obserwować", guest.w.RJPremium.toggleFollow("mconline") === false);
  }

  console.log("\n=== E. POWIADOMIENIA TYLKO Z PRAWDZIWYCH ZDARZEŃ ===");
  {
    /* 1. pierwsze wejście: tylko punkt odniesienia, zero powiadomień */
    const t = mk({ loggedIn: true, board: plansza() });
    await wait(60);
    check("pierwsze wejście nie zalewa powiadomieniami",
      t.w.RJPremium.notifications().length === 0,
      "sztuk: " + t.w.RJPremium.notifications().length);

    /* 2. następna wizyta: projekt się zmienił, zgłoszenie dostało odpowiedź */
    const changed = PROJEKTY.map((p) =>
      p.name === "mconline" ? Object.assign({}, p, { pushed_at: "2026-10-28T09:00:00Z" }) : p);
    const t2 = mk({ loggedIn: true, projects: changed, board: plansza([{
      id: "11111111-1111-1111-1111-111111111111",
      title: "Pasek postępu skacze",
      status: "completed",
      author_name: "RejsonFan",
      admin_replied_at: "2026-10-28T08:00:00Z",
      updated_at: "2026-10-28T08:00:00Z"
    }]) });
    /* przenosimy „widziane” z poprzedniej wizyty — tak działa prawdziwa przeglądarka */
    t2.w.localStorage.setItem("rj_following_v1", JSON.stringify(["mconline"]));
    t2.w.localStorage.setItem("rj_seen_v1", t.w.localStorage.getItem("rj_seen_v1"));
    t2.w.eval(PREMIUM);
    await wait(90);

    const notif = t2.w.RJPremium.notifications();
    const titles = notif.map((n) => n.title).join(" | ");
    check("jest powiadomienie o aktualizacji obserwowanego projektu",
      notif.some((n) => n.kind === "update" && /mconline/.test(n.title)), titles);
    check("jest powiadomienie o zmianie statusu mojego zgłoszenia",
      notif.some((n) => n.kind === "status" && /Wdrożone/.test(n.title)), titles);
    check("jest powiadomienie o odpowiedzi Rejsona",
      notif.some((n) => n.kind === "reply"), titles);
    check("każde powiadomienie ma konkretne źródło (href)", notif.every((n) => !!n.href));
    check("każde ma znacznik czasu", notif.every((n) => !!n.when && !isNaN(new Date(n.when).getTime())));
    /* Czas zdarzenia ma być prawdziwy (updated_at z tablicy), a nie moment,
       w którym przeglądarka akurat odpytała serwer — inaczej „5 min temu”
       kłamie. Kontrakt: list_public_board zwraca updated_at. */
    const statusNote = notif.filter((n) => n.kind === "status")[0];
    check("powiadomienie o statusie ma czas zdarzenia z bazy",
      statusNote && String(statusNote.when).indexOf("2026-10-28T08:00:00") === 0,
      statusNote ? String(statusNote.when) : "brak");
    check("licznik pokazuje liczbę zdarzeń",
      count(t2.doc) === (notif.length > 9 ? "9+" : String(notif.length)),
      count(t2.doc) + " vs " + notif.length);
  }

  console.log("\n=== E2. NOWE ZGŁOSZENIE W OBSERWOWANYM PROJEKCIE ===");
  {
    /* Punkt odniesienia z pierwszej wizyty */
    const first = mk({ loggedIn: true });
    await wait(60);
    const seen = first.w.localStorage.getItem("rj_seen_v1");

    /* Ktoś inny zgłosił coś PO naszej ostatniej wizycie, w projekcie,
       który obserwujemy — to realne zdarzenie, więc powiadomienie ma być. */
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    const fresh = plansza();
    fresh.push({
      id: "22222222-2222-2222-2222-222222222222",
      title: "Nowy pomysł kogoś innego",
      status: "new",
      author_name: "KtosInny",
      admin_replied_at: null,
      updated_at: future,
      created_at: future,
      project_slug: "mconline",
      project_name: "mconline"
    });

    const t = mk({ loggedIn: true, board: fresh });
    t.w.localStorage.setItem("rj_following_v1", JSON.stringify(["mconline"]));
    t.w.localStorage.setItem("rj_seen_v1", seen);
    t.w.eval(PREMIUM);
    await wait(90);

    const notif = t.w.RJPremium.notifications();
    check("jest powiadomienie o nowym zgłoszeniu w obserwowanym projekcie",
      notif.some((n) => n.kind === "new_submission" && /mconline/.test(n.title)),
      notif.map((n) => n.kind).join(" | "));
    check("nie powiadamiamy o własnych zgłoszeniach",
      !notif.some((n) => n.kind === "new_submission" && /RejsonFan/.test(n.text)));
    check("nieobserwowany projekt nie generuje powiadomienia", (() => {
      const other = plansza();
      other.push({
        id: "33333333-3333-3333-3333-333333333333",
        title: "Coś w JoyPad",
        status: "new",
        author_name: "KtosInny",
        admin_replied_at: null,
        updated_at: future,
        created_at: future,
        project_slug: "JoyPad",
        project_name: "JoyPad"
      });
      const t2 = mk({ loggedIn: true, board: other });
      t2.w.localStorage.setItem("rj_following_v1", JSON.stringify(["mconline"]));
      t2.w.localStorage.setItem("rj_seen_v1", seen);
      t2.w.eval(PREMIUM);
      return !t2.w.RJPremium.notifications().some((n) => n.kind === "new_submission");
    })());
  }

  console.log("\n=== F. OBECNOŚĆ: TYLKO PRAWDA, RAZ NA WIZYTĘ ===");
  {
    const t = mk({ loggedIn: true, online: [] });
    await wait(60);
    check("gdy Rejsona nie ma na liście — zero „jest online”",
      !t.w.RJPremium.notifications().some((n) => n.kind === "presence"));

    const t2 = mk({ loggedIn: true, online: [{ username: "rejson59", is_owner: true }] });
    await wait(60);
    const first = t2.w.RJPremium.notifications().filter((n) => n.kind === "presence").length;
    t2.w.RJPremium.refresh();
    await wait(40);
    const second = t2.w.RJPremium.notifications().filter((n) => n.kind === "presence").length;
    check("gdy naprawdę jest online — powiadomienie jest", first === 1, "sztuk: " + first);
    check("drugi raz w tej samej wizycie nie powtarza",
      second === first && first <= 1, "przed: " + first + ", po: " + second);
  }

  console.log("\n=== G. ODPORNOŚĆ: BRAK SIECI NIE PSUJE STRONY ===");
  {
    const t = mk({ loggedIn: true, fail: ["list_public_board", "community_online_users", "community_link_submissions"] });
    await wait(80);
    check("strona żyje mimo błędów sieci", !!t.doc.querySelector("#rj-club .rj-premium"));
    check("brak powiadomień nie jest błędem", Array.isArray(t.w.RJPremium.notifications()));
    check("dzwonek nadal się otwiera", (() => {
      t.doc.getElementById("rj-bell").click();
      return t.doc.getElementById("rj-bell-panel").hidden === false;
    })());
  }

  console.log("\n=== H. PODPIS ZGŁOSZEŃ W WIDGETCIE ===");
  {
    check("widget czyta nick z sesji", /function sessionUsername\(\)/.test(WIDGET));
    check("zalogowany podpisuje się kontem (nie wolnym tekstem)",
      /p_author_name: sessionUsername\(\) \|\| draft\.author\.trim\(\) \|\| "Anonim"/.test(WIDGET));
    check("sesja musi mieć token ≥16 znaków, żeby cokolwiek podpisać",
      /s\.token\.length >= 16/.test(WIDGET));
  }

  console.log("\n=== I. STRONA: PODPIĘCIE ===");
  {
    check("karta premium podpięta na stronie głównej", /id="rj-club"/.test(INDEX));
    check("arkusz premium dołączony", /css\/premium\.css\?v=3/.test(INDEX));
    check("skrypt premium dołączony", /js\/premium\.js\?v=4/.test(INDEX));
    check("karta premium stoi przed listą projektów",
      INDEX.indexOf('id="rj-club"') < INDEX.indexOf('id="projekty"'));
    check("karta premium jest tuż pod hero (przed wyróżnionymi), a nie na końcu strony",
      INDEX.indexOf('class="cta-grid container"') < INDEX.indexOf('id="rj-club"') &&
      INDEX.indexOf('id="rj-club"') < INDEX.indexOf('class="origins container"'),
      "pozycja: " + INDEX.indexOf('id="rj-club"'));
  }

  console.log("\n=== J. ANIMACJA KARTY (zgłoszenie: „nie widać animacji”) ===");
  {
    check("obwód ma co najmniej 3 px (2 px ginęło na ciemnym tle)",
      /padding:\s*3px/.test(CSS));
    check("smuga obwodu ma własną animację", /animation:\s*rj-premium-sweep/.test(CSS) &&
      /@keyframes rj-premium-sweep/.test(CSS));
    check("po karcie przechodzi połysk (to on rzuca się w oczy)",
      /animation:\s*rj-premium-sheen/.test(CSS) && /@keyframes rj-premium-sheen/.test(CSS));
    check("połysk jest przycinany do karty", /\.rj-premium__inner \{[^}]*overflow:\s*hidden/.test(CSS));
    check("treść leży nad połyskiem", /\.rj-premium__inner > \*:not\(\.rj-premium__sheen\)/.test(CSS));
    check("strona ma globalną regułę zabijającą animacje dla reduced-motion",
      /animation-duration:\s*\.01ms !important/.test(STYLE_CSS));
    check("karta premium nadpisuje ją własnym !important (smuga zwalnia, nie znika)",
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.rj-premium__glow \{[^}]*!important/.test(CSS));
    check("jest dokładnie jeden blok reduced-motion (nie dwa sprzeczne)",
      (CSS.match(/@media \(prefers-reduced-motion: reduce\)/g) || []).length === 1,
      "bloków: " + (CSS.match(/@media \(prefers-reduced-motion: reduce\)/g) || []).length);
  }

  const passed = out.filter(Boolean).length;
  console.log("\n" + "=".repeat(56));
  console.log(passed === out.length ? `WYNIK: ${passed}/${out.length} ✔` : `WYNIK: ${passed}/${out.length} ✘`);
  if (passed !== out.length) process.exitCode = 1;
})();
