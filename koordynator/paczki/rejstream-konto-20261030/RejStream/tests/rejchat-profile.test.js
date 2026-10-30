// @vitest-environment jsdom
import { it, expect, vi, afterEach, describe } from "vitest";
import { rpc, createAccountStore } from "../account.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rejchat_get_profiles RPC", () => {
  it("calls rejchat_get_profiles with username array", async () => {
    const fetcher = vi.fn(async (url, options) => {
      if (url.endsWith("rejchat_get_profiles")) {
        const body = JSON.parse(options.body);
        expect(body.p_names).toEqual(["testuser"]);
        return new Response(
          JSON.stringify([{ username: "testuser", avatar: "cat", color: "rose" }]),
          { status: 200 }
        );
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetcher);
    const store = createAccountStore(rpc, null);
    const profile = await store.loadProfile("testuser");
    expect(profile).toEqual({ username: "testuser", avatar: "cat", color: "rose" });
  });

  it("returns null when profile not found", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(JSON.stringify([]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const store = createAccountStore(rpc, null);
    const profile = await store.loadProfile("nonexistent");
    expect(profile).toBeNull();
  });

  it("caches profile after first load", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify([{ username: "testuser", avatar: "cat", color: "rose" }]),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const store = createAccountStore(rpc, null);
    await store.loadProfile("testuser");
    await store.loadProfile("testuser");
    // Should only call once due to caching
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("rejchat_get_profiles"))).toHaveLength(1);
  });

  it("does not expose token in URL parameters", async () => {
    const fetcher = vi.fn(async (url) => {
      expect(url).not.toContain("token=");
      expect(url).not.toContain("p_token");
      return new Response(JSON.stringify([]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const store = createAccountStore(rpc, null);
    await store.restore({ token: "secret-token" });
    await store.loadProfile("testuser");
    expect(fetcher.mock.calls.some(([url]) => url.includes("secret-token"))).toBe(false);
  });

  it("handles RPC errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async () => {
      return new Response("Server error", { status: 500 });
    });
    vi.stubGlobal("fetch", fetcher);
    const store = createAccountStore(rpc, null);
    const profile = await store.loadProfile("testuser");
    expect(profile).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("updates state with loaded profile", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify([{ username: "testuser", avatar: "cat", color: "rose" }]),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const store = createAccountStore(rpc, null);
    await store.loadProfile("testuser");
    expect(store.state().profiles["testuser"]).toEqual({
      username: "testuser",
      avatar: "cat",
      color: "rose"
    });
  });
  it("normalizes unexpected avatar and color instead of using arbitrary markup or URLs", async () => {
    const request = vi.fn(async () => [{ username: "testuser", avatar: "https://evil.invalid/x", color: "red" }]);
    const store = createAccountStore(request, null);
    await expect(store.loadProfile("testuser")).resolves.toEqual({ username: "testuser", avatar: "comet", color: "mint" });
    expect(request).toHaveBeenCalledWith("rejchat_get_profiles", { p_names: ["testuser"] });
  });

});
