# Kiro Platform Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Kiro` to the maintained platform list and let users search platform checkbox lists in the frontend.

**Architecture:** Keep platform data owned by the backend seed list and keep search local to the frontend. Extract the platform filtering rule into a tiny frontend helper so the core behavior is testable without adding a browser test framework.

**Tech Stack:** FastAPI, SQLAlchemy, Python `unittest`, React 19, TypeScript, Vite, Node test runner for the frontend helper.

---

### Task 1: Backend Platform Seed

**Files:**
- Create: `backend/tests/test_platforms.py`
- Modify: `backend/app/models/platform.py`

- [ ] **Step 1: Write the failing backend test**

Create `backend/tests/test_platforms.py`:

```python
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.platform import PLATFORM_LIST, Platform, seed_platforms


class PlatformTests(unittest.TestCase):
    def test_platform_list_includes_kiro(self):
        self.assertIn("Kiro", PLATFORM_LIST)

    def test_seed_platforms_inserts_kiro(self):
        engine = create_engine("sqlite:///:memory:")
        Platform.__table__.create(engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            seed_platforms(db)
            platform = db.query(Platform).filter(Platform.name == "Kiro").first()
            self.assertIsNotNone(platform)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest backend.tests.test_platforms
```

Expected: FAIL with an assertion that `"Kiro"` is not present in `PLATFORM_LIST`.

- [ ] **Step 3: Add `Kiro` to the platform list**

Modify `backend/app/models/platform.py` so `PLATFORM_LIST` contains:

```python
    "LinkedIn",
    "Kiro",
    "Midjourney",
```

The existing `sorted([...])` wrapper will place `Kiro` correctly in API responses.

- [ ] **Step 4: Run the backend test to verify it passes**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest backend.tests.test_platforms
```

Expected: PASS with 2 tests.

### Task 2: Frontend Platform Search Helper

**Files:**
- Create: `frontend/src/lib/platform-filter.ts`
- Create: `frontend/tests/platform-filter.test.ts`

- [ ] **Step 1: Write the failing frontend helper test**

Create `frontend/tests/platform-filter.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the frontend helper test to verify it fails**

Run from `frontend/`:

```bash
rm -rf /tmp/outlook-platform-filter-test && ./node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2023 --types node --skipLibCheck --esModuleInterop --outDir /tmp/outlook-platform-filter-test --rootDir . src/lib/platform-filter.ts tests/platform-filter.test.ts && node --test /tmp/outlook-platform-filter-test/tests/platform-filter.test.js
```

Expected: FAIL because `src/lib/platform-filter.ts` does not exist yet.

- [ ] **Step 3: Create the platform search helper**

Create `frontend/src/lib/platform-filter.ts`:

```typescript
export interface SearchablePlatform {
  name: string;
}

export function filterPlatforms<T extends SearchablePlatform>(platforms: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return platforms;
  }

  return platforms.filter((platform) => platform.name.toLowerCase().includes(normalizedQuery));
}
```

- [ ] **Step 4: Run the frontend helper test to verify it passes**

Run from `frontend/`:

```bash
rm -rf /tmp/outlook-platform-filter-test && ./node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2023 --types node --skipLibCheck --esModuleInterop --outDir /tmp/outlook-platform-filter-test --rootDir . src/lib/platform-filter.ts tests/platform-filter.test.ts && node --test /tmp/outlook-platform-filter-test/tests/platform-filter.test.js
```

Expected: PASS with 3 tests.

### Task 3: Wire Search Into Platform Dialogs

**Files:**
- Modify: `frontend/src/components/PlatformFilterDialog.tsx`
- Modify: `frontend/src/components/PlatformUsageDialog.tsx`

- [ ] **Step 1: Update `PlatformFilterDialog`**

Add imports:

```typescript
import { Input } from "@/components/ui/input";
import { filterPlatforms } from "@/lib/platform-filter";
```

Add state and derived data:

```typescript
  const [platformSearch, setPlatformSearch] = useState("");
  const filteredPlatforms = filterPlatforms(platforms, platformSearch);
```

Reset search when the dialog opens:

```typescript
    setPlatformSearch("");
```

Render this search input below the descriptive text:

```tsx
        <Input
          value={platformSearch}
          onChange={(e) => setPlatformSearch(e.target.value)}
          placeholder="搜索平台..."
          className="mb-3"
        />
```

Render `filteredPlatforms` instead of `platforms`, and render this empty state when the filtered list is empty:

```tsx
            {filteredPlatforms.length === 0 ? (
              <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                未找到匹配平台
              </div>
            ) : (
              filteredPlatforms.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={localSelected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-primary"
                  />
                  <PlatformIcon platform={p} size={16} />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))
            )}
```

- [ ] **Step 2: Update `PlatformUsageDialog`**

Add imports:

```typescript
import { Input } from "@/components/ui/input";
import { filterPlatforms } from "@/lib/platform-filter";
```

Add state and derived data:

```typescript
  const [platformSearch, setPlatformSearch] = useState("");
  const filteredPlatforms = filterPlatforms(allPlatforms, platformSearch);
```

Reset search when the dialog opens:

```typescript
    setPlatformSearch("");
```

Render this search input below the account email:

```tsx
        <Input
          value={platformSearch}
          onChange={(e) => setPlatformSearch(e.target.value)}
          placeholder="搜索平台..."
          className="mb-3"
        />
```

Render `filteredPlatforms` instead of `allPlatforms`, and render this empty state when the filtered list is empty:

```tsx
            {filteredPlatforms.length === 0 ? (
              <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                未找到匹配平台
              </div>
            ) : (
              filteredPlatforms.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-primary"
                  />
                  <PlatformIcon platform={p} size={16} />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))
            )}
```

- [ ] **Step 3: Verify frontend helper tests still pass**

Run from `frontend/`:

```bash
rm -rf /tmp/outlook-platform-filter-test && ./node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2023 --types node --skipLibCheck --esModuleInterop --outDir /tmp/outlook-platform-filter-test --rootDir . src/lib/platform-filter.ts tests/platform-filter.test.ts && node --test /tmp/outlook-platform-filter-test/tests/platform-filter.test.js
```

Expected: PASS with 3 tests.

- [ ] **Step 4: Verify frontend build passes**

Run from `frontend/`:

```bash
npm run build
```

Expected: TypeScript build and Vite production build complete successfully.

### Task 4: Full Verification

**Files:**
- Read-only verification across backend and frontend.

- [ ] **Step 1: Run backend tests**

Run:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover backend/tests
```

Expected: PASS for the backend test suite.

- [ ] **Step 2: Run frontend helper test**

Run from `frontend/`:

```bash
rm -rf /tmp/outlook-platform-filter-test && ./node_modules/.bin/tsc --ignoreConfig --module commonjs --target es2023 --types node --skipLibCheck --esModuleInterop --outDir /tmp/outlook-platform-filter-test --rootDir . src/lib/platform-filter.ts tests/platform-filter.test.ts && node --test /tmp/outlook-platform-filter-test/tests/platform-filter.test.js
```

Expected: PASS with 3 tests.

- [ ] **Step 3: Run frontend build**

Run from `frontend/`:

```bash
npm run build
```

Expected: TypeScript build and Vite production build complete successfully.
