import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_LIST_PAGE_PARAM,
  ACCOUNT_LIST_RETURN_PAGE_PARAM,
  accountListPath,
  emailFolderPath,
  parseAccountListPage,
} from "../src/lib/account-list-navigation.ts";

test("parseAccountListPage accepts positive safe integers", () => {
  assert.equal(parseAccountListPage("1"), 1);
  assert.equal(parseAccountListPage("3"), 3);
  assert.equal(parseAccountListPage(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test("parseAccountListPage falls back to page one for invalid input", () => {
  for (const value of [null, undefined, "", "0", "-2", "1.5", " 2", "2 ", "abc", "9007199254740992"]) {
    assert.equal(parseAccountListPage(value), 1, `expected ${String(value)} to fall back`);
  }
});

test("accountListPath restores non-default pages", () => {
  assert.equal(accountListPath(1), "/");
  assert.equal(accountListPath(3), `/?${ACCOUNT_LIST_PAGE_PARAM}=3`);
  assert.equal(accountListPath(-1), "/");
});

test("emailFolderPath carries the account list page across folder switches", () => {
  const inboxPath = emailFolderPath(42, "INBOX", 3);
  assert.equal(inboxPath, `/emails/42/INBOX?${ACCOUNT_LIST_RETURN_PAGE_PARAM}=3`);

  const inboxUrl = new URL(inboxPath, "https://example.test");
  const sourcePage = parseAccountListPage(inboxUrl.searchParams.get(ACCOUNT_LIST_RETURN_PAGE_PARAM));
  assert.equal(emailFolderPath(42, "Junk", sourcePage), `/emails/42/Junk?${ACCOUNT_LIST_RETURN_PAGE_PARAM}=3`);
  assert.equal(accountListPath(sourcePage), `/?${ACCOUNT_LIST_PAGE_PARAM}=3`);
});

test("emailFolderPath omits the default page", () => {
  assert.equal(emailFolderPath(42, "INBOX", 1), "/emails/42/INBOX");
  assert.equal(emailFolderPath(42, "Junk", Number.NaN), "/emails/42/Junk");
});
