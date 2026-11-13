/**
 * RejHub 2.0 — wysyłka powiadomień push.
 *
 * Wywołanie: POST /api/push-send z nagłówkiem `x-push-key` równym
 * process.env.PUSH_SEND_SECRET (albo GET z ?key=... dla harmonogramu).
 *
 * Co robi:
 *  1. bierze z bazy kolejkę `push_outbox` (wpisy tworzone triggerami),
 *  2. dla każdego odbiorcy pobiera jego urządzenia (`push_subscriptions`),
 *  3. wysyła powiadomienie dwiema drogami:
 *       - `kind = 'web'` → web-push (VAPID), przeglądarka/PWA,
 *       - `kind = 'fcm'` → Firebase Cloud Messaging (aplikacja Android),
 *  4. oznacza wysłane, a martwe subskrypcje usuwa (404/410/UNREGISTERED).
 *
 * Sekrety (Vercel → Environment Variables):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
 *   PUSH_SEND_SECRET,
 *   FIREBASE_SERVICE_ACCOUNT — cały JSON konta usługi Firebase
 *     (Project settings → Service accounts → Generate new private key).
 *     Można też podać ten sam JSON w base64. Bez niego powiadomienia
 *     w aplikacji są pomijane, a Web Push działa dalej.
 */

import crypto from "node:crypto";
import webpush from "web-push";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hzbqzfimtroixnldzjeq.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BATCH = 40;
const FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects/";

/* Token dostępowy do FCM żyje godzinę. Trzymamy go między żądaniami w tej
   samej instancji funkcji, żeby nie podpisywać JWT przy każdym urządzeniu. */
let fcmCache = { token: null, expires: 0, projectId: null };

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
    ...extra
  };
}

async function rest(path, options = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: headers(options.headers || {})
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Supabase " + response.status + ": " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

/* Nagłówki i parametry czytamy niezależnie od tego, czy środowisko podaje
   zwykły obiekt Node (req.headers["x-push-key"]), obiekt Headers z metodą
   get(), czy tylko pełny adres w request.url. Bez tego krycie się kończyło
   na 401 mimo poprawnego sekretu. */
function header(request, name) {
  const headers = request.headers || {};
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const lower = name.toLowerCase();
  return String(headers[lower] || headers[name] || "");
}

function queryParam(request, name) {
  if (request.query && typeof request.query[name] === "string") return request.query[name];
  try {
    const url = new URL(request.url || "", "https://rejhub.vercel.app");
    return url.searchParams.get(name) || "";
  } catch (error) {
    return "";
  }
}

/* Sekret może pochodzić z env albo z bazy (push_auth) — oba muszą być zgodne.
   Dzięki temu zmiana klucza w panelu nie wymaga ponownego wdrożenia. */
async function authorized(request) {
  const given = header(request, "x-push-key") || queryParam(request, "key");
  if (!given) return false;

  const secret = process.env.PUSH_SEND_SECRET;
  if (secret) {
    const a = Buffer.from(given);
    const b = Buffer.from(secret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }

  const anon = process.env.SUPABASE_ANON_KEY;
  if (!anon) return false;
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/push_auth", {
      method: "POST",
      cache: "no-store",
      headers: { apikey: anon, Authorization: "Bearer " + anon, "Content-Type": "application/json" },
      body: JSON.stringify({ p_secret: given })
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch (error) {
    return false;
  }
}

/* ---------------------------------------------------------------- FCM --- */

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/* Konto usługi czytamy z env: albo surowy JSON, albo base64 (wygodniejsze
   w panelu Vercela, gdzie wielolinijkowy JSON łatwo zepsuć). */
function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text);
    if (!json.client_email || !json.private_key || !json.project_id) return null;
    return json;
  } catch (error) {
    return null;
  }
}

async function fcmAuth() {
  const account = serviceAccount();
  if (!account) return null;

  const now = Math.floor(Date.now() / 1000);
  if (fcmCache.token && fcmCache.expires - 60 > now) return fcmCache;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(header + "." + claims)
    .sign(account.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: header + "." + claims + "." + signature
    })
  });
  const data = await result.json().catch(() => null);
  if (!result.ok || !data || !data.access_token) {
    throw new Error("FCM: " + ((data && data.error_description) || result.status));
  }

  fcmCache = {
    token: data.access_token,
    expires: now + Number(data.expires_in || 3600),
    projectId: account.project_id
  };
  return fcmCache;
}

function absoluteUrl(value) {
  if (!value) return "https://rejhub.vercel.app/";
  if (/^https?:\/\//i.test(value)) return value;
  return "https://rejhub.vercel.app" + (value.startsWith("/") ? value : "/" + value);
}

/* Wiadomość dla jednego urządzenia. `click_action` prowadzi do filtra
   OPEN_REJHUB w manifeście — dotknięcie powiadomienia otwiera właściwe
   miejsce w aplikacji, a nie tylko stronę główną. */
function fcmMessage(row, token) {
  const tag = row.tag || "rejhub:" + row.id;
  return {
    token,
    notification: {
      title: row.title || "RejHub",
      body: row.body || ""
    },
    data: {
      url: absoluteUrl(row.url),
      tag
    },
    android: {
      priority: "high",
      notification: {
        channel_id: "rejhub",
        icon: "rj_notification",
        color: "#8BBDFF",
        click_action: "OPEN_REJHUB",
        tag
      }
    }
  };
}

/* Wysyła jedną wiadomość. Zwraca `expired`, gdy token jest już nieaktualny —
   wtedy usuwamy urządzenie z bazy, tak samo jak przy 404/410 w Web Push. */
async function sendFcm(token, message) {
  let auth;
  try {
    auth = await fcmAuth();
  } catch (error) {
    return { ok: false, error: String(error.message || error).slice(0, 200) };
  }
  if (!auth || !auth.token) return { ok: false, error: "brak FIREBASE_SERVICE_ACCOUNT" };

  const result = await fetch(FCM_ENDPOINT + auth.projectId + "/messages:send", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + auth.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message })
  });

  const text = await result.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = null;
  }
  if (result.ok) return { ok: true };

  const status = body && body.error && body.error.status;
  const detail = (body && body.error && body.error.message) || "";
  const expired =
    result.status === 404 ||
    status === "UNREGISTERED" ||
    status === "NOT_FOUND" ||
    /registration token/i.test(detail);

  return { ok: false, expired, error: (detail || "HTTP " + result.status).slice(0, 200) };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (!(await authorized(request))) {
    /* Sam znacznik, bez wartości: ułatwia diagnozę, nie ujawnia sekretu. */
    const received = Boolean(header(request, "x-push-key") || queryParam(request, "key"));
    return response.status(401).json({ ok: false, error: "Brak dostępu.", received });
  }
  if (!SERVICE_KEY) {
    return response.status(500).json({ ok: false, error: "Brak klucza serwera (SUPABASE_SERVICE_ROLE_KEY)." });
  }
  /* Klucze VAPID są potrzebne tylko dla przeglądarki. Aplikacja Android
     korzysta z FCM, więc brak VAPID nie może blokować całej wysyłki. */
  const hasVapid = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  if (hasVapid) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:rejson59@users.noreply.github.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }

  let sent = 0;
  let removed = 0;
  let failed = 0;

  try {
    const pending = await rest(
      "push_outbox?sent_at=is.null&attempts=lt.5&order=created_at.asc&limit=" + BATCH +
      "&select=id,user_id,title,body,url,tag,attempts"
    );

    if (!pending || !pending.length) {
      return response.status(200).json({ ok: true, sent: 0, removed: 0, failed: 0, pending: 0 });
    }

    const userIds = [...new Set(pending.map((row) => row.user_id))];
    let subscriptions;
    try {
      subscriptions = await rest(
        "push_subscriptions?user_id=in.(" + userIds.join(",") + ")&select=id,user_id,endpoint,p256dh,auth,kind"
      );
    } catch (error) {
      /* Wdrożenie kodu przed migracją 2026-11-20 — działamy po staremu. */
      subscriptions = await rest(
        "push_subscriptions?user_id=in.(" + userIds.join(",") + ")&select=id,user_id,endpoint,p256dh,auth"
      );
    }

    const byUser = new Map();
    (subscriptions || []).forEach((item) => {
      if (!byUser.has(item.user_id)) byUser.set(item.user_id, []);
      byUser.get(item.user_id).push(item);
    });

    const expired = [];

    for (const row of pending) {
      const devices = byUser.get(row.user_id) || [];
      const payload = JSON.stringify({
        title: row.title,
        body: row.body || "",
        url: row.url || "/",
        tag: row.tag || "rejhub:" + row.id
      });

      let delivered = false;
      let lastError = "";

      for (const device of devices) {
        const endpoint = String(device.endpoint || "");
        if (device.kind === "fcm" || endpoint.startsWith("fcm:")) {
          /* Aplikacja Android — Firebase Cloud Messaging. */
          const token = endpoint.replace(/^fcm:/, "");
          if (!token) {
            expired.push(device.id);
            removed += 1;
            continue;
          }
          const result = await sendFcm(token, fcmMessage(row, token));
          if (result.ok) {
            delivered = true;
            sent += 1;
          } else if (result.expired) {
            expired.push(device.id);
            removed += 1;
          } else {
            failed += 1;
            lastError = result.error || "delivery failed";
          }
          continue;
        }

        if (!hasVapid) {
          failed += 1;
          lastError = "brak kluczy VAPID";
          continue;
        }

        try {
          await webpush.sendNotification(
            { endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            payload,
            { TTL: 60 * 60 * 12, urgency: "normal" }
          );
          delivered = true;
          sent += 1;
        } catch (error) {
          const status = error && error.statusCode;
          if (status === 404 || status === 410) {
            expired.push(device.id);
            removed += 1;
          } else {
            failed += 1;
            lastError = "web push: " + status;
          }
        }
      }

      await rest("push_outbox?id=eq." + row.id, {
        method: "PATCH",
        body: JSON.stringify(
          delivered
            ? { sent_at: new Date().toISOString() }
            : {
                attempts: (row.attempts || 0) + 1,
                last_error: devices.length ? lastError || "delivery failed" : "no device"
              }
        )
      });
    }

    if (expired.length) {
      await rest("push_subscriptions?id=in.(" + expired.join(",") + ")", { method: "DELETE" });
    }

    return response.status(200).json({ ok: true, sent, removed, failed, pending: pending.length });
  } catch (error) {
    return response.status(500).json({ ok: false, error: String(error && error.message).slice(0, 300) });
  }
}
