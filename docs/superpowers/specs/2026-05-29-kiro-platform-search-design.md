# Kiro Platform and Platform Picker Search Design

## Context

The app manages Outlook/Hotmail accounts and tracks which external platforms each account has been used for. Platforms are maintained as a finite backend list in `backend/app/models/platform.py` and are exposed to the frontend through `/api/platforms`.

The frontend currently has two platform checkbox dialogs:

- `PlatformFilterDialog`: selects platforms to find accounts that are still available for those platforms.
- `PlatformUsageDialog`: selects platforms already used by a specific account.

Both dialogs render the full platform list without a local search field.

## Requirements

- Add `Kiro` as a supported platform.
- Keep platform naming consistent with existing display names, using `Kiro`.
- Add frontend search filtering when users choose platforms.
- Apply search to both platform checkbox dialogs so platform selection behavior is consistent.
- Search must be local to the frontend and must not require API changes.
- Search must not clear selected platform IDs when the visible list is filtered.

## Design

Backend platform seed data will add `"Kiro"` to `PLATFORM_LIST`. Existing startup seeding will insert it into databases where it is missing. No migration is needed because the platform list already uses idempotent seed logic.

Frontend dialogs will each maintain a `platformSearch` state. The rendered platform list will use a derived filtered array that compares `platform.name.toLowerCase()` with the normalized search query. The search field will sit above the checkbox grid and below each dialog's descriptive text.

Selection state remains unchanged. Toggling a filtered item updates the same selected ID set used today. Clearing or changing the search query only changes which platforms are visible, not which platforms are selected.

When a non-empty search has no matches, the dialog will show `未找到匹配平台` in the list area.

## Components

- `backend/app/models/platform.py`
  - Add `Kiro` to `PLATFORM_LIST`.
- `frontend/src/components/PlatformFilterDialog.tsx`
  - Add local search input and filter the visible platform list.
- `frontend/src/components/PlatformUsageDialog.tsx`
  - Add local search input and filter the visible platform list.

## Data Flow

The existing `/api/platforms` response remains unchanged. The frontend fetches all platforms once when each dialog opens. Filtering happens entirely in React render state.

## Error Handling

Existing platform load and save error handling remains unchanged. Search does not introduce new network or persistence errors.

## Testing

- Add backend tests proving `Kiro` is in the maintained platform list and seed logic inserts it into an empty database.
- Verify frontend with `npm run build` because the project has no frontend test runner configured.
- Run backend tests after the backend change.

