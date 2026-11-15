/* Test filtrów szumu w `js/error-reporter.js` (jsdom, zachowanie).
 *
 * Panel błędów zbierał setki wpisów, które nie były usterkami RejHuba:
 *   • piki obecności (heartbeat_page_presence, page_views, liczniki online)
 *     przerywane przy ukryciu karty → „Zerwane połączenie” i HTTP 500,
 *   • limit API GitHuba (403/429) → strona ma przecież własny cache.
 *
 * Ten test sprawdza, że takie zdarzenia NIE trafiają do RPC
 * `submit_error_report`, a prawdziwa awaria (np. 500 z RejChatu) nadal trafia.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "js", "error-reporter.js"), "utf8");

let failures = 0;
const check = (name, fn) => {
  try {
    const detail = fn();
    console.log("  ✔ " + name + (detail ? "  [" + detail + "]" : ""));
  } catch (e) {
    failures++;
    console.log("  ✘ " + name + "  [" + e.message + "]");
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const tick = () => new Promise((r) => setTimeout(r, 25));

/* `reply(url)` decyduje, co zwraca każde żądanie poza raportem. */
function harness(reply) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://rejhub.vercel.app/",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const w = dom.window;
  const reports = [];
  w.fetch = function (input) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf("submit_error_report") !== -1) {
      reports.push(url);
      return Promise.resolve({ ok: true, status: 201 });
    }
    return reply(url);
  };
  w.eval(SOURCE); /* opakowuje powyższy fetch */
  return { w, reports };
}

const SUPABASE = "https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/";

(async () => {
  console.log("\n=== A. PIKI OBECNOŚCI ===");
  {
    const { w, reports } = harness(() => Promise.reject(new TypeError("Failed to fetch")));
    await w.fetch(SUPABASE + "heartbeat_page_presence", { method: "POST" }).catch(() => {});
    await tick();
    check("zerwany heartbeat nie trafia do panelu", () => assert(reports.length === 0, "wysłano " + reports.length));
  }
  {
    const { w, reports } = harness(() => Promise.resolve({ ok: false, status: 500 }));
    await w.fetch(SUPABASE + "page_views", { method: "POST" });
    await tick();
    check("HTTP 500 z page_views nie trafia do panelu", () => assert(reports.length === 0, "wysłano " + reports.length));
  }
  {
    const { w, reports } = harness(() => Promise.resolve({ ok: false, status: 500 }));
    await w.fetch(SUPABASE + "count_total_online", { method: "POST" });
    await tick();
    check("HTTP 500 z licznika online nie trafia do panelu", () => assert(reports.length === 0, "wysłano " + reports.length));
  }

  console.log("\n=== B. API GITHUBA ===");
  {
    const { w, reports } = harness(() => Promise.resolve({ ok: false, status: 403 }));
    await w.fetch("https://api.github.com/users/rejson59/repos?per_page=100");
    await tick();
    check("403 z API GitHuba nie trafia do panelu", () => assert(reports.length === 0, "wysłano " + reports.length));
  }
  {
    const { w, reports } = harness(() => Promise.reject(new TypeError("Failed to fetch")));
    await w.fetch("https://api.github.com/users/rejson59/repos?per_page=100").catch(() => {});
    await tick();
    check("zerwane API GitHuba nie trafia do panelu", () => assert(reports.length === 0, "wysłano " + reports.length));
  }

  console.log("\n=== C. PRAWDZIWA AWARIA NADAL RAPORTOWANA ===");
  {
    const { w, reports } = harness(() => Promise.resolve({ ok: false, status: 500 }));
    await w.fetch(SUPABASE + "rejchat_room_list_v3", { method: "POST" });
    await tick();
    check("HTTP 500 z RPC RejChatu trafia do panelu", () => assert(reports.length === 1, "wysłano " + reports.length));
  }
  {
    const { w, reports } = harness(() => Promise.reject(new TypeError("Failed to fetch")));
    await w.fetch("https://rejhub.vercel.app/js/app.js?v=1").catch(() => {});
    await tick();
    check("zerwany skrypt strony trafia do panelu", () => assert(reports.length === 1, "wysłano " + reports.length));
  }

  console.log(failures ? "\nWYNIK: " + failures + " błędów ✘" : "\nWYNIK: wszystko ✔");
  process.exit(failures ? 1 : 0);
})();
