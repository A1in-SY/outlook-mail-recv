# State Management

The frontend currently uses local React state plus localStorage for the auth token. There is no global state library.

Reference files:

- `frontend/src/lib/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/AccountList.tsx`
- `frontend/src/pages/EmailList.tsx`
- `frontend/src/components/PlatformUsageDialog.tsx`
- `frontend/src/components/PlatformFilterDialog.tsx`

## State Categories

Auth state:

- Stored as `auth_token` in localStorage.
- Managed only through `getToken()`, `setToken()`, `clearToken()`, and `hasToken()` in `frontend/src/lib/api.ts`.
- Checked by `PrivateRoute` in `App.tsx`.
- Cleared automatically by `request()` on HTTP 403.

Server state:

- Stored in page/component state after `api` calls.
- `AccountList` stores `accounts` and `total`.
- `EmailList` stores `emails`, `total`, and `accountEmail`.
- Platform dialogs store platform lists loaded when the dialog opens.

UI state:

- Loading flags: `loading`, `refreshing`, `detailLoading`, `saving`, `testing`.
- Dialog open flags in owning pages.
- Form fields such as import text, separator, login key, and platform search.
- Selection sets with `Set<number>` for account/platform selection.

URL state:

- `EmailList` derives `accountId` and `folder` from route params.
- Navigation between account list and folder views uses `useNavigate`.

Derived state:

- `totalPages`, `allChecked`, `folderName`, `separatorValid`, `filteredPlatforms`, formatted dates, and display text should be derived during render or with `useMemo` when needed.

## Server State Rules

All server communication goes through `frontend/src/lib/api.ts`.

Use page-owned loading functions for workflows:

- `AccountList.load()` fetches accounts and count.
- `EmailList.load()` fetches cached emails and account info.
- `EmailList.refreshAndLoad()` mutates server cache, then reloads page state.

Do not introduce a client-side cache that conflicts with the backend email cache. The backend owns cached email rows; the frontend refreshes them explicitly.

## Selection State

Use `Set<number>` for selection toggles, as in account row selection and platform dialogs.

When updating a `Set`, create a new instance:

```ts
setSelected((prev) => {
  const next = new Set(prev);
  next.add(id);
  return next;
});
```

Do not mutate the previous `Set` in place.

## When To Add Global State

Do not add global state for page-local workflows.

Consider global state only if:

- Multiple distant pages/components need the same live data.
- Passing callbacks/data through props becomes a repeated problem.
- The data cannot be represented cleanly in the URL or loaded from the API where needed.

Even then, keep auth token helpers in `lib/api.ts` unless the auth flow is redesigned.

## Common Mistakes

- Duplicating token reads/writes outside `lib/api.ts`.
- Keeping server state in a dialog after it closes without resetting on open.
- Forgetting to reset `page` to 1 when search or platform filters change.
- Mutating `Set` state directly.
- Storing formatted date strings instead of raw `received_ts_ms`.
