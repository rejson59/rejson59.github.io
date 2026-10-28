/* Testy dziennika odwiedzin w panelu admina (jsdom).
 *
 * Uruchomienie:
 *   cd scripts/jsdom && npm install && node admin-days.test.js
 *
 * Po co: panel przestał pokazywać pełną trasę hop po hopie, a zamiast tego
 * mówi „kto, którego dnia, na jakich podstronach i o której wszedł”.
 * Ten test pilnuje, że ten zapis naprawdę zawiera to, co obiecano —
 * i że nie wycieka HTML ze slugów albo nicków.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const PAGE = path.join(ROOT, "admin.html");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "js", "admin-panel.js"), "utf8");
const SQL_DAYS = fs.readFileSync(path.join(ROOT, "supabase", "2026-10-28_visitor_days_rollup.sql"), "utf8");
const SQL_ADMIN = fs.readFileSync(path.join(ROOT, "supabase", "2026-10-28_admin_visitors_from_days.sql"), "utf8");

const out = [];
const check = (name, cond, detail) => {
  out.push(!!cond);
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (detail ? "  [" + detail + "]" : ""));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const DAY_LOG = [
  {
    day: "2026-10-28",
    entry_at: "2026-10-28T09:29:31+00:00",
    last_at: "2026-10-28T16:31:32+00:00",
    entries: 5,
    actions: 67,
    pages: ["admin", "spolecznosc", "RejStream"]
  },
  {
    day: "2026-10-27",
    entry_at: "2026-10-27T07:16:11+00:00",
    last_at: "2026-10-27T18:02:00+00:00",
    entries: 2,
    actions: 3,
    pages: []
  }
];

(async () => {
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => { /* offline: zasoby sieciowe nie są tu potrzebne */ });

  const dom = await JSDOM.fromFile(PAGE, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.fetch = () => Promise.reject(new Error("offline"));
    }
  });
  const w = dom.window;
  const d = w.document;
  await wait(1200);

  const api = w.__rjAdmin;
  const today = "2026-10-28";

  console.log("\n=== A. DZIENNIK: DZIEŃ PO DNIU ===");
  {
    check("panel udostępnia renderer dziennika do testów", !!api && typeof api.buildDayLogHtml === "function");
    const html = api.buildDayLogHtml(DAY_LOG, today);
    check("sekcja ma nagłówek mówiący, co zawiera", /Dzień po dniu/.test(html));

    const host = d.createElement("div");
    host.innerHTML = html;
    const rows = host.querySelectorAll(".vif-day");
    check("jest wiersz na każdy dzień", rows.length === 2, "wierszy: " + rows.length);

    const first = rows[0];
    check("dzisiejszy dzień jest wyróżniony", first.classList.contains("is-today"));
    check("widać datę z dniem tygodnia", /28\.10/.test(first.textContent), first.querySelector(".vif-day-date").textContent.trim());
    check("widać godzinę wejścia", /wszedł/.test(first.textContent));
    check("widać liczbę wejść", /🚪 5/.test(first.textContent));
    check("widać liczbę akcji", /🖱 67/.test(first.textContent));

    const chips = Array.prototype.map.call(first.querySelectorAll(".vif-day-pages .adm-proj-chip"), function (el) {
      return el.textContent;
    });
    check("podstrony są nazwane po ludzku, nie slugiem", chips.indexOf("Społeczność") !== -1 && chips.indexOf("Panel admina") !== -1, chips.join(" · "));
    check("projekt zostaje pod swoją nazwą", chips.indexOf("RejStream") !== -1, chips.join(" · "));

    const second = rows[1];
    check("dzień bez podstron mówi to wprost, zamiast być pusty", /brak zapisanych podstron/.test(second.textContent));
    check("stary dzień nie jest oznaczony jako dzisiejszy", !second.classList.contains("is-today"));
  }

  console.log("\n=== B. BEZPIECZEŃSTWO I KRANCEDY ===");
  {
    const html = api.buildDayLogHtml(
      [{ day: "2026-10-28", entry_at: "2026-10-28T09:00:00+00:00", last_at: null, entries: 1, actions: 0,
         pages: ['<img src=x onerror="alert(1)">'] }],
      today
    );
    check("slug nie może wstrzyknąć HTML", html.indexOf("<img") === -1 && html.indexOf("&lt;img") !== -1);
    check("brak danych = brak sekcji (nic nie udajemy)", api.buildDayLogHtml([], today) === "");
    check("null zamiast listy nie wywala panelu", api.buildDayLogHtml(null, today) === "");
    check("dzień bez last_at nie renderuje pustego znacznika czasu", !/⏱/.test(html));
  }

  console.log("\n=== C. STRONA I BAZA ===");
  {
    const daysSel = d.querySelector("#vif-days");
    check("panel pozwala wybrać zakres do 30 dni",
      Array.prototype.map.call(daysSel.options, function (o) { return o.value; }).join(",") === "1,3,7,14,30",
      Array.prototype.map.call(daysSel.options, function (o) { return o.value; }).join(","));
    check("domyślnie 7 dni", daysSel.querySelector("option[selected]").value === "7");

    check("profil pokazuje dziennik przed ścieżką", /kpiHtml \+ dayLogHtml \+ trailHtml/.test(PANEL_JS));
    check("akcje w profilu: 60 zamiast 30", /actions\.slice\(0, 60\)/.test(PANEL_JS));
    check("lista pokazuje dzisiejsze podstrony", /p\.today_pages/.test(PANEL_JS));
    check("etykieta mówi „wejść”, nie „przechodów”", /wejść/.test(PANEL_JS) && !/przechodów/.test(PANEL_JS));

    check("baza trzyma dziennik osób (tabela visitor_days)", /create table if not exists public\.visitor_days/.test(SQL_DAYS));
    check("dziennik ma podstrony jako listę, nie jeden wiersz na hop", /pages\s+text\[\]/.test(SQL_DAYS));
    check("trasa jest przycinana do 1 dnia", /page_trail where at < now\(\) - interval '1 day'/.test(SQL_DAYS));
    check("kliknięcia trzymane 30 dni (było 3)", /activity_events where at < now\(\) - interval '30 days'/.test(SQL_DAYS));
    check("profil czyta day_log z bazy", /'day_log', v_day_log/.test(SQL_ADMIN));
    check("zakres dni w bazie też do 30", /least\(coalesce\(p_days, 7\), 30\)/.test(SQL_ADMIN));
  }

  const passed = out.filter(Boolean).length;
  console.log("\n" + "=".repeat(56));
  console.log(passed === out.length ? `WYNIK: ${passed}/${out.length} ✔` : `WYNIK: ${passed}/${out.length} ✘`);
  process.exit(passed === out.length ? 0 : 1);
})();
