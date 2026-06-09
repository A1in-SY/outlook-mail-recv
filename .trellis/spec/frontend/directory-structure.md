# Directory Structure

The frontend is a single Vite application under `frontend/`.

## Layout

```text
frontend/
├── src/
│   ├── main.tsx                    # React root and global CSS import
│   ├── App.tsx                     # BrowserRouter, Toaster, routes, PrivateRoute
│   ├── index.css                   # Tailwind v4, shadcn theme tokens, global base layer
│   ├── pages/                      # Route-level screens
│   │   ├── AccountList.tsx
│   │   ├── EmailList.tsx
│   │   └── Login.tsx
│   ├── components/                 # Business components and dialogs
│   │   ├── CopyBtn.tsx
│   │   ├── EmailViewDialog.tsx
│   │   ├── ExportDialog.tsx
│   │   ├── ImportDialog.tsx
│   │   ├── PlatformFilterDialog.tsx
│   │   ├── PlatformIcon.tsx
│   │   ├── PlatformUsageDialog.tsx
│   │   └── ui/                     # shadcn-style base primitives
│   ├── lib/                        # API client, pure utilities, icon data
│   └── assets/                     # Bundled assets
├── tests/                          # Node test files for pure utilities
├── public/                         # Static public files
├── package.json
├── vite.config.ts
├── tsconfig.app.json
├── eslint.config.js
└── components.json
```

## Imports

Use the `@/` alias for imports from `src`, as configured in `frontend/vite.config.ts` and `frontend/tsconfig.app.json`.

Examples:

- `import { api } from "@/lib/api"`
- `import { Button } from "@/components/ui/button"`
- `import { AccountList } from "@/pages/AccountList"`

Relative imports are appropriate inside tests that live outside `src`, as in `frontend/tests/platform-filter.test.ts`.

## Ownership Boundaries

`App.tsx` owns routing and auth gating:

- `BrowserRouter`
- `Toaster`
- `/login`
- `/`
- `/emails/:accountId/:folder`
- `PrivateRoute`

Pages own data-loading workflows and composition of business components:

- `AccountList` owns account search, pagination, platform filtering, selection, import/export dialog orchestration, and navigation to email folders.
- `EmailList` owns route param parsing, cached email list loading, background refresh, email body opening, and platform usage dialog orchestration.
- `Login` owns the secret-key flow.

Business components under `components/` should be reusable within this product domain:

- Dialogs receive `open`, `onOpenChange`, and typed callback props.
- Components should not define route tables.
- Components should not duplicate backend API type definitions.

Base UI primitives under `components/ui/` follow shadcn/Radix patterns:

- `forwardRef`
- `displayName`
- `class-variance-authority` where variants are needed
- `cn()` from `frontend/src/lib/utils.ts`

Do not put product-specific API calls in `components/ui/`.

`lib/` owns non-React or app-wide support code:

- `api.ts` for fetch, auth token helpers, API resource methods, and backend response interfaces.
- `platform-filter.ts` for pure search logic.
- `platform-icons.ts` for static icon data.
- `utils.ts` for class merging.

## Adding Files

Add a new route-level screen to `src/pages/` and register it in `App.tsx`.

Add a reusable business dialog or widget to `src/components/`.

Add a new shadcn primitive only when it is a generic UI building block. Keep generated primitive code separate from business components.

Add pure shared functions to `src/lib/` and consider a test under `frontend/tests/`.

Add custom hooks only when stateful logic is reused or page files become hard to maintain. The configured alias reserves `@/hooks`, but there is no `src/hooks/` directory yet.

## Avoid

- Do not call `fetch` directly from pages or components. Add methods to `frontend/src/lib/api.ts`.
- Do not create duplicate API interfaces in page files.
- Do not put business copy, account logic, or API calls inside `components/ui/`.
- Do not put page-only helpers into `lib/` unless they are reused or tested independently.
