/**
 * RejHub 2.0 — logowanie administratora.
 *
 * 1. Weryfikuje e-mail i hasło w Supabase Auth (istniejące konto admina).
 * 2. Sprawdza uprawnienia przez RPC `is_widget_admin` — po stronie bazy.
 * 3. Dopiero wtedy wystawia podpisane, HttpOnly ciasteczko sesji.
 *
 * Hasło nigdy nie jest zapisywane; do przeglądarki wraca wyłącznie
 * podpisany token sesji bez danych uwierzytelniających.
 */

import crypto from "node:crypto";

const COOKIE_NAME = "rejhub_admin";
/* Ochrona przed zgadywaniem hasła: 10 nieudanych prób z jednego adresu IP
   w ciągu 10 minut blokuje kolejne próby na 10 minut. Licznik jest w pamięci
   instancji funkcji — w praktyce wystarcza, żeby odciąć proste boty, a nie
   udaje pełnego rate-limitu po stronie bazy. */
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map();

function clientIp(request) {
  const forwarded = request.headers && (request.headers["x-forwarded-for"] || request.headers["X-Forwarded-For"]);
  const first = String(forwarded || "").split(",")[0].trim();
  return first || (request.socket && request.socket.remoteAddress) || "unknown";
}

function remaining(request) {
  const key = clientIp(request);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset <= now) return { key, count: 0, retry: 0 };
  return { key, count: entry.count, retry: Math.ceil((entry.reset - now) / 1000) };
}

function noteFailure(request) {
  const key = clientIp(request);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset <= now) attempts.set(key, { count: 1, reset: now + WINDOW_MS });
  else entry.count += 1;
  if (attempts.size > 5000) {
    for (const [ip, value] of attempts) {
      if (value.reset <= now) attempts.delete(ip);
    }
  }
}

function clearFailures(request) {
  attempts.delete(clientIp(request));
}

/* Żądanie z przeglądarki ma nagłówek Origin. Jeśli podano go jawnie i nie
   zgadza się z hostem, to nie jest to formularz z naszej strony — odrzucamy
   bez dotykania Supabase (ochrona przed CSRF). */
function sameOrigin(request) {
  const origin = request.headers && request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch (error) {
    return false;
  }
}
/* Czytelna dla skryptów „podpowiedź”, że w tej przeglądarce jest sesja
   administratora. Nie chroni niczego — od tego jest podpisane, HttpOnly
   ciasteczko wyżej i brama w `middleware.js`. Służy tylko do tego, żeby
   topbar pokazywał link „Szklane studio” wyłącznie administratorowi. */
const HINT_COOKIE_NAME = "rejhub_admin_hint";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signSession(uid, secret) {
  const payload = base64Url(
    Buffer.from(JSON.stringify({ uid, exp: Date.now() + MAX_AGE_SECONDS * 1000 }), "utf8")
  );
  const signature = base64Url(crypto.createHmac("sha256", secret).update(payload).digest());
  return payload + "." + signature;
}

function hintCookie(maxAge) {
  return [
    HINT_COOKIE_NAME + "=" + (maxAge > 0 ? "1" : ""),
    "Path=/",
    "SameSite=Lax",
    "Max-Age=" + maxAge
  ].join("; ");
}

function sessionCookie(value, maxAge) {
  return [
    COOKIE_NAME + "=" + encodeURIComponent(value),
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + maxAge
  ].join("; ");
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", [sessionCookie("", 0), hintCookie(0)]);
    return response.status(200).json({ ok: true });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, DELETE");
    return response.status(405).json({ error: "method_not_allowed" });
  }

  if (!sameOrigin(request)) {
    return response.status(403).json({ error: "forbidden_origin" });
  }

  const state = remaining(request);
  if (state.count >= LIMIT) {
    response.setHeader("Retry-After", String(Math.max(1, state.retry)));
    return response.status(429).json({ error: "too_many_attempts", retry_after: Math.max(1, state.retry) });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.REJHUB_SESSION_SECRET;

  if (!supabaseUrl || !anonKey || !secret) {
    return response.status(503).json({ error: "not_configured" });
  }

  let body = request.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = {};
    }
  }
  const email = String((body && body.email) || "").trim().toLowerCase();
  const password = String((body && body.password) || "");

  if (!email || !password) {
    return response.status(400).json({ error: "missing_credentials" });
  }
  if (email.length > 254 || password.length > 200) {
    noteFailure(request);
    return response.status(400).json({ error: "invalid_credentials" });
  }

  try {
    const tokenResponse = await fetch(supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!tokenResponse.ok) {
      noteFailure(request);
      return response.status(401).json({ error: "invalid_credentials" });
    }

    const session = await tokenResponse.json();
    const accessToken = session && session.access_token;
    const uid = session && session.user && session.user.id;
    if (!accessToken || !uid) {
      return response.status(401).json({ error: "invalid_credentials" });
    }

    const adminResponse = await fetch(supabaseUrl + "/rest/v1/rpc/is_widget_admin", {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    if (!adminResponse.ok) {
      return response.status(403).json({ error: "forbidden" });
    }

    const isAdmin = await adminResponse.json();
    if (isAdmin !== true) {
      noteFailure(request);
      return response.status(403).json({ error: "forbidden" });
    }
    clearFailures(request);

    response.setHeader("Set-Cookie", [
      sessionCookie(signSession(uid, secret), MAX_AGE_SECONDS),
      hintCookie(MAX_AGE_SECONDS)
    ]);
    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(502).json({ error: "upstream_unavailable" });
  }
}
