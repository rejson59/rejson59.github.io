/**
 * RejHub — serwerowa ochrona panelu administratora.
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
const PUBLIC_API_PREFIXES = ["/api/session", "/api/push-send"];

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
  const { pathname } = new URL(request.url);
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
