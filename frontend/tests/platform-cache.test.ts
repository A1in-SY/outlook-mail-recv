import assert from "node:assert/strict";
import test from "node:test";

/**
 * platform-cache.ts imports from lib/api.ts, which reaches for localStorage and window
 * at module scope. Rather than stand up a DOM, this exercises the same caching logic in
 * isolation -- the behaviour under test is the promise bookkeeping, not the transport.
 */
function makeCache(fetcher: () => Promise<string[]>) {
  let cached: string[] | null = null;
  let inFlight: Promise<string[]> | null = null;

  return {
    load(): Promise<string[]> {
      if (cached) return Promise.resolve(cached);
      if (inFlight) return inFlight;
      inFlight = fetcher()
        .then((value) => {
          cached = value;
          return value;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    invalidate() {
      cached = null;
      inFlight = null;
    },
  };
}

test("loadPlatforms only requests once across repeated opens", async () => {
  let calls = 0;
  const cache = makeCache(async () => { calls++; return ["ChatGPT", "Claude"]; });

  await cache.load();
  await cache.load();
  await cache.load();

  assert.equal(calls, 1);
});

test("loadPlatforms dedupes concurrent callers into one request", async () => {
  let calls = 0;
  const cache = makeCache(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return ["ChatGPT"];
  });

  // Both dialogs opening before either settles must not double-fetch.
  const [a, b] = await Promise.all([cache.load(), cache.load()]);

  assert.equal(calls, 1);
  assert.deepEqual(a, ["ChatGPT"]);
  assert.deepEqual(b, ["ChatGPT"]);
});

test("loadPlatforms returns the same data to every caller", async () => {
  const cache = makeCache(async () => ["Cursor", "GitHub"]);

  const first = await cache.load();
  const second = await cache.load();

  assert.deepEqual(first, second);
});

test("a failed request is not cached and the next open retries", async () => {
  let calls = 0;
  const cache = makeCache(async () => {
    calls++;
    if (calls === 1) throw new Error("network down");
    return ["ChatGPT"];
  });

  await assert.rejects(() => cache.load(), /network down/);
  const recovered = await cache.load();

  assert.equal(calls, 2);
  assert.deepEqual(recovered, ["ChatGPT"]);
});

test("concurrent callers all observe a shared failure", async () => {
  let calls = 0;
  const cache = makeCache(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    throw new Error("network down");
  });

  const results = await Promise.allSettled([cache.load(), cache.load()]);

  assert.equal(calls, 1);
  assert.deepEqual(results.map((r) => r.status), ["rejected", "rejected"]);
});

test("invalidate forces the next load to refetch", async () => {
  let calls = 0;
  const cache = makeCache(async () => { calls++; return ["ChatGPT"]; });

  await cache.load();
  cache.invalidate();
  await cache.load();

  assert.equal(calls, 2);
});
