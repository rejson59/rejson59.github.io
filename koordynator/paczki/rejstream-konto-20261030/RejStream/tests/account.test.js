// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { createAccountStore } from "../account.js";
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});
function setup() {
  const rows = new Map([
    ["a", []],
    ["b", []],
  ]);
  const request = vi.fn(async (name, p) => {
    if (name === "community_whoami")
      return { username: rows.has(p.p_token) ? p.p_token : null };
    if (name === "community_login")
      return { token: p.p_username, username: p.p_username };
    if (!rows.has(p.p_token)) throw Error("Invalid session");
    if (name === "rejstream_read") return rows.get(p.p_token);
    if (name === "rejstream_write") {
      rows.set(p.p_token, [
        ...rows
          .get(p.p_token)
          .filter((r) => r.kind !== p.p_kind || r.key !== p.p_key),
        ...(p.p_payload === null
          ? []
          : [{ kind: p.p_kind, key: p.p_key, payload: p.p_payload }]),
      ]);
    }
  });
  return { store: createAccountStore(request, localStorage), request, rows };
}
it("does not read/write guest history, deletes legacy data without uploading", async () => {
  const { store, request } = setup();
  localStorage.setItem("rej-playback-v1", '{"secret":1}');
  await store.init();
  store.storage().setItem("rej-playback-v1", '{"x":1}');
  await store.flush();
  expect(store.storage().getItem("rej-playback-v1")).toBeNull();
  expect(localStorage.getItem("rej-playback-v1")).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
it("validates shared community session before loading cloud library", async () => {
  const { store, request } = setup();
  localStorage.setItem(
    "rejson_community_session_v1",
    JSON.stringify({ token: "a", username: "forged" }),
  );
  await store.init();
  expect(store.state().username).toBe("a");
  expect(request.mock.calls.map((c) => c[0])).toEqual([
    "community_whoami",
    "rejstream_read",
  ]);
});
it("syncs history and favorites to account without persisting them in the browser", async () => {
  const { store, rows } = setup();
  await store.login("a", "1234");
  const adapter = store.storage();
  adapter.setItem(
    "rej-playback-v1",
    JSON.stringify({
      video: { position: 83.75, duration: 100, seconds: 12, updated: 1 },
    }),
  );
  adapter.setItem("rej-favorites", '["drones"]');
  await store.flush();
  expect(rows.get("a")).toHaveLength(2);
  expect(localStorage.getItem("rej-playback-v1")).toBeNull();
  expect(localStorage.getItem("rej-favorites")).toBeNull();
  expect(localStorage.getItem("rejson_community_session_v1")).not.toContain(
    "1234",
  );
  await store.restore({ token: "a" });
  expect(
    JSON.parse(store.storage().getItem("rej-playback-v1")).video.position,
  ).toBe(83.75);
});
it("never writes a stale player into another account and clears data on logout", async () => {
  const { store, rows } = setup();
  await store.login("a", "1234");
  const old = store.storage();
  await store.login("b", "1234");
  old.setItem("rej-favorites", '["circus"]');
  await store.flush();
  expect(rows.get("b")).toEqual([]);
  await store.logout();
  expect(store.state().username).toBeNull();
  expect(store.storage().getItem("rej-favorites")).toBeNull();
});
it("rejects invalid sessions and ignores late hydration after logout", async () => {
  const { store } = setup();
  await store.restore({ token: "invalid" });
  expect(store.state().username).toBeNull();
  const pending = store.restore({ token: "a" });
  await store.restore(null);
  await pending;
  expect(store.state().username).toBeNull();
});
it("reports failed synchronization, retains queue only in memory and retries", async () => {
  const { store, request, rows } = setup();
  await store.login("a", "1234");
  store.storage().setItem("rej-favorites", '["drones"]');
  request.mockRejectedValueOnce(Error("offline"));
  await store.flush();
  expect(store.state().error).toContain("Nie zapisano");
  expect(localStorage.getItem("rej-favorites")).toBeNull();
  await store.flush();
  expect(store.state().error).toBe("");
  expect(rows.get("a")[0].key).toBe("drones");
});

it("retries temporary failures automatically without a new playback sample", async () => {
  vi.useFakeTimers();
  const { store, request, rows } = setup();
  await store.login("a", "1234");
  store.storage().setItem("rej-favorites", '["drones"]');
  request.mockRejectedValueOnce(new TypeError("Network error"));
  await store.flush();
  expect(store.state().error).toContain("automatycznie");
  await vi.advanceTimersByTimeAsync(10000);
  expect(rows.get("a")[0].key).toBe("drones");
  expect(store.state().error).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

it("does not hammer rejected sessions with automatic requests", async () => {
  vi.useFakeTimers();
  const { store, request } = setup();
  await store.login("a", "1234");
  store.storage().setItem("rej-favorites", '["drones"]');
  request.mockRejectedValueOnce(
    Object.assign(new Error("Sesja wygasła"), { status: 400, code: "P0001" }),
  );
  await store.flush();
  expect(store.state().error).toContain("Zaloguj się ponownie");
  const count = request.mock.calls.length;
  store.storage().setItem("rej-favorites", '["circus"]');
  await vi.advanceTimersByTimeAsync(120000);
  expect(request).toHaveBeenCalledTimes(count);
  await store.flush(); // Explicit retry is still available.
  expect(store.state().error).toBe("");
});

it("concurrent flushes wait for the same request instead of starting duplicate writes", async () => {
  const { store, request } = setup();
  await store.login("a", "1234");
  store.storage().setItem("rej-favorites", '["drones"]');
  let finish;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = store.flush(),
    second = store.flush();
  expect(second).toBe(first);
  finish();
  await second;
  expect(
    request.mock.calls.filter((c) => c[0] === "rejstream_write"),
  ).toHaveLength(1);
});

it("passes both legacy PINs and password secrets through the same login RPC", async () => {
  const { store, request } = setup();
  await store.login("a", "1234");
  await store.login("b", "Trudne hasło 2026!");
  expect(request).toHaveBeenCalledWith("community_login", { p_username: "a", p_pin: "1234" });
  expect(request).toHaveBeenCalledWith("community_login", { p_username: "b", p_pin: "Trudne hasło 2026!" });
  expect(localStorage.getItem("rejson_community_session_v1")).not.toContain("Trudne hasło");
});

it("registers through the shared account RPC and hydrates the library", async () => {
  const request = vi.fn(async (name, params) => {
    if (name === "community_register") return { token: "new-token", username: params.p_username };
    if (name === "community_whoami") return { username: "Nowy" };
    if (name === "rejstream_read") return [];
  });
  const store = createAccountStore(request, localStorage);
  const listener = vi.fn();
  window.addEventListener("rj:session-change", listener);
  await store.register("Nowy", "moje bezpieczne hasło");
  expect(request).toHaveBeenCalledWith("community_register", { p_username: "Nowy", p_pin: "moje bezpieczne hasło" });
  expect(store.state().username).toBe("Nowy");
  expect(localStorage.getItem("rejson_community_session_v1")).not.toContain("moje bezpieczne hasło");
  expect(listener).toHaveBeenCalledTimes(1);
  await store.logout();
  expect(listener).toHaveBeenCalledTimes(2);
  window.removeEventListener("rj:session-change", listener);
});

it("reports a created account separately when library hydration fails", async () => {
  const request = vi.fn(async (name) => {
    if (name === "community_register") return { token: "new-token", username: "Nowy" };
    throw Error("offline");
  });
  const store = createAccountStore(request, localStorage);
  await expect(store.register("Nowy", "moje bezpieczne hasło")).rejects.toThrow("Konto utworzono");
});
