/**
 * RejHub — serwerowa ochrona panelu administratora + tarcza przed skanerami.
 *
 * Od przeniesienia (RejHub 2.0 na rejhub.vercel.app) cały serwis jest
 * **publiczny**: strona główna, aplikacje, RejChat, licencja i logowanie
 * działają bez ciasteczka sesji. Chronione zostają wyłącznie miejsca,
 * w których mieszka logika administracyjna:
 *
 *   /admin, /panel, /studio-source, /szklane-studio oraz /api/*
 *   (poza `/api/session` i `/api/push-send`, które mają własne klucze).
 *
 * Bez podpisanego ciasteczka `rejhub_admin` te ścieżki przekierowują do
 * `/login` zamiast oddawać prywatny HTML, CSS czy JS. Ciasteczko jest
 * podpisane HMAC-SHA256 kluczem REJHUB_SESSION_SECRET — bez ważnego podpisu
 * nie da się go podrobić, a decyzja zapada na brzegu sieci Vercel.
 *
 * Tarcza (`blockedRequest`) odcina jeszcze przed originem:
 *   • skanery szukające plików konfiguracyjnych i paneli (.env, .git, wp-admin),
 *   • próby przejścia katalogów i wstrzyknięcia SQL/XSS w adresie,
 *   • żądania z metodami, których nigdy nie używamy (TRACE, PROPFIND…),
 *   • absurdalnie długie adresy (ochrona pamięci i logów).
 *
 * Wszystko jest celowo wąskie: blokujemy tylko wzorce, których strona
 * nigdy nie generuje. Fałszywe trafienie = działająca funkcja, więc każde
 * rozszerzenie listy wymaga testu w `scripts/jsdom/security-hardening.test.js`.
 */

export const config = {
  matcher: "/((?!_vercel|_next).*)"
};

const COOKIE_NAME = "rejhub_admin";

/* Ścieżki, które wymagają sesji administratora. Prefiksy, bo panel ma
   podstrony (`/admin/...`, `/panel/...`). */
const PRIVATE_PREFIXES = ["/admin", "/panel", "/studio-source", "/szklane-studio"];

/* API z własną kontrolą dostępu — brama cookie musi je przepuścić, inaczej
   harmonogram powiadomień dostawał 401, zanim żądanie dotarło do funkcji. */
const PUBLIC_API_PREFIXES = ["/api/session", "/api/push-send", "/api/apk"];

/* ---------- Tarcza: czego strona nigdy nie potrzebuje ---------- */

/* Pliki i panele, które odwiedzają wyłącznie skanery i boty podszywające się
   pod WordPressa/phpMyAdmina. `.well-known` jest wyjątkiem — tam mieszka
   assetlinks.json dla aplikacji Android. */
const BLOCKED_PATHS = [
  /^\/\.(?!well-known(\/|$))(env|git|svn|hg|ds_store|aws|ssh|docker|npmrc|htaccess|htpasswd|idea|vscode)/i,
  /^\/(wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php)/i,
  /^\/(phpmyadmin|pma|myadmin|dbadmin|adminer)/i,
  /^\/(cgi-bin|vendor\/phpunit|actuator|server-status|server-info|solr|jenkins)\b/i,
  /^\/(config\.(php|json|yml|yaml)|backup|db\.sql|dump\.sql|database\.sql|\.sql)/i,
  /\.(php|asp|aspx|jsp|cgi|env|sql|bak|old|orig|swp|swo|git)$/i
];

/* Wzorce w ścieżce i zapytaniu. Kolejność ma znaczenie tylko dla komunikatu. */
const BLOCKED_PATTERNS = [
  { re: /(\.\.[/\\]|%2e%2e(%2f|%5c)?|\x00|%00)/i, reason: "traversal" },
  {
    re: /(union[\s+]+(all[\s+]+)?select|select[\s+].{0,80}[\s+]from[\s+].{0,40}(information_schema|pg_catalog|pg_proc)|or[\s+]+1[\s+]*=[\s+]*1)/i,
    reason: "sqli"
  },
  { re: /(<\s*script|javascript\s*:|onerror\s*=|onload\s*=|<svg[\s+])/i, reason: "xss" },
  { re: /(etc\/passwd|proc\/self\/environ|\/bin\/(ba)?sh)/i, reason: "lfi" }
];

/* Metody, których serwis nie obsługuje nigdzie — nawet w API. */
const BLOCKED_METHODS = new Set(["TRACE", "TRACK", "CONNECT", "PROPFIND", "PROPPATCH", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK"]);

const MAX_URL = 2048;
const MAX_QUERY = 4096;

function decoded(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

/* Zwraca powód blokady albo `null`, gdy żądanie może lecieć dalej.
   Funkcja jest eksportowana, żeby testy mogły sprawdzić ją bez sieci. */
export function blockedRequest(method, pathname, search) {
  const upper = String(method || "GET").toUpperCase();
  if (BLOCKED_METHODS.has(upper)) return "method";

  const path = String(pathname || "/");
  const query = String(search || "");
  if (path.length > MAX_URL || query.length > MAX_QUERY) return "too-long";

  for (const rule of BLOCKED_PATHS) {
    if (rule.test(path)) return "probe";
  }

  /* Sprawdzamy także wersję po zdekodowaniu — `%2e%2e%2f` to ta sama próba. */
  const haystack = path + " " + query + " " + decoded(path) + " " + decoded(query);
  for (const rule of BLOCKED_PATTERNS) {
    if (rule.re.test(haystack)) return rule.reason;
  }
  return null;
}

/* Odpowiedź dla odrzuconego żądania. Dla /api/* JSON (żeby klient dostał
   czytelny błąd), dla reszty krótki tekst — bez ujawniania, co istnieje. */
function blockedResponse(reason, pathname) {
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const body = isApi ? JSON.stringify({ error: "blocked", reason }) : "Nie znaleziono.";
  return new Response(body, {
    status: reason === "too-long" ? 414 : reason === "method" ? 405 : 404,
    headers: {
      "content-type": isApi ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function isPrivate(pathname) {
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))) {
    return false;
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return "";
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payloadPart = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let signature;
  try {
    signature = base64UrlToBytes(signaturePart);
  } catch (error) {
    return false;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(payloadPart)
  );
  if (!valid) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
  } catch (error) {
    return false;
  }

  return Boolean(payload && payload.uid && Number(payload.exp) > Date.now());
}

export default async function middleware(request) {
  const { pathname, search } = new URL(request.url);
  const blocked = blockedRequest(request.method, pathname, search);
  if (blocked) return blockedResponse(blocked, pathname);

  if (!isPrivate(pathname)) return;

  const secret = process.env.REJHUB_SESSION_SECRET;
  const token = readCookie(request, COOKIE_NAME);
  const allowed = await verifyToken(token, secret);
  if (allowed) return;

  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  /* Zalogowanie się i powrót do żądanej strony — bez błądzenia po stronie. */
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return Response.redirect(login, 302);
}
