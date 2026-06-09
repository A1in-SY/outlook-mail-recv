# Hook Guidelines

The project currently does not define custom hooks. State and effects are local to pages and dialogs.

Reference files:

- `frontend/src/pages/AccountList.tsx`
- `frontend/src/pages/EmailList.tsx`
- `frontend/src/components/EmailViewDialog.tsx`
- `frontend/src/components/PlatformUsageDialog.tsx`
- `frontend/src/components/PlatformFilterDialog.tsx`

## Current Hook Usage

Use React hooks directly in components:

- `useState` for local UI state, server response state, loading flags, selected IDs, dialog open state, and form fields.
- `useEffect` for load-on-open and load-on-route-change behavior.
- `useCallback` for async load/refresh functions that are dependencies of effects.
- `useMemo` for derived expensive or safety-sensitive values, such as sanitized email HTML in `EmailViewDialog`.
- `useNavigate` and `useParams` from React Router in route pages.

## Data Loading Pattern

Page-level data loading is done through typed functions in `frontend/src/lib/api.ts`.

`AccountList.tsx` reference pattern:

- Keep `page`, `search`, filters, items, total, and loading state in the page.
- Define `load` with `useCallback`.
- Use `Promise.all` when list and count can be fetched together.
- Catch `unknown` errors and show a toast.
- Reset pagination when search/filter inputs change.

`EmailList.tsx` reference pattern:

- Parse URL params with `useParams`.
- Convert `accountId` to a number once and guard `Number.isNaN(accId)`.
- Load cached rows first.
- Trigger background refresh with `refreshAndLoad({ showState: false, showError: false })`.
- Use `void` when intentionally starting an async operation from an effect or event path without awaiting it.

Dialog load-on-open pattern:

- In `PlatformUsageDialog` and `PlatformFilterDialog`, exit early when `open` is false.
- Reset dialog-local search/selection state when opening.
- Set loading true before fetching and false in `finally`.

## Effect Cleanup

When an effect schedules work with `window.setTimeout`, return a cleanup that clears it. Both page load effects currently use this pattern.

Do not make the `useEffect` callback itself `async`. Define an async function or call an async callback with `void`.

## When To Extract A Custom Hook

Create a custom hook only when one of these is true:

- The same stateful workflow is needed by two or more components.
- A page becomes difficult to review because loading, pagination, and mutation logic are mixed with too much JSX.
- The hook can expose a small typed API of state plus actions.

If a hook is added:

- Create `frontend/src/hooks/` first.
- Name it `useSomething`.
- Keep backend access through `frontend/src/lib/api.ts`.
- Return typed values and functions.
- Include all dependencies in `useEffect` and `useCallback` arrays.

## Avoid

- Do not add React Query, SWR, Zustand, Redux, or another state/data library unless the app gains enough repeated server-state workflows to justify it.
- Do not duplicate fetch logic in custom hooks while bypassing `api`.
- Do not suppress hook dependency lint rules.
- Do not store derived values in state when they can be computed from existing state cheaply.
