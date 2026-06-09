# Frontend Development Guidelines

Frontend code lives under `frontend/` and is a React + TypeScript + Vite application.

The current frontend stack is:

- React 19 with function components.
- React Router routes in `frontend/src/App.tsx`.
- A single typed API client in `frontend/src/lib/api.ts`.
- Tailwind CSS v4 and shadcn-style primitives under `frontend/src/components/ui/`.
- Radix UI primitives for dialogs/selects.
- `lucide-react` icons.
- `sonner` toast notifications.
- `DOMPurify` for rendering remote email HTML.

## Guidelines Index

| Guide | Description |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Source layout, aliases, and ownership boundaries |
| [Component Guidelines](./component-guidelines.md) | Business components, UI primitives, props, styling, and accessibility |
| [Hook Guidelines](./hook-guidelines.md) | Current local hook usage and when to extract custom hooks |
| [State Management](./state-management.md) | Local UI state, server state, auth token state, and URL state |
| [Type Safety](./type-safety.md) | API types, props, unions, validation, and unsafe patterns |
| [Quality Guidelines](./quality-guidelines.md) | Build/lint commands, tests, and review checklist |

## Local Architecture Rules

- Keep route declarations and auth gating in `frontend/src/App.tsx`.
- Keep page-level workflows under `frontend/src/pages/`.
- Keep business dialogs and reusable business components under `frontend/src/components/`.
- Keep generated/base UI primitives under `frontend/src/components/ui/`.
- Keep API calls and backend response types in `frontend/src/lib/api.ts`.
- Keep pure utilities in `frontend/src/lib/`.
- Use the `@/` alias for imports from `src`.

Source-backed examples:

- `frontend/src/pages/AccountList.tsx` shows the main data-table workflow with search, filtering, pagination, import/export, and account actions.
- `frontend/src/pages/EmailList.tsx` shows URL param handling, cached list loading, background refresh, and lazy body loading.
- `frontend/src/components/ImportDialog.tsx` shows a controlled business dialog with typed async callback props.
- `frontend/src/components/EmailViewDialog.tsx` shows the required DOMPurify pattern before `dangerouslySetInnerHTML`.
- `frontend/src/lib/platform-filter.ts` and `frontend/tests/platform-filter.test.ts` show how to isolate and test pure frontend logic.

## Verification

For frontend behavior changes, run:

```bash
cd frontend
npm run lint
npm run build
```

The repository has a Node test file at `frontend/tests/platform-filter.test.ts`, but no `npm test` script is currently configured. If adding or changing pure frontend utilities, either add a test script or document the exact command you used to execute the test.
