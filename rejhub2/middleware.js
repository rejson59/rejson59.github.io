/**
 * RejHub 2.0 — serwerowa brama administratora.
 *
 * Każde żądanie (poza stroną „w budowie”, logowaniem i API sesji) jest
 * sprawdzane tutaj, na brzegu sieci Vercel. Przeglądarka gościa nigdy nie
 * otrzymuje prywatnego HTML, CSS ani JS — nie ma tu żadnego ukrywania w DOM.
 *
 * Ciasteczko `rejhub_admin` jest podpisane HMAC-SHA256 kluczem
 * REJHUB_SESSION_SECRET. Bez ważnego podpisu nie da się go podrobić.
 */

export const config = {
  matcher: "/((?!_vercel|_next).*)"
};

const COOKIE_NAME = "rejhub_admin";
const PUBLIC_PATHS = new Set([
  "/w-budowie",
  "/w-budowie.html",
  "/login",
  "/login.html",
  "/favicon.ico",
  "/favicon.svg",
  "/robots.txt",
  /* Licencja i nota dla agentów AI muszą być publiczne — inaczej nikt
     (także wyszukiwarki i asystenci) nie przeczyta zasad korzystania. */
  "/licencja",
  "/licencja.html",
  "/LICENSE",
  "/ai.txt",
  "/humans.txt",
  "/NOTICE",
  "/AI-POLICY.md"
]);
const PUBLIC_PREFIXES = ["/api/session"];
/* Zasoby statyczne nie zawierają prywatnych treści — puszczamy je bez sesji,
   żeby brama nigdy nie odpowiadała HTML-em na żądanie CSS/JS/obrazka
   (inaczej strona „w budowie” i logowanie gubiłyby swoje pliki). */
const PUBLIC_EXTENSIONS = /\.(css|js|mjs|json|map|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|txt|xml|webmanifest)$/i;

function isPublic(pathname) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_EXTENSIONS.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
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
  if (isPublic(pathname)) return;

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

  return Response.redirect(new URL("/w-budowie", request.url), 302);
}
