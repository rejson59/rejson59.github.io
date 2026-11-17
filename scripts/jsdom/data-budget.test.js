/* Budżet danych — pilnuje, żeby strona nie zjadała egressu Supabase.
 *
 * Tło (17.11.2026): panel Supabase pokazał 4,02 / 5 GB egressu na darmowym
 * planie, a baza zajmowała 55 MB. Winna była pętla obecności:
 *   heartbeat → UPDATE page_presence → Realtime rozsyła wiersz do kart →
 *   każda karta bije kolejny heartbeat → …
 * Plus kilka harmonogramów, które odpytywały bazę częściej, niż to potrzebne.
 *
 * Ten test zamraża nowe, oszczędne wartości. Zmieniasz interwał — zmień go
 * świadomie i policz, ile żądań na godzinę to daje.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log("  ✔ " + name);
  } catch (e) {
    failures++;
    console.log("  ✘ " + name + "  [" + e.message + "]");
  }
};
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

const TRACKER = read("js/view-tracker.js");
const NOTIFY = read("js/rejchat-notifications.js");
const REACTIONS = read("js/rejchat-reactions.js");
const COMMUNITY = read("js/community.js");
const ISLAND = read("rejhub2/hub/island.js");
const ADMIN = read("js/admin-panel.js");
const SQL = read("supabase/2026-11-17_presence_budget.sql");
const PRIVATE = read("js/rejchat-private.js");

console.log("\n=== A. PĘTLA OBECNOŚCI (największy wyciek) ===");
check("klient nie subskrybuje już page_presence", () => {
  const sub = /postgres_changes:\s*\[([\s\S]*?)\]\s*\n\s*\}/.exec(TRACKER);
  ok(sub, "nie znaleziono konfiguracji subskrypcji");
  ok(!/table:\s*"page_presence"/.test(sub[1]), "page_presence nadal w subskrypcji Realtime");
});
check("Realtime nadal dostaje liczniki page_views", () => {
  ok(/table:\s*"page_views"/.test(TRACKER), "brak subskrypcji page_views");
});
check("migracja throttle istnieje i tłumi zapisy < 20 s", () => {
  ok(/create trigger page_presence_throttle/i.test(SQL), "brak triggera");
  ok(/interval '20 seconds'/.test(SQL), "brak progu 20 s");
  ok(/return null/.test(SQL), "trigger nie pomija zapisu");
});

console.log("\n=== B. HARMONOGRAMY STRONY ===");
check("obecność co 60 s (było 25 s)", () => {
  ok(/PRESENCE_EVERY_MS\s*=\s*60000/.test(TRACKER), "zła stała");
  ok(/every\("presence", PRESENCE_EVERY_MS/.test(TRACKER), "harmonogram nie używa stałej");
  ok(!/"presence",\s*25000/.test(TRACKER), "został stary interwał 25 s");
});
check("liczniki co 3 min (było 45 s)", () => {
  ok(/COUNTERS_EVERY_MS\s*=\s*180000/.test(TRACKER), "zła stała");
  ok(!/"view-counters",\s*45000/.test(TRACKER), "został stary interwał 45 s");
});
check("zapomniana karta przestaje pingować po 20 min", () => {
  ok(/IDLE_STOP_MS\s*=\s*20 \* 60 \* 1000/.test(TRACKER), "brak progu bezczynności");
  ok(/idleTooLong\(action\)/.test(TRACKER), "brak sprawdzenia bezczynności w heartbeacie");
});
check("total_online nie jest pobierane drugi raz przy każdym powrocie do karty", () => {
  const calls = (TRACKER.match(/fetchTotalOnline\(\);/g) || []).length;
  ok(calls === 1, "wywołań fetchTotalOnline(): " + calls);
});
check("powrót do karty nie odświeża liczników częściej niż co 30 s", () => {
  ok(/lastCountsFetch > 30000/.test(TRACKER), "brak progu 30 s");
});
check("miniatura karty (iframe) nie odpytuje Supabase", () => {
  const init = TRACKER.slice(TRACKER.indexOf("function init()"), TRACKER.indexOf("window.RejsonViews = {"));
  ok(init, "nie znaleziono init()");
  ok(/\n      fetchAllCounts\(\)\.then/.test(init), "fetchAllCounts poza bramką miniatury");
  ok(!/\n    fetchAllCounts\(\)\.then/.test(init), "fetchAllCounts wywołane bez bramki");
  ok(/fetchDailySiteVisitors\(\);/.test(init), "brak licznika odwiedzin dziennych");
  ok(!/\n    fetchDailySiteVisitors\(\);/.test(init), "fetchDailySiteVisitors poza bramką");
});

console.log("\n=== C. REJCHAT I PANEL ===");
check("pełne przeładowanie czatu co ~54 s (było ~22 s)", () => {
  ok(/chatTickCount % 12 === 1/.test(COMMUNITY), "brak nowego cyklu");
});
check("lista online co 60 s", () => {
  ok(/every\("rejchat-online", 60000/.test(COMMUNITY), "zły interwał");
});
check("reakcje co 12 s", () => {
  ok(/'rejchat-reactions',12000/.test(REACTIONS), "zły interwał");
});
check("dzwonek powiadomień co 30 s (5 RPC zamiast 12 s)", () => {
  ok(/'rejchat-bell',30000/.test(NOTIFY), "zły interwał");
});
check("wyspa sprawdza kropkę czatu co 2 min", () => {
  const at = ISLAND.indexOf("chatIdlePoll = setInterval");
  ok(at !== -1 && /}, 120000\);/.test(ISLAND.slice(at, at + 400)), "zły interwał wyspy");
});
check("prywatne rozmowy: cały wątek tylko przy zmianie skrzynki (max co ~40 s)", () => {
  ok(/'rejchat-dm',8000/.test(PRIVATE), "zły interwał skrzynki");
  ok(/dmTicks%5===0/.test(PRIVATE), "brak ograniczenia pełnego odświeżania wątku");
  ok(/refreshInbox\(\)\.then\(function\(changed\)/.test(PRIVATE), "skrzynka nie zwraca zmiany");
});
check("panel admina odświeża się co 15 s, ciężkie dane co 60 s", () => {
  ok(/REFRESH_MS\s*=\s*15000/.test(ADMIN), "zły REFRESH_MS");
  ok(/SLOW_CYCLE_DIV\s*=\s*4/.test(ADMIN), "zły SLOW_CYCLE_DIV");
});

console.log("\n=== D. WERSJE W STRONACH ===");
const INDEX = read("rejhub2/index.html");
const REJCHAT = read("rejhub2/rejchat.html");
const ADMIN_HTML = read("rejhub2/admin.html");
check("index: view-tracker v13 + powiadomienia v8", () => {
  ok(INDEX.indexOf("view-tracker.js?v=13") !== -1, "brak tracker v13");
  ok(INDEX.indexOf("rejchat-notifications.js?v=8") !== -1, "brak powiadomień v8");
});
check("rejchat: community z nową wersją, reakcje v7, prywatne v14", () => {
  ok(REJCHAT.indexOf("community.js?v=2026-11-17-csp") !== -1, "brak community");
  ok(REJCHAT.indexOf("rejchat-reactions.js?v=7") !== -1, "brak reakcji v7");
  ok(REJCHAT.indexOf("rejchat-private.js?v=14") !== -1, "brak prywatnych v14");
});
check("admin: panel i tracker z nowymi wersjami", () => {
  ok(ADMIN_HTML.indexOf("admin-panel.js?v=2026-11-17-budget") !== -1, "brak panelu");
  ok(ADMIN_HTML.indexOf("view-tracker.js?v=13") !== -1, "brak trackera v13");
});

console.log(failures ? "\nWYNIK: " + failures + " błędów ✘" : "\nWYNIK: wszystko ✔");
process.exit(failures ? 1 : 0);
