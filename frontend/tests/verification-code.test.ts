import assert from "node:assert/strict";
import test from "node:test";
import { extractVerificationCode } from "../src/lib/verification-code.ts";

test("extractVerificationCode reads a code that follows a Chinese keyword", () => {
  assert.equal(extractVerificationCode("", "您的验证码是 483920，5 分钟内有效。"), "483920");
});

test("extractVerificationCode reads a code from an English body", () => {
  assert.equal(
    extractVerificationCode("Sign in to your account", "Your verification code is 728194."),
    "728194",
  );
});

test("extractVerificationCode reads a code that precedes the keyword", () => {
  assert.equal(extractVerificationCode("", "941022 is your security code."), "941022");
});

test("extractVerificationCode prefers the subject code over unrelated body numbers", () => {
  const subject = "294817 is your verification code";
  const body = "Sent 2024-03-11. Reference 5512 for our records.";
  assert.equal(extractVerificationCode(subject, body), "294817");
});

test("extractVerificationCode handles alphanumeric codes", () => {
  assert.equal(extractVerificationCode("", "Your one-time code: A3F9K2"), "A3F9K2");
});

test("extractVerificationCode supports 4-digit codes", () => {
  assert.equal(extractVerificationCode("", "验证码：8421"), "8421");
});

test("extractVerificationCode returns null for mail with no code", () => {
  const body = "Thanks for your order placed on 2024-05-02. It ships in 3 days.";
  assert.equal(extractVerificationCode("Order confirmation", body), null);
});

test("extractVerificationCode ignores dates, times, and versions near a keyword", () => {
  const body = "Your verification code request was logged at 2024-01-15 09:30 using app 1.2.3.";
  assert.equal(extractVerificationCode("", body), null);
});

test("extractVerificationCode ignores digits embedded in links and addresses", () => {
  const body = "Enter the code at https://example.com/verify/558213 or mail us at ops123@example.com";
  assert.equal(extractVerificationCode("", body), null);
});

test("extractVerificationCode ignores long digit runs such as order numbers", () => {
  assert.equal(extractVerificationCode("", "Your code relates to order 1234567890123."), null);
});

test("extractVerificationCode picks the code nearest the keyword", () => {
  const body = "Ticket 5150 was opened. Your verification code is 660421. Building 7742.";
  assert.equal(extractVerificationCode("", body), "660421");
});

test("extractVerificationCode tolerates empty input", () => {
  assert.equal(extractVerificationCode("", ""), null);
});
