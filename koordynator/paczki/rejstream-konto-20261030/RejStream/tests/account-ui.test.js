// @vitest-environment jsdom
import { beforeAll, beforeEach, it, expect, vi } from "vitest";
import { TextEncoder } from "node:util";
const mocked = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock("../account.js", () => ({
  account: {
    state: () => ({ username: null, error: "", profiles: {} }),
    storage: () => null,
    subscribe: () => () => {}, init: async () => {}, flush: async () => {},
    login: mocked.login, register: mocked.register, loadProfile: async () => null,
  },
}));
beforeAll(async () => {
  vi.stubGlobal("TextEncoder", TextEncoder);
  document.body.innerHTML = '<div id="app"></div>';
  window.scrollTo = vi.fn();
  location.hash = "#account";
  await import("../src.js");
});
beforeEach(() => {
  mocked.login.mockReset().mockResolvedValue();
  mocked.register.mockReset().mockResolvedValue();
  document.querySelector('[data-account-mode="login"]').click();
});
function form() { return document.querySelector("#account-form"); }
function submit() { form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }

it("accepts a full password for the existing account without a numeric or four-character restriction", async () => {
  expect(form().elements.secret.getAttribute("pattern")).toBeNull();
  expect(form().elements.secret.getAttribute("inputmode")).toBeNull();
  expect(form().elements.secret.getAttribute("maxlength")).toBeNull();
  expect(form().elements.confirm.closest("label").hidden).toBe(true);
  form().elements.username.value = "Someone";
  form().elements.secret.value = "Hasło 123! xyz";
  submit();
  expect(mocked.login).toHaveBeenCalledWith("Someone", "Hasło 123! xyz");
  expect(mocked.register).not.toHaveBeenCalled();
  await Promise.resolve();
});
it("offers password registration in the project and prevents mismatched or short passwords", async () => {
  document.querySelector('[data-account-mode="register"]').click();
  expect(form().elements.confirm.closest("label").hidden).toBe(false);
  expect(form().elements.confirm.required).toBe(true);
  form().elements.username.value = "Someone";
  form().elements.secret.value = "short";
  form().elements.confirm.value = "short";
  submit();
  expect(mocked.register).not.toHaveBeenCalled();
  form().elements.secret.value = "long password";
  form().elements.confirm.value = "another password";
  submit();
  expect(mocked.register).not.toHaveBeenCalled();
  form().elements.confirm.value = "long password";
  submit();
  expect(mocked.register).toHaveBeenCalledWith("Someone", "long password");
  await Promise.resolve();
});
it("still allows a legacy four-digit PIN for login", () => {
  form().elements.username.value = "Someone";
  form().elements.secret.value = "1234";
  submit();
  expect(mocked.login).toHaveBeenCalledWith("Someone", "1234");
});
