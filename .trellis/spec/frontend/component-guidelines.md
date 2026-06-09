# Component Guidelines

Frontend components are React function components written in TypeScript.

Reference files:

- `frontend/src/pages/AccountList.tsx`
- `frontend/src/pages/EmailList.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/components/ImportDialog.tsx`
- `frontend/src/components/ExportDialog.tsx`
- `frontend/src/components/EmailViewDialog.tsx`
- `frontend/src/components/PlatformUsageDialog.tsx`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/dialog.tsx`

## Component Shape

Business components use named exports:

```tsx
export function ImportDialog({ open, onOpenChange, onImport, onTestProtocol }: Props) {
  ...
}
```

`App.tsx` is the only current default-export app component.

For multi-prop business components, define a local `interface Props` near the top of the file. Use precise callback types, especially for async operations. `ImportDialog` is the reference for callback props that return `Promise`.

Small local helpers are acceptable inside page files when they are only used there:

- `MaskedField` and `TruncatedField` in `AccountList.tsx`
- `formatReceivedTime` in `EmailList.tsx` and `EmailViewDialog.tsx`
- `errorMessage(error: unknown)` in files that catch errors

If a helper becomes shared or testable, move it to `frontend/src/lib/`.

## Controlled Dialogs

Business dialogs use controlled open state:

- `open: boolean`
- `onOpenChange: (open: boolean) => void`

Examples:

- `ImportDialog`
- `ExportDialog`
- `EmailViewDialog`
- `PlatformUsageDialog`
- `PlatformFilterDialog`

Dialogs should receive data and callback props from their owning page. They may own temporary local input state such as separators, search text, selected IDs, loading flags, or copied state.

## Styling

Use Tailwind utility classes and existing UI primitives:

- `Button`, `Input`, `Textarea`, `Table`, `Card`, `Badge`, and `Dialog` from `@/components/ui/...`
- `cn()` when conditionally merging class names inside reusable primitives or components.
- `lucide-react` icons for action buttons and labels.
- Existing theme tokens such as `bg-background`, `text-muted-foreground`, `border`, `primary`, `destructive`, and `muted`.

The app uses a restrained operational-tool layout: tables, compact controls, cards for main screens/dialog framing, and dense row actions. New product screens should match `AccountList.tsx` and `EmailList.tsx`.

Use truncation and titles for long account secrets, email addresses, senders, and subjects:

- `truncate`
- `max-w-[...]`
- `title={value}`
- `font-mono text-xs` for secret-like values

## UI Primitives

Base primitives in `frontend/src/components/ui/` are shadcn-style wrappers. Follow their pattern when adding a new primitive:

- `React.forwardRef`
- `displayName`
- Radix primitive composition when appropriate
- `class-variance-authority` for variants
- `cn()` for class merging
- Keep product-specific behavior out of the primitive

Do not rewrite a shadcn primitive in a page file. Import and compose the primitive.

## User Feedback

Use `sonner` toast notifications for async success and failure feedback.

Current examples:

- Login success/failure in `Login.tsx`.
- Account import and export warnings in `AccountList.tsx` and `ImportDialog.tsx`.
- Platform save success/failure in `PlatformUsageDialog.tsx`.
- Copy success/failure in `CopyBtn.tsx`.

Keep error extraction consistent. Prefer:

```ts
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
```

Avoid new `catch (e: any)` blocks.

## Accessibility And Safety

- Use visible labels or `aria-label` for inputs. Platform search inputs already use `aria-label`.
- Dialogs should include `DialogTitle`.
- Icon-only buttons should have nearby context, a title, or an accessible label when the visual meaning is not obvious.
- Never render remote email HTML without sanitizing it first. `EmailViewDialog` uses `DOMPurify.sanitize()` before `dangerouslySetInnerHTML`.
- Keep destructive actions explicit. Account deletion currently uses `confirm(...)` before calling the API.

## Avoid

- Do not call backend APIs directly in base UI components.
- Do not introduce raw `dangerouslySetInnerHTML` without DOMPurify.
- Do not duplicate copy-to-clipboard fallback logic when `CopyBtn` can be reused.
- Do not add new `any` usage for caught errors or props.
- Do not hide loading states for user-triggered operations. Existing buttons disable or show loading labels during async work.
