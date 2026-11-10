/**
 * RejHub 2.0 — wysyłka powiadomień push.
 *
 * Wywołanie: POST /api/push-send z nagłówkiem `x-push-key` równym
 * process.env.PUSH_SEND_SECRET (albo GET z ?key=... dla harmonogramu).
 *
 * Co robi:
 *  1. bierze z bazy kolejkę `push_outbox` (wpisy tworzone triggerami),
 *  2. dla każdego odbiorcy pobiera jego urządzenia (`push_subscriptions`),
 *  3. wysyła powiadomienie przez web-push (VAPID),
 *  4. oznacza wysłane, a martwe subskrypcje (404/410) usuwa.
 *
 * Sekrety (Vercel → Environment Variables):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
 *   PUSH_SEND_SECRET
 */

import crypto from "node:crypto";
import webpush from "web-push";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hzbqzfimtroixnldzjeq.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BATCH = 40;

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
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return response.status(500).json({ ok: false, error: "Brak kluczy VAPID." });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:rejson59@users.noreply.github.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

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
    const subscriptions = await rest(
      "push_subscriptions?user_id=in.(" + userIds.join(",") + ")&select=id,user_id,endpoint,p256dh,auth"
    );

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
      for (const device of devices) {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
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
          }
        }
      }

      await rest("push_outbox?id=eq." + row.id, {
        method: "PATCH",
        body: JSON.stringify(
          delivered
            ? { sent_at: new Date().toISOString() }
            : { attempts: (row.attempts || 0) + 1, last_error: devices.length ? "delivery failed" : "no device" }
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
