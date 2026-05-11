# Phase 5: Code-Split Admin Routes + Route-Level Error Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lazy-load the three admin pages via `React.lazy` + `Suspense` and add per-branch route error boundaries (via pass-through routes) using react-router v7's `errorElement`, so the guest bundle shrinks and render errors no longer blank the page.

**Architecture:** A new ~20-line `RouteErrorElement` component reads `useRouteError()` and renders the existing `ErrorState` alert. Inside both top-level branches in `routes.tsx`, an intermediate "pass-through" route (`element: <Outlet />`) holds the `errorElement` so that on a leaf render error the pass-through is replaced — not the surrounding `<Layout>` / `<AdminLayout>` chrome. The three admin page imports become `React.lazy` calls behind a tiny `lazyNamed` helper, and `<AdminLayout>` wraps its `<Outlet />` in `<Suspense fallback={<Loader />}>`.

**Tech Stack:** React 19, TypeScript, react-router v7 (data router via `createBrowserRouter`), Mantine, vitest, Vite (Rolldown).

**Spec:** [`docs/superpowers/specs/2026-05-11-phase-5-code-split-and-route-error-boundaries-design.md`](../specs/2026-05-11-phase-5-code-split-and-route-error-boundaries-design.md)

**Predecessor:** PR-A on `claude/phase-5-hygiene` (commit `f7fdb2f` — h1 landmarks + Prettier sweep, pushed to origin, not yet merged).

---

## File-by-file summary

| File                                            | Action     | Responsibility                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/components/RouteErrorElement.tsx` | **Create** | Read `useRouteError()`; in dev `console.error` the raw error; render `<ErrorState title="Something went wrong" message=… onRetry=reload />`.                                                                                                                     |
| `frontend/src/test/RouteErrorElement.test.tsx`  | **Create** | TDD coverage: an `Error` throw renders title/message/Retry button; a non-`Error` throw renders the `"Unexpected error"` fallback.                                                                                                                                |
| `frontend/src/routes.tsx`                       | **Modify** | Add `Outlet` to the react-router import; add `RouteErrorElement` import; wrap each branch's children in an `element: <Outlet />` pass-through route with `errorElement: <RouteErrorElement />`; replace eager admin imports with `lazyNamed` `React.lazy` calls. |
| `frontend/src/components/AdminLayout.tsx`       | **Modify** | Add `Suspense` import from React, `Loader, Stack` from `@mantine/core`; wrap the existing `<Outlet />` (line 41) in `<Suspense fallback={<Stack align="center" mt="xl"><Loader /></Stack>}>`.                                                                    |
| `frontend/ROADMAP.md`                           | **Modify** | Tick the **Code-split admin routes** and **Route-level error boundary** boxes in the Phase 5 Tasks list; cross-reference the spec.                                                                                                                               |

No `package.json` changes. No new dev deps.

---

## Task 0: Branch setup

**Files:** none (git operations only)

- [ ] **Step 1: Confirm starting state**

  From this worktree, run:

  ```bash
  git status
  git log --oneline -3
  ```

  Expected: working tree clean; recent commits include `965c8a0` (Codex review fixes), `98ec78d` (initial spec), and the worktree's session branch.

- [ ] **Step 2: Fetch and create the implementation branch off `claude/phase-5-hygiene`**

  ```bash
  git fetch origin
  git checkout -b claude/phase-5-code-split claude/phase-5-hygiene
  ```

  Expected: new branch created at `f7fdb2f` (PR-A's commit). `git log --oneline -3` should show `f7fdb2f` at the top.

- [ ] **Step 3: Cherry-pick the spec + plan commits onto the new branch**

  Pick every commit on the session branch (`claude/charming-cray-03957d`) that isn't already on `claude/phase-5-hygiene`. As of 2026-05-11 that's three commits: initial spec, Codex-review-fix spec revision, and this implementation plan.

  ```bash
  git cherry-pick claude/phase-5-hygiene..claude/charming-cray-03957d
  ```

  Expected: clean cherry-pick (no conflicts — none of those files exist on `claude/phase-5-hygiene`). `git log --oneline -5` should now show, top-down:
  - `<new-sha>` Add Phase 5 implementation plan
  - `<new-sha>` Phase 5 design spec: address Codex review findings
  - `<new-sha>` Add Phase 5 design spec (code-split + route-level error boundary)
  - `f7fdb2f` Phase 5 hygiene: h1 landmarks + Prettier sweep
  - `80684c9` Merge pull request #11 from shimmeg/claude/phase-4-followup

- [ ] **Step 4: Sanity check — run merge gate**

  ```bash
  cd frontend
  npm run typecheck && npm run lint && npm test
  cd ..
  ```

  Expected: typecheck clean, lint clean, **89 tests pass** across 19 files. This is the green baseline.

---

## Task 1: `RouteErrorElement` component (TDD)

**Files:**

- Create: `frontend/src/test/RouteErrorElement.test.tsx`
- Create: `frontend/src/components/RouteErrorElement.tsx`

- [ ] **Step 1: Write the failing test**

  Create `frontend/src/test/RouteErrorElement.test.tsx`:

  ```tsx
  import { type ReactNode } from "react";
  import { describe, expect, it, vi, beforeEach } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { MantineProvider } from "@mantine/core";
  import { createMemoryRouter, RouterProvider } from "react-router";
  import { RouteErrorElement } from "../components/RouteErrorElement";

  function Boom(): never {
    throw new Error("boom");
  }

  function ThrowString(): never {
    throw "oops" as unknown as Error;
  }

  function renderRoute(element: ReactNode) {
    const router = createMemoryRouter(
      [{ path: "/", element, errorElement: <RouteErrorElement /> }],
      { initialEntries: ["/"] },
    );
    return render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>,
    );
  }

  describe("RouteErrorElement", () => {
    beforeEach(() => {
      // The test deliberately renders throwing components; suppress React's
      // noisy console.error output so the test log stays readable.
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("renders the ErrorState title, error message, and a Retry button when an Error is thrown", () => {
      renderRoute(<Boom />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong",
      );
      expect(screen.getByText("boom")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry/i }),
      ).toBeInTheDocument();
    });

    it('falls back to "Unexpected error" when a non-Error value is thrown', () => {
      renderRoute(<ThrowString />);
      expect(screen.getByText("Unexpected error")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test — expect it to FAIL**

  ```bash
  cd frontend && npx vitest run src/test/RouteErrorElement.test.tsx
  ```

  Expected: test fails with `Cannot find module '../components/RouteErrorElement'` (or similar resolve error). This proves the test is wired up and is gated on creating the component.

- [ ] **Step 3: Implement `RouteErrorElement`**

  Create `frontend/src/components/RouteErrorElement.tsx`:

  ```tsx
  import { useRouteError } from "react-router";
  import { ErrorState } from "./ErrorState";

  export function RouteErrorElement() {
    const error = useRouteError();
    if (import.meta.env.DEV) console.error("Route error:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return (
      <ErrorState
        title="Something went wrong"
        message={message}
        onRetry={() => window.location.reload()}
      />
    );
  }
  ```

- [ ] **Step 4: Run the test — expect it to PASS**

  ```bash
  npx vitest run src/test/RouteErrorElement.test.tsx
  ```

  Expected: 2 tests pass.

- [ ] **Step 5: Run typecheck and lint**

  ```bash
  npm run typecheck && npm run lint
  ```

  Expected: both clean.

- [ ] **Step 6: Commit**

  ```bash
  cd ..
  git add frontend/src/components/RouteErrorElement.tsx frontend/src/test/RouteErrorElement.test.tsx
  git commit -m "Add RouteErrorElement component + test

  Tiny component that reads useRouteError() and renders the existing
  ErrorState alert with a Retry button (action: window.location.reload()).
  In dev it also console.errors the raw error for debugging. Tests cover
  the Error branch and the non-Error fallback.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 2: Wire pass-through routes with `errorElement` in `routes.tsx`

This task adds the error boundaries only — admin pages stay eager-loaded. Splitting code into two commits (boundaries first, lazy second) keeps each diff small and bisectable.

**Files:**

- Modify: `frontend/src/routes.tsx` (whole-file change shown below — it's short)

- [ ] **Step 1: Replace `routes.tsx` with the new structure**

  Overwrite `frontend/src/routes.tsx` with:

  ```tsx
  import { createBrowserRouter, Navigate, Outlet } from "react-router";
  import { Layout } from "./components/Layout";
  import { AdminGate } from "./components/AdminGate";
  import { AdminLayout } from "./components/AdminLayout";
  import { RouteErrorElement } from "./components/RouteErrorElement";
  import { CatalogPage } from "./features/catalog/CatalogPage";
  import { SlotPickerPage } from "./features/slot-picker/SlotPickerPage";
  import { ConfirmPage } from "./features/booking/ConfirmPage";
  import { SuccessPage } from "./features/booking/SuccessPage";
  import { SettingsPage } from "./features/admin/SettingsPage";
  import { EventTypesPage } from "./features/admin/EventTypesPage";
  import { BookingsPage } from "./features/admin/BookingsPage";
  import { NotFoundPage } from "./features/NotFoundPage";

  export const router = createBrowserRouter([
    {
      element: <Layout />,
      children: [
        {
          // Pass-through route: hosts errorElement so guest Layout chrome survives child render errors.
          element: <Outlet />,
          errorElement: <RouteErrorElement />,
          children: [
            { path: "/", element: <CatalogPage /> },
            { path: "/events/:slug", element: <SlotPickerPage /> },
            { path: "/events/:slug/confirm", element: <ConfirmPage /> },
            { path: "/events/:slug/booked/:id", element: <SuccessPage /> },
          ],
        },
      ],
    },
    {
      path: "/admin",
      element: <AdminGate />,
      children: [
        {
          element: <AdminLayout />,
          children: [
            {
              // Pass-through route: hosts errorElement so admin AdminLayout chrome survives child render errors.
              element: <Outlet />,
              errorElement: <RouteErrorElement />,
              children: [
                { index: true, element: <Navigate to="settings" replace /> },
                { path: "settings", element: <SettingsPage /> },
                { path: "event-types", element: <EventTypesPage /> },
                { path: "bookings", element: <BookingsPage /> },
              ],
            },
          ],
        },
      ],
    },
    { path: "*", element: <NotFoundPage /> },
  ]);
  ```

- [ ] **Step 2: Run typecheck, lint, and the full test suite**

  ```bash
  cd frontend
  npm run typecheck && npm run lint && npm test
  ```

  Expected: typecheck clean, lint clean, **all 91 tests pass** (89 prior + 2 new from Task 1).

- [ ] **Step 3: Browser verification — guest branch chrome stays on throw**

  > Agentic workers: use the Claude Preview MCP (`preview_start`, `preview_eval`, `preview_snapshot`, `preview_screenshot`) instead of opening a real browser. Human workers: run `npm run dev` and visit the URLs.

  Temporarily edit `frontend/src/features/catalog/CatalogPage.tsx`: inside the returned JSX near the top of the rendered tree, insert an inline-throw expression: `{(() => { throw new Error('test - guest branch'); })()}`. This throws on render without disrupting the hook order.

  Visit `http://localhost:5173/`. **Expected:** the guest `<Layout>` shell renders (its top-bar brand mark visible), and inside the page body the `ErrorState` alert appears with title `Something went wrong`, message `test - guest branch`, and a `Retry` button.

  Visit `http://localhost:5173/admin/settings` (sign in with the admin token if prompted — see `AdminTokenModal`). **Expected:** admin shell renders normally; `SettingsPage` content shows. Branch isolation confirmed.

  **Revert the throw** in `CatalogPage.tsx` before proceeding. Confirm `/` renders the catalog normally.

- [ ] **Step 4: Browser verification — admin branch chrome stays on throw**

  Repeat Step 3 with the same inline-throw expression inside `frontend/src/features/admin/SettingsPage.tsx`.

  Visit `http://localhost:5173/admin/settings`. **Expected:** `AdminLayout` chrome (the top bar with brand mark, Settings / Event types / Bookings nav, Sign out button) stays visible, and inside the main container the `ErrorState` alert appears.

  Visit `http://localhost:5173/`. **Expected:** guest catalog renders normally.

  **Revert the throw** in `SettingsPage.tsx` before proceeding.

- [ ] **Step 5: Re-run tests after reverting**

  ```bash
  npm test
  ```

  Expected: 91 tests still pass.

- [ ] **Step 6: Commit**

  ```bash
  cd ..
  git add frontend/src/routes.tsx
  git commit -m "Add per-branch route error boundaries via pass-through routes

  Wire RouteErrorElement into routes.tsx by inserting an intermediate
  pass-through route (element: <Outlet />) inside each branch's layout
  and hosting errorElement on the pass-through. A leaf render error
  swaps the pass-through's Outlet for RouteErrorElement while the
  surrounding Layout / AdminGate+AdminLayout chrome stays mounted.
  Manually verified: throwing in CatalogPage keeps the guest header
  visible; throwing in SettingsPage keeps the admin nav visible.

  Admin pages still eager-loaded — code-splitting lands in the next commit.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3: Code-split admin pages + Suspense fallback in `AdminLayout`

**Files:**

- Modify: `frontend/src/routes.tsx` (replace 3 eager admin imports with `lazyNamed`)
- Modify: `frontend/src/components/AdminLayout.tsx:1-2,39-42` (Suspense wrap around `<Outlet />`)

- [ ] **Step 1: Convert admin imports to `lazyNamed` in `routes.tsx`**

  At the top of `frontend/src/routes.tsx`, change:

  ```tsx
  import { createBrowserRouter, Navigate, Outlet } from "react-router";
  import { Layout } from "./components/Layout";
  import { AdminGate } from "./components/AdminGate";
  import { AdminLayout } from "./components/AdminLayout";
  import { RouteErrorElement } from "./components/RouteErrorElement";
  import { CatalogPage } from "./features/catalog/CatalogPage";
  import { SlotPickerPage } from "./features/slot-picker/SlotPickerPage";
  import { ConfirmPage } from "./features/booking/ConfirmPage";
  import { SuccessPage } from "./features/booking/SuccessPage";
  import { SettingsPage } from "./features/admin/SettingsPage";
  import { EventTypesPage } from "./features/admin/EventTypesPage";
  import { BookingsPage } from "./features/admin/BookingsPage";
  import { NotFoundPage } from "./features/NotFoundPage";
  ```

  to:

  ```tsx
  import { type ComponentType, lazy } from "react";
  import { createBrowserRouter, Navigate, Outlet } from "react-router";
  import { Layout } from "./components/Layout";
  import { AdminGate } from "./components/AdminGate";
  import { AdminLayout } from "./components/AdminLayout";
  import { RouteErrorElement } from "./components/RouteErrorElement";
  import { CatalogPage } from "./features/catalog/CatalogPage";
  import { SlotPickerPage } from "./features/slot-picker/SlotPickerPage";
  import { ConfirmPage } from "./features/booking/ConfirmPage";
  import { SuccessPage } from "./features/booking/SuccessPage";
  import { NotFoundPage } from "./features/NotFoundPage";

  const lazyNamed = <K extends string>(
    loader: () => Promise<Record<K, ComponentType>>,
    name: K,
  ) => lazy(() => loader().then((m) => ({ default: m[name] })));

  const SettingsPage = lazyNamed(
    () => import("./features/admin/SettingsPage"),
    "SettingsPage",
  );
  const EventTypesPage = lazyNamed(
    () => import("./features/admin/EventTypesPage"),
    "EventTypesPage",
  );
  const BookingsPage = lazyNamed(
    () => import("./features/admin/BookingsPage"),
    "BookingsPage",
  );
  ```

  Note: the 3 eager admin imports are removed; the rest of `routes.tsx` (the `createBrowserRouter` call and pass-through structure) is unchanged.

- [ ] **Step 2: Add Suspense to `AdminLayout`**

  In `frontend/src/components/AdminLayout.tsx`:

  Change the imports at the top (currently lines 1-2):

  ```tsx
  import { AppShell, Button, Container, Group, Text } from "@mantine/core";
  import { Link, NavLink, Outlet, useNavigate } from "react-router";
  ```

  to:

  ```tsx
  import { Suspense } from "react";
  import {
    AppShell,
    Button,
    Container,
    Group,
    Loader,
    Stack,
    Text,
  } from "@mantine/core";
  import { Link, NavLink, Outlet, useNavigate } from "react-router";
  ```

  Then wrap the `<Outlet />` (currently line 41 inside `<Container size="lg">`). Change:

  ```tsx
  <AppShell.Main>
    <Container size="lg">
      <Outlet />
    </Container>
  </AppShell.Main>
  ```

  to:

  ```tsx
  <AppShell.Main>
    <Container size="lg">
      <Suspense
        fallback={
          <Stack align="center" mt="xl">
            <Loader />
          </Stack>
        }
      >
        <Outlet />
      </Suspense>
    </Container>
  </AppShell.Main>
  ```

- [ ] **Step 3: Run typecheck, lint, tests**

  ```bash
  cd frontend
  npm run typecheck && npm run lint && npm test
  ```

  Expected: all green. **91 tests pass.** (If the `AdminLayout.test.tsx` test surfaces a Suspense-related issue, the test renders a static `<div>settings page</div>` for the route element — Suspense around a non-suspending child renders synchronously, so the test should be unaffected. If it fails, check whether `waitFor` is needed around the `expect(screen.getByText('settings page'))` assertion.)

- [ ] **Step 4: Build and verify chunk split**

  ```bash
  npm run build
  ls -la dist/assets/
  ```

  Expected: `dist/assets/` contains the main JS bundle plus at least 3 additional JS files (one per admin page). The main chunk should be smaller than the prior 724 KB baseline.

  **HARD PASS:** admin pages live in separate chunks. If only a single JS file is emitted, `React.lazy` is not splitting — check that imports use the dynamic `import('./...')` form (not regular `import ... from`).

  **SOFT TARGET:** the Vite "chunks larger than 500 kB" warning is gone. If it persists, that's expected (Mantine + Tabler shared code) and is the input to the separate bundle-analyzer Phase 5 task. Note the new main chunk size — it'll go in the PR description.

- [ ] **Step 5: Browser verification — chunks load on demand**

  > Agentic workers: use the Claude Preview MCP. `preview_start` to launch the dev server, then `preview_network` to inspect requests as you navigate via `preview_click` / `preview_eval`. Human workers: `npm run dev` and DevTools Network panel.

  With the dev server running, load `http://localhost:5173/` and inspect the Network panel (filter: `JS`).

  **Expected:** the main JS chunk loads, plus Mantine/Tabler/React. **No admin page chunk loads.**

  Navigate to `/admin/settings` (sign in if prompted). **Expected:** a new JS chunk fetch appears in Network. The admin header (brand mark + nav) renders immediately; the centered `<Loader />` flashes briefly before `SettingsPage` content paints. Repeat for `/admin/event-types` and `/admin/bookings` — each first visit pulls a new chunk; second visit is cached (no new fetch).

- [ ] **Step 6: Commit**

  ```bash
  cd ..
  git add frontend/src/routes.tsx frontend/src/components/AdminLayout.tsx
  git commit -m "Code-split admin routes via React.lazy + Suspense

  Convert SettingsPage, EventTypesPage, and BookingsPage imports to
  React.lazy via a small lazyNamed helper (the page files use named
  exports, not defaults). Wrap AdminLayout's Outlet in a Suspense
  boundary whose fallback is a centered Mantine Loader, so the admin
  header stays visible while a page chunk loads.

  Expected effect: the guest entry chunk on / no longer includes the
  three admin pages' code, their forms, modals, or Tabler icon imports.
  Verified by inspecting dist/assets/ (4+ JS files) and by browser
  Network panel (admin chunks load on first /admin/* navigation only).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4: ROADMAP update + final merge gate + push

**Files:**

- Modify: `frontend/ROADMAP.md` (tick 2 Phase 5 boxes, add cross-reference)

- [ ] **Step 1: Read the current Phase 5 Tasks section in ROADMAP.md**

  ```bash
  grep -n "Code-split admin routes\|Route-level error boundary" frontend/ROADMAP.md
  ```

  The two relevant lines are in the Phase 5 § "Tasks" block (approximately lines 197-198 in the current ROADMAP, though PR-A's edits may have shifted them — confirm by reading the file).

- [ ] **Step 2: Tick the two boxes**

  Change:

  ```markdown
  - [ ] **Code-split admin routes** — `React.lazy` + `Suspense` so the guest bundle stays small (current single bundle is ~563 KB minified).
  - [ ] **Route-level error boundary** — single `ErrorBoundary` wrapping `<Outlet />` to catch render errors per route.
  ```

  to:

  ```markdown
  - [x] **Code-split admin routes** — `React.lazy` + `Suspense`. Admin pages now ship as separate chunks; guest entry no longer pulls them. See [Phase 5 design spec](../docs/superpowers/specs/2026-05-11-phase-5-code-split-and-route-error-boundaries-design.md).
  - [x] **Route-level error boundary** — `errorElement` on an intermediate pass-through route inside each branch, so a leaf render error renders `<ErrorState>` inside the surrounding layout chrome rather than blanking the page. See [Phase 5 design spec](../docs/superpowers/specs/2026-05-11-phase-5-code-split-and-route-error-boundaries-design.md).
  ```

- [ ] **Step 3: Final merge gate — full**

  ```bash
  cd contract && npm test && cd ..
  cd frontend
  npm run typecheck && npm run lint && npm test && npm run build
  npx prettier --check .
  cd ..
  ```

  Expected: all green.
  - contract: 2/2 tests pass.
  - frontend: typecheck clean, lint clean, **91 tests pass** (89 + 2 new), build emits split chunks, prettier check clean.

- [ ] **Step 4: Commit the ROADMAP tick**

  ```bash
  git add frontend/ROADMAP.md
  git commit -m "ROADMAP: tick Phase 5 code-split and route-error-boundary boxes

  Cross-reference the design spec from both tasks. The remaining
  Phase 5 Tasks list items (loading skeletons, mobile responsive
  pass, dark mode toggle, accessibility audit, test coverage
  expansion, CI workflow, bundle analyzer, @example decorators)
  are still open — each is its own follow-up PR per the
  ROADMAP's 'These are independent tasks' note.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 5: Inspect the final commit graph**

  ```bash
  git log --oneline main..HEAD
  ```

  Expected (top-down):
  - `<sha>` ROADMAP: tick Phase 5 code-split and route-error-boundary boxes
  - `<sha>` Code-split admin routes via React.lazy + Suspense
  - `<sha>` Add per-branch route error boundaries via pass-through routes
  - `<sha>` Add RouteErrorElement component + test
  - `<sha>` Add Phase 5 implementation plan
  - `<sha>` Phase 5 design spec: address Codex review findings
  - `<sha>` Add Phase 5 design spec (code-split + route-level error boundary)
  - `f7fdb2f` Phase 5 hygiene: h1 landmarks + Prettier sweep

  8 commits ahead of main. Once PR-A merges, this branch can be rebased onto main and the last item drops out; the rest stay.

- [ ] **Step 6: Push branch (do NOT auto-open PR — leave that to the user)**

  ```bash
  git push -u origin claude/phase-5-code-split
  ```

  Expected: branch pushed with tracking set. Output shows the GitHub URL the user can visit to open the PR.

- [ ] **Step 7: Report final state to the user**

  Summarize:
  - branch name + commit count + push status
  - what's in the branch (PR-A's hygiene work, spec, impl)
  - merge gate results (typecheck/lint/test/build/prettier/contract)
  - new main chunk size from `dist/assets/` (record it)
  - the GitHub URL for opening the PR

  Do not run `gh pr create` — the user opens PRs manually (confirmed earlier in the session).

---

## Verification summary (end-to-end after Task 4)

After all tasks complete, the following should be true. Treat each as a final assertion:

1. **Tests:** `cd frontend && npm test` → 91 tests pass.
2. **Build:** `npm run build` → 4+ JS files in `dist/assets/`; main chunk smaller than 724 KB.
3. **Lint / format / typecheck:** all clean.
4. **Browser preview, guest entry `/`:** Network shows main + Mantine/Tabler only; no admin chunks.
5. **Browser preview, `/admin/settings`:** admin chunk fetches; Loader flashes briefly; admin nav stays mounted.
6. **Branch:** `claude/phase-5-code-split` pushed; 7 commits ahead of main; PR not yet opened.

If any step fails, fix root cause — do not relax assertions to make a step pass.
