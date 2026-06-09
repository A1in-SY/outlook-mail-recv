# Type Safety

The frontend uses TypeScript with Vite bundler module resolution and React JSX.

Reference files:

- `frontend/tsconfig.app.json`
- `frontend/src/lib/api.ts`
- `frontend/src/components/ImportDialog.tsx`
- `frontend/src/components/EmailViewDialog.tsx`
- `frontend/src/lib/platform-filter.ts`
- `frontend/tests/platform-filter.test.ts`

## Compiler Settings

Important current settings in `frontend/tsconfig.app.json`:

- `target: "es2023"`
- `lib: ["ES2023", "DOM"]`
- `moduleResolution: "bundler"`
- `verbatimModuleSyntax: true`
- `noEmit: true`
- `jsx: "react-jsx"`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `erasableSyntaxOnly: true`
- `baseUrl: "."`
- `paths: { "@/*": ["./src/*"] }`

`strict` is not explicitly enabled. Do not rely on that as permission to add unsafe types.

## API Types

`frontend/src/lib/api.ts` is the source of truth for frontend representations of backend responses.

Current API types:

- `Platform`
- `MailProtocol`
- `Account`
- `EmailItem`
- `ProtocolTestResult`

When backend response shapes change, update `api.ts` first, then update pages/components that consume those types.

Use the `MailProtocol = "imap" | "graph"` union instead of plain `string` for protocol choices.

## Props And Imports

For business components, define a local `interface Props`.

Use type-only imports when importing only types:

```ts
import type { MailProtocol, ProtocolTestResult } from "@/lib/api";
```

This matches `ImportDialog.tsx` and helps with `verbatimModuleSyntax`.

## Error Types

Prefer `unknown` in catch blocks and narrow with a helper:

```ts
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
```

Some existing code uses `catch (e: any)` in platform dialogs. Treat that as legacy local code, not a pattern to copy.

## Generic Utilities

Pure utilities may use generics when the function preserves input shape.

`frontend/src/lib/platform-filter.ts` is the reference:

```ts
export interface SearchablePlatform {
  name: string;
}

export function filterPlatforms<T extends SearchablePlatform>(platforms: T[], query: string): T[] {
  ...
}
```

Keep pure utilities small and test them with Node tests when they encode behavior.

## Runtime Validation

The backend performs authoritative validation. The frontend still performs lightweight UX validation before requests:

- Non-empty login key in `Login.tsx`.
- Non-empty import/export separator.
- At least one import line.
- At least one selected protocol.
- Valid route params before fetching in `EmailList.tsx`.

Do not rely only on frontend validation for data integrity.

## Unsafe HTML

Remote email HTML must be sanitized before rendering. `EmailViewDialog` uses:

- `useMemo`
- `DOMPurify.sanitize`
- `dangerouslySetInnerHTML` only after sanitization

Do not introduce unsanitized HTML rendering.

## Avoid

- Do not define duplicate backend response interfaces in pages.
- Do not use `any` for props, API responses, or caught errors in new code.
- Do not cast API results unless the type is defined in `api.ts` and the runtime behavior is understood.
- Do not widen `MailProtocol` to `string`.
- Do not use non-null assertions except for app bootstrapping cases that are guaranteed by `index.html`, such as `document.getElementById('root')!` in `main.tsx`.
