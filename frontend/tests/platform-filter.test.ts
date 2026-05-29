import assert from "node:assert/strict";
import test from "node:test";
import { filterPlatforms } from "../src/lib/platform-filter";

const platforms = [
  { id: 1, name: "ChatGPT" },
  { id: 2, name: "Cursor" },
  { id: 3, name: "Kiro" },
  { id: 4, name: "GitHub" },
];

test("filterPlatforms returns every platform for a blank query", () => {
  assert.deepEqual(filterPlatforms(platforms, "   "), platforms);
});

test("filterPlatforms matches platform names case-insensitively", () => {
  assert.deepEqual(filterPlatforms(platforms, "KI"), [{ id: 3, name: "Kiro" }]);
});

test("filterPlatforms returns an empty list when no platform matches", () => {
  assert.deepEqual(filterPlatforms(platforms, "missing"), []);
});
