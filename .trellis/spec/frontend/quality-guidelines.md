# Quality Guidelines

Frontend changes should preserve the current React, shadcn, Tailwind, and typed API-client patterns.

## Verification Commands

Run these for frontend behavior changes:

```bash
cd frontend
npm run lint
npm run build
```

There is no `npm test` script configured. The existing pure utility test is `frontend/tests/platform-filter.test.ts`; if you change or add utility tests, make sure the command to run them is added or reported.

## Required Patterns

- Use `@/` imports for source files.
- Use the centralized `api` client for all backend calls.
- Keep backend response interfaces in `frontend/src/lib/api.ts`.
- Use existing shadcn UI primitives before creating new controls.
- Use `lucide-react` icons for actions.
- Use `sonner` toast for user-visible async success/failure.
- Use controlled dialogs with `open` and `onOpenChange`.
- Sanitize remote email HTML with DOMPurify before rendering.
- Guard invalid route params before API calls.

## ESLint And TypeScript

`frontend/eslint.config.js` currently applies:

- `@eslint/js` recommended rules.
- `typescript-eslint` recommended rules.
- `eslint-plugin-react-hooks`.
- `eslint-plugin-react-refresh` Vite rules.
- Browser globals.

TypeScript additionally rejects unused locals and parameters through `tsconfig.app.json`.

Do not silence lint/compiler failures with broad comments. Fix the code or explain a narrow exception.

## Testing Expectations

Add or update tests when logic is pure and independent of React rendering.

Current example:

- `frontend/src/lib/platform-filter.ts`
- `frontend/tests/platform-filter.test.ts`

For UI workflows, the repo currently has no browser test framework. Use focused code review plus `npm run build` and `npm run lint` unless a test framework is added.

## Review Checklist

Before accepting frontend changes, check:

- Are all API calls routed through `lib/api.ts`?
- Did backend response changes update `api.ts` interfaces?
- Are async failures visible to the user through toast or an intentional silent background path?
- Are loading states set and cleared in `finally` where appropriate?
- Are effect dependencies complete?
- Is long table text truncated instead of breaking dense layouts?
- Are raw email HTML and any other remote HTML sanitized?
- Are new controls built from existing UI primitives?
- Does the page still work on the configured Vite proxy path `/api`?

## High-Risk Patterns

- Direct `fetch()` calls outside `lib/api.ts`.
- New `any` types.
- New global state library for page-local state.
- Mutating `Set` state directly.
- Adding product behavior to `components/ui/`.
- Rendering remote HTML without DOMPurify.
- Copying platform search/filter logic instead of using `filterPlatforms()`.
