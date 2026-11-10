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
    response.setHeader("Set-Cookie", sessionCookie("", 0));
    return response.status(200).json({ ok: true });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, DELETE");
    return response.status(405).json({ error: "method_not_allowed" });
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

  try {
    const tokenResponse = await fetch(supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!tokenResponse.ok) {
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
      return response.status(403).json({ error: "forbidden" });
    }

    response.setHeader("Set-Cookie", sessionCookie(signSession(uid, secret), MAX_AGE_SECONDS));
    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(502).json({ error: "upstream_unavailable" });
  }
}
