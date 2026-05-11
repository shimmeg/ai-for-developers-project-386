# Phase 5 — Code-split admin routes + route-level error boundaries (design)

**Status:** approved (2026-05-11). Implementation lands on a fresh branch off `claude/phase-5-hygiene` (e.g. `claude/phase-5-code-split`) so PR-A stays a pure-hygiene PR; this PR will be rebased onto `main` once PR-A merges.
**Predecessor:** PR-A (Phase 5 hygiene: h1 landmarks + Prettier sweep) — commit `f7fdb2f` on `claude/phase-5-hygiene`, pushed; PR to be opened by the user. PR-A modifies [`AdminLayout.tsx`](../../../frontend/src/components/AdminLayout.tsx) (brand-mark demotion), and this PR also edits the same file (Suspense wrap), so branching off `claude/phase-5-hygiene` keeps the two edits cleanly stacked.

## Context

The Phase 4 admin surface is shipped. The single Vite bundle is currently **724 KB minified / 220 KB gzipped** (run output from `npm run build` on `claude/phase-5-hygiene`, 2026-05-11) — well over the Rolldown 500 KB warning threshold. Three of the four heaviest contributors are admin-only: [`EventTypesPage`](../../../frontend/src/features/admin/EventTypesPage.tsx), [`SettingsPage`](../../../frontend/src/features/admin/SettingsPage.tsx), and [`BookingsPage`](../../../frontend/src/features/admin/BookingsPage.tsx) plus their Mantine form widgets, modals, and Tabler icon imports. Guest users — the dominant traffic shape for a booking link — never hit `/admin/*`, so they should not pay the download cost.

Separately, the app currently has **no route-level error boundary**: if any route's render throws, the whole `<RouterProvider>` tree unmounts and the user sees a blank page. The friendly [`ErrorState`](../../../frontend/src/components/ErrorState.tsx) alert already exists; it's only wired into per-query loading states inside individual pages, not at the route layer.

Phase 5 in [`frontend/ROADMAP.md`](../../../frontend/ROADMAP.md) names both items as separate tasks. They share scaffolding (both edit [`routes.tsx`](../../../frontend/src/routes.tsx) and add a tiny new component), so the ROADMAP's "each task is its own small PR" guideline is honored more cleanly by bundling them into a single PR than by splitting routes.tsx changes across two.

## Goals

- **Hard requirement:** The Vite build emits a separate JS chunk for each of the three admin pages; the initial chunk loaded on `/` no longer contains those pages' code. Verify by inspecting `dist/assets/`.
- **Soft target:** the "chunks larger than 500 KB" Vite warning disappears. If shared deps (Mantine, Tabler) keep the main chunk above the threshold even after admin splitting, that's expected and is the input to the separate "bundle analyzer + icon trim" Phase 5 task — record the new main chunk size in the PR description so that follow-up has a baseline.
- Admin page chunks load on-demand when the user first navigates under `/admin/*`, with a centered `<Loader />` Suspense fallback inside the existing admin chrome (`<AdminLayout>` header stays visible).
- A render error in any guest route shows a friendly [`ErrorState`](../../../frontend/src/components/ErrorState.tsx) with a Retry button (action: full page reload) instead of a blank screen — and the surrounding layout chrome (`<Layout>` for guest, `<AdminGate>` + `<AdminLayout>` for admin) stays mounted so the user keeps the header/nav. A render error in one branch must not tear down the other branch's shell.
- Existing 89 frontend tests pass unchanged. One new test covers `<RouteErrorElement>` rendering.

## Non-goals

- Lazy-loading guest pages. Catalog → SlotPicker → Confirm → Success is the hot path; introducing a chunk fetch on each step costs more UX than the bundle reduction is worth.
- Loading skeletons replacing the spinner. Listed separately in the Phase 5 ROADMAP; a `<Loader />` is the placeholder for now.
- Bundle analyzer + Tabler-icon-import trim. Also separate Phase 5 task; we'll see how much room is left after code-splitting before deciding whether icon trimming is still worthwhile.
- Custom React `<ErrorBoundary>` class. React Router v7's built-in `errorElement` catches render errors (including failed `React.lazy` imports), which is all we need.
- Wiring `errorElement` on `<NotFoundPage />` — a single-component static page with no async work; the chance of a render error is negligible.

## Decisions (settled in brainstorming)

| Question              | Choice                                                                                                                                                                                                     | Reason                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lazy scope            | **Admin pages only**                                                                                                                                                                                       | Matches the ROADMAP's literal ask; biggest perf win per LOC; guest hot path stays sync.                                                                                                                                                                                                                                                                                                                                          |
| Error-boundary scope  | **Per-branch**, attached to an intermediate pass-through route (an `element: <Outlet />` route) _inside_ each branch's layout, not on the layout route itself                                              | When a child route throws, react-router replaces the _errored route's element_ with the `errorElement`. If `errorElement` is on `<Layout>` or `<AdminLayout>`, that layout's element gets swapped out and the chrome is lost. Putting it on a pass-through route inside the layout means the pass-through's `<Outlet />` is swapped out — layout chrome stays mounted, error renders in the slot where the leaf page would have. |
| Lazy syntax           | **`React.lazy` + `Suspense`** via a small `lazyNamed` helper                                                                                                                                               | Page files use named exports; a 3-line helper avoids three repetitions of `.then((m) => ({ default: m.X }))`.                                                                                                                                                                                                                                                                                                                    |
| Suspense placement    | **Inside [`<AdminLayout>`](../../../frontend/src/components/AdminLayout.tsx)** around its `<Outlet />` (which now nests the pass-through, which nests the lazy leaf)                                       | Suspense bubbles through nested Outlets, so a single Suspense at the AdminLayout level catches lazy children regardless of the pass-through. Keeps the admin header visible while the page chunk loads.                                                                                                                                                                                                                          |
| Error UI              | **Reuse `<ErrorState>` as-is** with `onRetry={() => window.location.reload()}`. Button text stays the component's default `"Retry"` — semantically correct and avoids a one-off API change just to relabel | Already-shipped component, already a11y-correct (`role="alert"`); no new visual primitives. The action is a reload; the label is "Retry"; users understand both readings.                                                                                                                                                                                                                                                        |
| Error message in prod | **`error instanceof Error ? error.message : 'Unexpected error'`**, with `console.error(rawError)` in dev only                                                                                              | Don't leak stack traces or internal types to the UI; keep debug visibility in dev.                                                                                                                                                                                                                                                                                                                                               |

## Architecture

### Routes structure (after)

```tsx
// frontend/src/routes.tsx
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
// ... existing imports

const lazyNamed = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const SettingsPage = lazyNamed(() => import('./features/admin/SettingsPage'), 'SettingsPage');
const EventTypesPage = lazyNamed(() => import('./features/admin/EventTypesPage'), 'EventTypesPage');
const BookingsPage = lazyNamed(() => import('./features/admin/BookingsPage'), 'BookingsPage');

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        // Pass-through route — hosts errorElement so guest layout chrome survives child render errors.
        element: <Outlet />,
        errorElement: <RouteErrorElement />,
        children: [
          { path: '/', element: <CatalogPage /> },
          { path: '/events/:slug', element: <SlotPickerPage /> },
          { path: '/events/:slug/confirm', element: <ConfirmPage /> },
          { path: '/events/:slug/booked/:id', element: <SuccessPage /> },
        ],
      },
    ],
  },
  {
    path: '/admin',
    element: <AdminGate />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            // Pass-through route — hosts errorElement so admin layout chrome survives child render errors.
            element: <Outlet />,
            errorElement: <RouteErrorElement />,
            children: [
              { index: true, element: <Navigate to="settings" replace /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'event-types', element: <EventTypesPage /> },
              { path: 'bookings', element: <BookingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
```

**Why the pass-through layer:** when a leaf route throws, react-router walks up to the nearest `errorElement` and renders it _in place of that route's element_. If `errorElement` lived on the `<Layout>` / `<AdminGate>` route, those layouts would be unmounted and replaced by the bare `<ErrorState>` alert — chrome gone. Putting it one level below, on a route whose only job is to render `<Outlet />`, means the pass-through's element (an `Outlet`) is the thing that gets swapped to the error UI — and the parent layout, sitting one level above, keeps rendering normally.

### `<AdminLayout>` Suspense wrapping

The current shell renders `<Outlet />` directly inside the admin chrome. Wrap it:

```tsx
// frontend/src/components/AdminLayout.tsx — relevant fragment
<Suspense
  fallback={
    <Stack align="center" mt="xl">
      <Loader />
    </Stack>
  }
>
  <Outlet />
</Suspense>
```

This keeps the header + nav visible while the admin page chunk loads. Guest [`<Layout>`](../../../frontend/src/components/Layout.tsx) is untouched — no lazy children means no Suspense needed.

### New component: `<RouteErrorElement>`

```tsx
// frontend/src/components/RouteErrorElement.tsx
import { useRouteError } from 'react-router';
import { ErrorState } from './ErrorState';

export function RouteErrorElement() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error('Route error:', error);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return (
    <ErrorState
      title="Something went wrong"
      message={message}
      onRetry={() => window.location.reload()}
    />
  );
}
```

~20 lines. Renders inside whichever branch's layout shell remains around it (Layout for guest, AdminGate→AdminLayout for admin), so the header/chrome is preserved.

### File changes summary

| File                                                                                                      | Change                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`frontend/src/routes.tsx`](../../../frontend/src/routes.tsx)                                             | Replace 3 eager admin imports with `lazyNamed`; import `Outlet`; insert one pass-through route inside each branch (guest and admin) whose `errorElement` is `<RouteErrorElement />`. |
| [`frontend/src/components/AdminLayout.tsx`](../../../frontend/src/components/AdminLayout.tsx)             | Wrap `<Outlet />` in `<Suspense fallback={…}>`.                                                                                                                                      |
| [`frontend/src/components/RouteErrorElement.tsx`](../../../frontend/src/components/RouteErrorElement.tsx) | New, ~20 lines.                                                                                                                                                                      |
| [`frontend/src/test/RouteErrorElement.test.tsx`](../../../frontend/src/test/RouteErrorElement.test.tsx)   | New, ~30 lines.                                                                                                                                                                      |
| [`frontend/ROADMAP.md`](../../../frontend/ROADMAP.md)                                                     | Tick the **Code-split admin routes** and **Route-level error boundary** boxes; cross-reference this spec.                                                                            |

No `package.json` changes — `react-router`, `@mantine/core`, `@tabler/icons-react` already provide everything needed.

## Testing

**Existing tests (89 across 19 files):** must pass unchanged. Page-level test files render components directly inside `MantineProvider` + `QueryClientProvider` and do not import `routes.tsx`, so the lazy wrapping is invisible to them. Confirmed before implementation by `grep -rn "from .*routes" frontend/src/test`.

**New test — `RouteErrorElement.test.tsx`:**

- Use `createMemoryRouter` (the data-router factory) **not** `<MemoryRouter>` — the component form does not honor route-object `errorElement`. Sketch:

  ```tsx
  import { createMemoryRouter, RouterProvider } from 'react-router';
  import { MantineProvider } from '@mantine/core';
  import { render, screen } from '@testing-library/react';
  import { RouteErrorElement } from '../components/RouteErrorElement';

  function Boom(): never {
    throw new Error('boom');
  }

  function renderRoute(element: React.ReactNode) {
    const router = createMemoryRouter(
      [{ path: '/', element, errorElement: <RouteErrorElement /> }],
      { initialEntries: ['/'] },
    );
    return render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>,
    );
  }
  ```

- Case 1: `renderRoute(<Boom />)` → assert `screen.getByRole('alert')` (the `ErrorState` `Alert`) contains title `"Something went wrong"` and the message `"boom"`, and `screen.getByRole('button', { name: /retry/i })` is present.
- Case 2: a throwing element whose throw value is a non-`Error` (`function ThrowString(): never { throw 'oops' as unknown as Error }`) → assert the fallback message `"Unexpected error"` renders.
- (The button label is `Retry` — `ErrorState`'s hard-coded text. The fact that `onRetry` is a `window.location.reload()` is a separate concern from the label.)

**Skipped (intentionally):** an integration test that exercises real `React.lazy` chunk loading. vitest + Vite dynamic imports can be made to work but the test is fragile and the browser verification below is both faster and more meaningful.

## Verification

After implementation, run from the worktree:

```bash
cd frontend
npm run typecheck && npm run lint && npm test && npm run build
npx prettier --check .
cd ../contract && npm test
```

All must be green. Then:

1. **Inspect `frontend/dist/assets/` — HARD PASS:** the directory contains at least 4 JS files (the main bundle plus one per admin page). If admin page modules are not in separate files, the code-split half of the task is not complete.
2. **Bundle-warning check — SOFT TARGET:** the Vite "chunks larger than 500 kB" warning is ideally gone. If it persists (shared Mantine + Tabler code still pushes the main chunk over the threshold), note the new main chunk size in the PR description. This is expected and is the input to the separate Phase 5 task that adds `rollup-plugin-visualizer` and trims the Tabler icons import — do not block this PR on it.
3. **Browser preview (`/` guest entry):** Network panel shows only the main JS chunk + CSS + Mantine/icons. No admin chunk on initial load.
4. **Browser preview (navigate to `/admin/settings`):** a new chunk fetch appears in Network; the admin header renders immediately, and the centered `<Loader />` flashes briefly before the page content paints. Repeat for `event-types` and `bookings` — each first visit pulls a new chunk; second visit is cached.
5. **Per-branch error isolation (dev-only spot check, reverted before commit):** temporarily add `throw new Error('test')` inside `<CatalogPage>` render → `/` shows `<ErrorState>` _inside_ the guest `<Layout>` shell (header still visible), and `/admin/settings` still renders normally. Repeat with the throw inside `<SettingsPage>` → `/admin/settings` shows `<ErrorState>` _inside_ the `<AdminLayout>` chrome (admin header + nav still visible). Revert both throws.

## Risk register

| Risk                                                              | Likelihood                                                                                  | Mitigation                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lazy chunk 404 mid-session after a deploy                         | low (no production deploys yet; concern is theoretical)                                     | `errorElement` catches the failed-import error and surfaces `<ErrorState>`; clicking the Retry button calls `window.location.reload()` and pulls the fresh bundle. |
| Suspense fallback flashes annoyingly on fast admin navigation     | low (chunks cache after first load)                                                         | Skeletons (separate Phase 5 task) will improve this; for now, accept the brief Loader.                                                                             |
| Existing tests start importing `routes.tsx` later and break       | low                                                                                         | The grep above is documented in the testing section; if a future test does need `routes.tsx`, `waitFor` + `findBy` is the standard fix.                            |
| `useRouteError()` returns something neither `Error` nor primitive | very low (only triggers if a router-thrown `Response` reaches us, and we don't use loaders) | Fallback `'Unexpected error'` message; `console.error` in dev surfaces the raw shape.                                                                              |
| `import.meta.env.DEV` not type-narrowed                           | none                                                                                        | `tsconfig.app.json` has `"types": ["vite/client"]`, which ships the `ImportMetaEnv` augmentation.                                                                  |

## Cross-references

- [`frontend/ROADMAP.md`](../../../frontend/ROADMAP.md) — Phase 5 § "Code-split admin routes" and § "Route-level error boundary"
- [`frontend/src/routes.tsx`](../../../frontend/src/routes.tsx) — the file this change centers on
- [`frontend/src/components/ErrorState.tsx`](../../../frontend/src/components/ErrorState.tsx) — reused as-is
- [PR-A on `claude/phase-5-hygiene`](https://github.com/shimmeg/ai-for-developers-project-386/tree/claude/phase-5-hygiene) — predecessor commit that lands h1 landmarks + Prettier sweep
