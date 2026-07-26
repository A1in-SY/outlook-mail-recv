import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

/**
 * api.ts touches localStorage and window, so a DOM is stood up before importing it.
 * The real module is exercised rather than a copy because the point of these tests is
 * that the status code survives the trip from fetch() to the caller.
 */
let ApiError: typeof import("../src/lib/api.ts").ApiError;
let isAccountAuthError: typeof import("../src/lib/api.ts").isAccountAuthError;
let ACCOUNT_AUTH_STATUS: number;

before(async () => {
  const dom = new JSDOM("", { url: "https://example.test/" });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.localStorage = dom.window.localStorage;

  ({ ApiError, isAccountAuthError, ACCOUNT_AUTH_STATUS } = await import("../src/lib/api.ts"));
});

test("an account-auth failure is recognised by its status", () => {
  const error = new ApiError("账号已被微软风控标记为滥用，需要重新授权", ACCOUNT_AUTH_STATUS);

  assert.ok(isAccountAuthError(error));
  assert.equal(error.status, ACCOUNT_AUTH_STATUS);
  // The reason must survive intact -- it is the whole point of the change.
  assert.match(error.message, /重新授权/);
});

test("a transient upstream failure is not an account-auth failure", () => {
  // 502 must stay retryable-looking; conflating it with a dead account would tell the
  // user to re-authorise when a retry would have worked.
  assert.ok(!isAccountAuthError(new ApiError("Failed to fetch emails", 502)));
});

test("the auth status is not 403, which triggers a global logout", () => {
  // request() clears the token and redirects on 403. If a dead mailbox shared that
  // code, refreshing a banned account would sign the operator out of the whole app.
  assert.notEqual(ACCOUNT_AUTH_STATUS, 403);
});

test("a plain Error is not mistaken for an account-auth failure", () => {
  assert.ok(!isAccountAuthError(new Error("boom")));
  assert.ok(!isAccountAuthError(null));
  assert.ok(!isAccountAuthError("409"));
});
