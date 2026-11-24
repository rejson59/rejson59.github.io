/* Test tożsamości właściciela (runda 23, jsdom + statyczna analiza).
 *
 * Powód: konto `rejson-59` założone 19.11 dostawało koronę „👑 Właściciel”,
 * przyciski przypinania i usuwania cudzych wiadomości — tylko dlatego, że
 * klient porównywał nazwę z „rejson59”. W bazie konto nie miało żadnych
 * uprawnień, ale UI wierzyło nazwie. Ten test pilnuje, żeby o odznace
 * decydowała wyłącznie flaga `is_owner` z serwera.
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
    const detail = fn();
    console.log("  ✔ " + name + (detail ? "  [" + detail + "]" : ""));
  } catch (e) {
    failures++;
    console.log("  ✘ " + name + "  [" + e.message + "]");
  }
};

const community = read("js/community.js");
const premium = read("js/premium.js");
const admin = read("js/admin-panel.js");
const sql = read("supabase/2026-11-24_owner_identity_and_impersonation.sql");

/* ---------------------------------------------------------------- A. Kod --- */
check("community.js nie porównuje nazwy z „rejson59”", () => {
  const bad = /(?:toLowerCase\(\)\s*===\s*["']rejson59["'])/i.test(community);
  assert.equal(bad, false, "znalazłem porównanie nazwy z rejson59");
  return "brak porównań nazwy";
});

check("premium.js nie zgaduje właściciela po nazwie", () => {
  assert.equal(/toLowerCase\(\)\s*===\s*["']rejson59["']/i.test(premium), false);
  assert.match(premium, /u\.is_owner === true/, "brak sprawdzenia flagi is_owner");
  return "flaga z bazy";
});

check("admin-panel.js nie zgaduje właściciela po nazwie", () => {
  assert.equal(/String\(name\)\.toLowerCase\(\)\s*===\s*["']rejson59["']/i.test(admin), false);
  assert.match(admin, /u\.is_owner === true/, "brak sprawdzenia flagi is_owner");
  return "flaga z bazy";
});

check("isOwnerName przyjmuje wyłącznie flagę z bazy", () => {
  assert.match(community, /function isOwnerName\(flagFromDb\)\s*\{\s*return flagFromDb === true;\s*\}/);
  return "sygnatura bez nazwy";
});

check("sesja przechowuje is_owner obok tokena", () => {
  assert.match(community, /is_owner: parsed\.is_owner === true/, "loadSession nie czyta flagi");
  assert.match(community, /is_owner: s\.is_owner === true/, "saveSession nie zapisuje flagi");
  assert.match(community, /is_owner: data\.is_owner === true/, "logowanie nie zapisuje flagi");
  return "token + flaga";
});

/* --------------------------------------------------------- B. Zachowanie --- */
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://rejhub.vercel.app/rejchat",
    runScripts: "outside-only"
  });
  const w = dom.window;

  /* Wydzielamy funkcję odznaki z prawdziwego pliku i uruchamiamy w jsdom. */
  const src = community.match(/function isOwnerName\([\s\S]*?\n  \}/)[0];
  w.eval(src);
  const ownerBadge = community.match(/function ownerBadgeHTML\([\s\S]*?\n  \}/)[0];
  w.eval(ownerBadge);

  check("nazwa „rejson59” bez flagi NIE daje korony", () => {
    assert.equal(w.ownerBadgeHTML(false), "");
    assert.equal(w.ownerBadgeHTML(undefined), "");
    return "brak odznaki";
  });

  check("prawdziwy właściciel (flaga true) DOSTAJE koronę", () => {
    const html = w.ownerBadgeHTML(true);
    assert.match(html, /👑 Właściciel/);
    assert.match(html, /comm-owner-badge/);
    return "korona tylko z flagą";
  });

  check("nazwa „rejson-59” z flagą true to już prawdziwy właściciel", () => {
    /* Flaga pochodzi z `community_users.is_owner`, więc jeśli jest true,
       to konto naprawdę jest właścicielSKIE — nazwa nie ma znaczenia. */
    assert.match(w.ownerBadgeHTML(true), /Właściciel/);
    return "decyduje baza";
  });

  dom.window.close();
}

/* ---------------------------------------------------------- C. Migracja --- */
check("migracja rezerwuje nazwy i dodaje is_owner do logowania", () => {
  assert.match(sql, /rejchat_nickname_reserved/);
  assert.match(sql, /position\('rejson' in compact\)/);
  assert.match(sql, /position\('rejhub' in compact\)/);
  assert.match(sql, /''is_owner''/);
  assert.match(sql, /rejchat_nickname_reserved\(n\)/);
  return "rezerwa + flaga w loginie";
});

check("rezerwacja nie blokuje prawdziwego panelu właściciela", () => {
  assert.match(sql, /is_widget_admin\(\)/, "brak wyjątku dla panelu");
  return "wyjątek przez is_widget_admin";
});

check("migracja zamyka funkcje wpisów i komentarzy dla anon", () => {
  for (const fn of [
    "community_create_post(text, text, jsonb, text[])",
    "community_add_comment(text, uuid, text, uuid)",
    "community_list_comments(uuid)",
    "community_toggle_post_like(text, uuid)"
  ]) {
    assert.match(sql, new RegExp("revoke all on function public\\." + fn.replace(/[()[\]]/g, "\\$&")), "brak revoke dla " + fn);
  }
  return "wpisy i komentarze zamknięte";
});

check("migracja usuwa konto-impostora i puste konta", () => {
  assert.match(sql, /username_lower = 'rejson-59'/);
  assert.match(sql, /dhshshsh/);
  assert.match(sql, /community_posts po where po\.author_id = u\.id/, "zły klucz dla wpisów");
  return "sprzątanie z warunkami";
});

console.log(failures ? "\nWYNIK: " + failures + " błędów ✘" : "\nWYNIK: wszystko ✔");
process.exit(failures ? 1 : 0);
