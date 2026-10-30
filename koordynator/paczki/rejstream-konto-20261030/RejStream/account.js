// Public browser key from the community site; authorization is enforced by RPC.
const URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";
const SESSION = "rejson_community_session_v1";
export async function rpc(name, params) {
  const response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    keepalive: true,
    signal: AbortSignal.timeout(12000),
  });
  // PostgreSQL RETURNS void is normally a successful empty HTTP response.
  const text = await response.text();
  let body = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      if (response.ok) throw new Error("Nieprawidłowa odpowiedź serwera.");
    }
  }
  if (!response.ok) {
    const error = new Error(
      body?.message || "Nie udało się połączyć z kontem.",
    );
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}
export function createAccountStore(
  request = rpc,
  browserStorage = (() => {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  })(),
) {
  let session = null,
    data = {},
    generation = 0,
    timer,
    error = "",
    pending = new Map(),
    activeSave = null,
    retryDelay = 5000,
    retryAllowed = true;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  const kindFor = (key) =>
    ({
      "rej-playback-v1": "progress",
      "rej-favorites": "favorite",
      "rej-watched": "watched",
    })[key];
  const profiles = {};
  const state = () => ({ username: session?.username || null, error, profiles: Object.freeze({...profiles}) });
  function flush() {
    // Callers (including logout) must wait for an already-running save.
    if (activeSave) return activeSave;
    activeSave = save().finally(() => {
      activeSave = null;
    });
    return activeSave;
  }
  async function save() {
    clearTimeout(timer);
    timer = null;
    if (!session || !pending.size) return;
    const token = session.token,
      version = generation;
    try {
      for (const [id, item] of [...pending]) {
        if (version !== generation) break;
        await request("rejstream_write", {
          p_token: token,
          p_kind: item.kind,
          p_key: item.key,
          p_payload: item.payload,
        });
        if (version === generation && pending.get(id) === item)
          pending.delete(id);
      }
      if (version === generation) {
        error = "";
        retryDelay = 5000;
        retryAllowed = true;
      }
    } catch (failure) {
      if (version === generation) {
        retryAllowed =
          !failure.status ||
          [408, 429].includes(failure.status) ||
          failure.status >= 500;
        if (retryAllowed) {
          error =
            "Nie zapisano jeszcze zmian na koncie. Ponowimy automatycznie po odzyskaniu połączenia. Nie zamykaj strony przed synchronizacją.";
          retryDelay = Math.min(retryDelay * 2, 60000);
        } else if (
          [401, 403].includes(failure.status) ||
          /sesj|zalog/i.test(failure.message)
        ) {
          error =
            "Sesja konta jest nieważna lub wygasła. Zaloguj się ponownie, aby zapisywać zmiany.";
        } else {
          error =
            "Serwer odrzucił zapis na koncie. Ponów synchronizację; jeśli problem wraca, zgłoś błąd zapisu.";
        }
      }
    } finally {
      notify();
      if (session && pending.size && retryAllowed && !timer)
        timer = setTimeout(flush, retryDelay);
    }
  }

  function storage() {
    const version = generation;
    return {
      get enabled() {
        return !!session && version === generation;
      },
      getItem(key) {
        return session && version === generation
          ? JSON.stringify(
              data[kindFor(key)] || (kindFor(key) === "progress" ? {} : []),
            )
          : null;
      },
      setItem(key, value) {
        if (!session || version !== generation) return;
        const kind = kindFor(key);
        if (!kind) return;
        const next = JSON.parse(value),
          old = data[kind] || (kind === "progress" ? {} : []);
        const before =
          kind === "progress"
            ? old
            : Object.fromEntries(old.map((k) => [k, true]));
        const after =
          kind === "progress"
            ? next
            : Object.fromEntries(next.map((k) => [k, true]));
        for (const k of new Set([
          ...Object.keys(before),
          ...Object.keys(after),
        ])) {
          if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
          pending.set(`${kind}:${k}`, {
            kind,
            key: k,
            payload: after[k] ?? null,
          });
        }
        data[kind] = next;
        if (!timer && !activeSave && retryAllowed)
          timer = setTimeout(() => {
            timer = null;
            flush();
          }, 5000);
      },
    };
  }
  async function restore(candidate) {
    const version = ++generation;
    session = null;
    data = {};
    pending.clear();
    clearTimeout(timer);
    timer = null;
    error = "";
    retryDelay = 5000;
    retryAllowed = true;
    notify();
    if (!candidate?.token) return;
    try {
      const identity = await request("community_whoami", {
        p_token: candidate.token,
      });
      if (!identity?.username)
        throw new Error("Sesja wygasła. Zaloguj się ponownie.");
      const rows = await request("rejstream_read", {
        p_token: candidate.token,
      });
      if (version !== generation) return;
      data = { progress: {}, favorite: [], watched: [] };
      for (const row of rows) {
        if (row.kind === "progress") data.progress[row.key] = row.payload;
        else if (
          ["favorite", "watched"].includes(row.kind) &&
          row.payload === true
        )
          data[row.kind].push(row.key);
      }
      session = { token: candidate.token, username: identity.username };
    } catch (e) {
      if (version === generation) error = e.message;
    }
    if (version === generation) notify();
  }
  async function authenticate(method, username, secret) {
    // RPC retains the p_pin name for compatibility; it also accepts passwords.
    const result = await request(method, { p_username: username, p_pin: secret });
    await restore(result);
    if (!session) {
      throw new Error(method === "community_register"
        ? "Konto utworzono, ale nie udało się wczytać danych. Spróbuj się zalogować."
        : error || "Nie udało się wczytać konta.");
    }
    try {
      browserStorage?.setItem(SESSION, JSON.stringify(session));
      if (browserStorage && typeof window !== "undefined")
        window.dispatchEvent(new Event("rj:session-change"));
    } catch {}
  }
  return {
    state,
    storage,
    flush,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async init() {
      // Deliberately delete legacy guest history, not silently upload it.
      try {
        for (const k of [
          "rej-playback-v1",
          "rej-favorites",
          "rej-watched",
          "rej-recent",
          "rej-saved",
        ])
          browserStorage?.removeItem(k);
      } catch {}
      let stored;
      try {
        stored = JSON.parse(browserStorage?.getItem(SESSION) || "null");
      } catch {}
      await restore(stored);
    },
    async login(username, secret) {
      return authenticate("community_login", username, secret);
    },
    async register(username, password) {
      return authenticate("community_register", username, password);
    },
    async logout() {
      await flush();
      try {
        browserStorage?.removeItem(SESSION);
        if (browserStorage && typeof window !== "undefined")
          window.dispatchEvent(new Event("rj:session-change"));
      } catch {}
      await restore(null);
    },
    restore,
    async loadProfile(username) {
      if (!username) return null;
      const key = username.toLowerCase();
      const cached = profiles[key];
      if (cached) return cached;
      try {
        const result = await request("rejchat_get_profiles", {
          p_names: [username],
        });
        if (Array.isArray(result) && result.length > 0) {
          const row = result.find((item) => typeof item?.username === "string" && item.username.toLowerCase() === key);
          if (!row) return null;
          const avatars = ["comet", "planet", "cat", "fox", "leaf", "cloud", "heart", "spark"];
          const colors = ["mint", "blue", "violet", "rose", "amber", "slate"];
          const profile = {
            username: row.username,
            avatar: avatars.includes(row.avatar) ? row.avatar : "comet",
            color: colors.includes(row.color) ? row.color : "mint",
          };
          profiles[key] = profile;
          notify();
          return profile;
        }
      } catch (e) {
        console.warn("Nie udało się pobrać profilu:", e.message);
      }
      return null;
    },
  };
}
export const account = createAccountStore();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SESSION) {
      let s;
      try {
        s = JSON.parse(e.newValue);
      } catch {}
      account.restore(s);
    }
  });
  window.addEventListener("pagehide", () =>
    queueMicrotask(() => account.flush()),
  );
  window.addEventListener("online", () => account.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") account.flush();
  });
}
