/* Test bramki hosta dla głównego service workera (`/sw.js`).
 *
 * Powód: `/sw.js` (tracker projektów) leży wyłącznie na GitHub Pages.
 * Wcześniej `loader.js`, `travel.js` i `view-tracker.js` rejestrowały go
 * bez sprawdzenia hosta, więc na rejhub.vercel.app kończyło się to:
 *   • 404 przy każdej próbie (raport w panelu błędów),
 *   • wypchnięciem `/push-sw.js` (powiadomienia + cache powłoki RejHuba),
 *   • nawet 8 s czekania loadera na workera, którego nie ma.
 *
 * Ten test pilnuje, że bramka istnieje i przepuszcza tylko GitHub Pages
 * (oraz lokalny development).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

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

/* Wyciągamy samą funkcję z pliku i uruchamiamy z podstawionym `location`,
   żeby sprawdzić zachowanie, a nie tylko obecność napisu. */
function gateFrom(file) {
  const src = read(file);
  const m = /function globalWorkerAllowed\(\) \{[\s\S]*?\n  \}/.exec(src);
  assert(m, "brak funkcji globalWorkerAllowed w " + file);
  return new Function("location", "return (" + m[0] + ")();");
}

function allowedFor(file, hostname, protocol) {
  const gate = gateFrom(file);
  return gate({
    hostname: hostname,
    protocol: protocol || "https:",
    href: (protocol || "https:") + "//" + hostname + "/"
  });
}

console.log("\n=== A. BRAMKA HOSTA ===");
for (const file of ["js/loader.js", "js/view-tracker.js"]) {
  check(file + ": produkcyjny RejHub nie rejestruje /sw.js", () =>
    assert(allowedFor(file, "rejhub.vercel.app") === false, "przepuścił rejhub.vercel.app"));
  check(file + ": podgląd *.vercel.app nie rejestruje /sw.js", () =>
    assert(allowedFor(file, "rejhub-abc123-jakubelozioms-projects.vercel.app") === false, "przepuścił podgląd Vercela"));
  check(file + ": GitHub Pages rejestruje /sw.js", () =>
    assert(allowedFor(file, "rejson59.github.io") === true, "zablokował GitHub Pages"));
  check(file + ": lokalny development rejestruje /sw.js", () =>
    assert(allowedFor(file, "localhost") === true, "zablokował localhost"));
  check(file + ": http na obcym hoście nie rejestruje", () =>
    assert(allowedFor(file, "example.com", "http:") === false, "przepuścił http na obcym hoście"));
}

console.log("\n=== B. UŻYCIE PRZY REJESTRACJI ===");
check("loader.js sprawdza bramkę przed rejestracją", () => {
  const src = read("js/loader.js");
  const gateAt = src.indexOf("globalWorkerAllowed()");
  /* Wersja `?v=` zmienia się przy każdym unieważnieniu cache — test pilnuje
     samej rejestracji, nie numeru. */
  const registerAt = src.search(/navigator\.serviceWorker\.register\(\s*"\/sw\.js\?v=\d+"/);
  assert(gateAt !== -1 && registerAt !== -1, "brak bramki albo rejestracji");
  assert(gateAt < registerAt, "bramka jest po rejestracji");
  return "OK";
});
check("view-tracker.js sprawdza bramkę przed rejestracją", () => {
  const src = read("js/view-tracker.js");
  const gateAt = src.indexOf("globalWorkerAllowed()", src.indexOf("function registerGlobalServiceWorker"));
  /* Ta sama zasada: liczy się rejestracja za bramką, nie numer cache. */
  const registerAt = src.search(/register\(\s*"\/sw\.js\?v=\d+"/);
  assert(gateAt !== -1 && registerAt !== -1, "brak bramki albo rejestracji");
  assert(gateAt < registerAt, "bramka jest po rejestracji");
  return "OK";
});
check("travel.js nie rejestruje /sw.js na Vercelu", () => {
  const src = read("js/travel.js");
  assert(/globalWorkerAllowed/.test(src), "brak bramki w travel.js");
  return "OK";
});

console.log("\n=== C. WERSJE SKRYPTÓW W STRONACH ===");
/* Bramka bez nowego `?v=` nie dotrze do przeglądarek z cache. */
for (const [file, needle] of [
  ["rejhub2/index.html", 'js/loader.js?v=23'],
  ["rejhub2/rejchat.html", 'js/loader.js?v=22'],
  ["rejhub2/index.html", 'js/view-tracker.js?v=13'],
  ["rejhub2/admin.html", 'js/view-tracker.js?v=13'],
  ["rejhub2/rejchat.html", 'js/view-tracker.js?v=13']
]) {
  check(file + " → " + needle, () => {
    assert(read(file).indexOf(needle) !== -1, "brak " + needle);
    return "OK";
  });
}

console.log(failures ? "\nWYNIK: " + (failures) + " błędów ✘" : "\nWYNIK: wszystko ✔");
process.exit(failures ? 1 : 0);
