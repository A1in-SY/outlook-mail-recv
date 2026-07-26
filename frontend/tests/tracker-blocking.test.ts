import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

/**
 * The module under test walks the DOM, so it needs a window. jsdom is installed rather
 * than hand-rolling a fake because DOMPurify itself requires a real DOM implementation --
 * a stub would test the stub, not the sanitiser.
 *
 * Globals are assigned before importing so the module's `import DOMPurify from "dompurify"`
 * binds to a window-backed instance.
 */
let sanitiseEmailHtml: typeof import("../src/lib/tracker-blocking.ts").sanitiseEmailHtml;

before(async () => {
  const dom = new JSDOM("", { url: "https://example.test/" });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.HTMLElement = dom.window.HTMLElement;
  g.DocumentFragment = dom.window.DocumentFragment;
  g.NodeFilter = dom.window.NodeFilter;
  g.DOMParser = dom.window.DOMParser;
  g.trustedTypes = undefined;

  ({ sanitiseEmailHtml } = await import("../src/lib/tracker-blocking.ts"));
});

const BEACON = 'https://u20216706.ct.sendgrid.net/wf/open?upn=abc123';

test("strips the src of a tracking pixel", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<p>hi</p><img src="${BEACON}" width="1" height="1">`,
    true,
  );

  assert.ok(!html.includes("sendgrid"), "beacon host must not survive");
  assert.ok(!html.includes("http"), "no remote url of any kind remains");
  assert.equal(blocked, 1);
  assert.ok(html.includes("<p>hi</p>"), "text content is untouched");
});

test("replaces a blocked src with an inline blank pixel", () => {
  // A bare removal leaves an <img> the browser paints as a broken-image glyph, which
  // reads as a bug rather than a deliberate block. The substitute is a data: URI, so
  // it still costs no request.
  const { html } = sanitiseEmailHtml(`<img src="${BEACON}" alt="logo">`, true);

  assert.match(html, /src="data:image\/gif;base64,/);
  assert.ok(!html.includes("sendgrid"));
});

test("drops the sender's width and height on a blocked image", () => {
  // Keeping them would stretch the placeholder to the original image's dimensions,
  // leaving a large empty gap where the picture used to be.
  const { html } = sanitiseEmailHtml(
    `<img src="https://a.test/hero.png" width="600" height="300">`,
    true,
  );

  assert.ok(!html.includes("width="), "width is gone");
  assert.ok(!html.includes("height="), "height is gone");
});

test("strips srcset as well as src", () => {
  // Leaving srcset behind would let the browser load a candidate from it instead.
  const { html, blocked } = sanitiseEmailHtml(
    `<img src="https://a.test/x.png" srcset="https://a.test/x@2x.png 2x">`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.equal(blocked, 2);
});

test("strips the deprecated background attribute", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<table background="https://a.test/bg.gif"><tr><td>x</td></tr></table>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.equal(blocked, 1);
});

test("neutralises url() in an inline style", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<div style="background: url('https://a.test/bg.gif'); color: red">x</div>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.ok(html.includes("color: red"), "unrelated declarations survive");
  assert.equal(blocked, 1);
});

test("neutralises url() inside a body-level style block", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<div><style>.x { background: url(https://a.test/bg.gif); color: red }</style>y</div>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.ok(html.includes("color: red"), "unrelated declarations survive");
  assert.equal(blocked, 1);
});

test("neutralises @import in a body-level style block", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<div><style>@import url("https://a.test/evil.css"); .x { color: red }</style>y</div>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.ok(!html.includes("@import"), "the rule itself is removed, not just its url");
  assert.ok(html.includes("color: red"));
  // One resource, counted once: @import is processed before the url() pass so the two
  // patterns cannot both claim the same rule.
  assert.equal(blocked, 1);
});

/**
 * DOMPurify parses into a document and keeps only <body> (`_initDocument`), so anything
 * that lands in <head> -- where real mail puts its <style> and <link> -- is dropped
 * before any hook runs. That predates this change and is why FORCE_BODY stays off:
 * enabling it would pull those stylesheets *into* the DOM and widen the attack surface.
 */
test("head-level style and link are dropped entirely, blocking on or off", () => {
  const mail = `<html><head>
    <style>.h { background: url(https://a.test/h.gif) }</style>
    <link rel="stylesheet" href="https://a.test/evil.css">
  </head><body><p>x</p></body></html>`;

  for (const blockRemote of [true, false]) {
    const { html } = sanitiseEmailHtml(mail, blockRemote);
    assert.ok(!html.includes("a.test"), `no remote url with blockRemote=${blockRemote}`);
    assert.ok(!html.includes("<style"), "style element does not survive");
    assert.ok(!html.includes("<link"), "link element does not survive");
    assert.ok(html.includes("<p>x</p>"), "body content survives");
  }
});

test("strips a body-level remote stylesheet link", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<div><link rel="stylesheet" href="https://a.test/evil.css"></div>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.equal(blocked, 1);
});

test("strips embedded document sources", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<iframe src="https://a.test/f"></iframe><object data="https://a.test/o"></object>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  // Only <object data> is counted: <iframe> is on DOMPurify's own forbid list and is
  // removed before the hook ever sees it. Either way nothing remote survives.
  assert.equal(blocked, 1);
});

test("strips svg image href and use xlink:href", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<svg><image href="https://a.test/i.png"/><use xlink:href="https://a.test/u.svg"/></svg>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.equal(blocked, 2);
});

test("blocks every vector in a realistically shaped marketing email", () => {
  const mail = `<html><head>
    <style>.hdr { background: url(https://a.test/head-bg.gif) }</style>
  </head><body>
    <img src="https://cdn.openai.com/logo.png" width="200">
    <div><style>.n { background: url(https://a.test/nested.gif) }</style>inner</div>
    <img src="https://u20216706.ct.sendgrid.net/wf/open?upn=x" width="1" height="1">
  </body></html>`;

  const { html } = sanitiseEmailHtml(mail, true);

  for (const host of ["a.test", "sendgrid", "cdn.openai.com"]) {
    assert.ok(!html.includes(host), `${host} must not survive`);
  }
  assert.ok(html.includes("inner"), "text content survives");
});

test("strips video src and poster", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<video src="https://a.test/v.mp4" poster="https://a.test/p.jpg"></video>`,
    true,
  );

  assert.ok(!html.includes("a.test"));
  assert.equal(blocked, 2);
});

test("keeps data: and cid: URLs, which need no network", () => {
  const dataUri = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  const { html, blocked } = sanitiseEmailHtml(
    `<img src="${dataUri}"><img src="cid:logo@example">`,
    true,
  );

  assert.ok(html.includes(dataUri), "data: URI survives");
  assert.ok(html.includes("cid:logo@example"), "cid: attachment survives");
  assert.equal(blocked, 0);
});

test("counts every blocked resource in one message", () => {
  const { blocked } = sanitiseEmailHtml(
    `<img src="${BEACON}">
     <img src="https://cdn.test/logo.png">
     <div style="background:url(https://a.test/bg.gif)">x</div>`,
    true,
  );

  assert.equal(blocked, 3);
});

test("loads remote resources when blocking is off", () => {
  const { html, blocked } = sanitiseEmailHtml(
    `<img src="https://cdn.test/logo.png"><div style="background:url(https://a.test/bg.gif)">x</div>`,
    false,
  );

  assert.ok(html.includes("https://cdn.test/logo.png"), "image is restored");
  assert.ok(html.includes("a.test/bg.gif"), "css url is restored");
  assert.equal(blocked, 0);
});

test("blocking off after blocking on does not leak a stale hook", () => {
  // The hook is registered globally on the DOMPurify instance, so a missing cleanup
  // would silently keep stripping resources for every later call.
  sanitiseEmailHtml(`<img src="${BEACON}">`, true);
  const { html } = sanitiseEmailHtml(`<img src="https://cdn.test/logo.png">`, false);

  assert.ok(html.includes("https://cdn.test/logo.png"));
});

test("still removes scripts, so XSS protection is not weakened", () => {
  const { html } = sanitiseEmailHtml(
    `<p>hi</p><script>alert(1)</script><img src="x" onerror="alert(2)">`,
    true,
  );

  assert.ok(!html.includes("<script"), "script tag removed");
  assert.ok(!html.includes("onerror"), "event handler removed");
});

test("marks stripped images so they can be styled as placeholders", () => {
  const blockedResult = sanitiseEmailHtml(`<img src="${BEACON}">`, true);
  assert.ok(
    blockedResult.html.includes("data-blocked-remote"),
    "marker survives sanitisation and is not dropped as an unknown attribute",
  );

  const allowedResult = sanitiseEmailHtml(`<img src="https://cdn.test/logo.png">`, false);
  assert.ok(
    !allowedResult.html.includes("data-blocked-remote"),
    "no marker when nothing was blocked",
  );
});

test("does not mark non-image elements", () => {
  const { html } = sanitiseEmailHtml(`<video src="https://a.test/v.mp4"></video>`, true);

  assert.ok(!html.includes("data-blocked-remote"));
});

test("handles an empty body without throwing", () => {
  const { html, blocked } = sanitiseEmailHtml("", true);

  assert.equal(html, "");
  assert.equal(blocked, 0);
});
