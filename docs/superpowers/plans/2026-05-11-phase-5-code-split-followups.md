# Phase 5 code-split + route-error-boundary — follow-ups (deferred from PR #12)

Items that came up during the implementation and reviews of PR #12 but were moved out of scope to keep that PR minimal. Each is independently shippable.

## From the per-task code reviews

### 1. Vitest `restoreMocks: true` — repo-wide test infrastructure polish

The Task 1 code review on `RouteErrorElement.test.tsx` (which uses `vi.spyOn(console, 'error').mockImplementation(...)` in `beforeEach`) flagged that without `vi.restoreAllMocks()` (or the global `restoreMocks: true` Vitest option), spies stack across tests within a file rather than restoring between them.

**Effect today:** harmless — `RouteErrorElement.test.tsx` is the only `vi.spyOn` in the entire suite, and both its tests want the same suppression.

**Risk:** if a future test wants to assert on `console.error`, or any other test starts using `vi.spyOn`, the missing restore becomes a footgun.

**Fix:**
```ts
// frontend/vite.config.ts — inside the existing test: { ... } block
test: {
  // ...existing options
  restoreMocks: true,
}
```

One line. Confirmed safe against the existing suite: every other test uses module-scope `vi.mock(...)` (unaffected by `restoreMocks`) and `vi.fn()` mocks reset via `mockReset()` in their own `beforeEach`. There are zero spies that need to persist across tests within a file.

**Recommended owner:** drop into the next test-coverage-expansion or CI workflow PR — both touch test infrastructure naturally.

### 2. Bundle analyzer + Tabler icon trim — the 165 KB shared `ErrorState-*.js` chunk

The Task 3 build emits a 165 KB / 53 KB gzip shared chunk named `ErrorState-*.js` that Vite extracted because `ErrorState` is reached from every page in the import graph (eager guest pages + the three lazy admin pages + `RouteErrorElement`). The chunk's size is dominated by what `ErrorState` transitively imports — almost certainly `@mantine/core`'s Alert/Button/Stack/Text + `@tabler/icons-react`'s `IconAlertTriangle`.

This is exactly the kind of finding that the already-planned Phase 5 task **"Bundle analysis — `rollup-plugin-visualizer` once to spot large deps; consider trimming Tabler icons import"** is designed to attack. Likely fixes once the visualizer lands:
- Deep-import individual Tabler icons (`from '@tabler/icons-react/dist/esm/icons/IconAlertTriangle.mjs'` or whatever the exact path is in the current package version) instead of the barrel import that pulls the whole icon set.
- Move shared widget code (Stack/Group/Container/Button) into a deliberate chunk strategy instead of letting Rollup pick.

Document the baseline now: **after Phase 5 code-split, main chunk is 353 KB, the shared ErrorState chunk is 165 KB.** The bundle-analyzer PR should compare against these numbers.

### 3. Suspense fallback could reserve vertical space — minor layout shift on chunk swap

[`frontend/src/components/AdminLayout.tsx`](../../../frontend/src/components/AdminLayout.tsx)'s fallback is `<Stack align="center" mt="xl"><Loader /></Stack>` — about 40 px tall. When the admin page chunk resolves, the content (tables, forms) is much taller, so there's a perceptible jump.

**Polish:** `minHeight="60vh"` on the Stack so the fallback reserves the eventual content's vertical space. Pairs with the "Loading skeletons" Phase 5 task (which will replace this Loader entirely on the catalog/slot-picker side).

### 4. Permanent integration test for "leaf render error preserves layout shell"

The verification of the pass-through pattern is currently done by temporarily inserting `throw new Error('test')` in a leaf component (per Task 2 of the plan), browser-checking that chrome stays mounted, and reverting. The chrome-preservation invariant is the load-bearing detail of this entire PR and has no automated regression test.

Adding an integration test (`createMemoryRouter` with a throwing element + a layout wrapper, asserting the layout's testid/role is still in the DOM alongside the `ErrorState`) would pin the invariant for CI. Skipped from PR #12 because `createMemoryRouter` with lazy children is fiddly to test in vitest — the realistic scope of this test is "non-lazy throwing leaf inside a layout with a pass-through" which IS straightforward to test.

**Estimated size:** ~40 lines, one new test file.

## From the close-out commit (dropped from PR #12 scope)

### 5. Prettier sweep across the repo's accumulated unformatted files

A repo-wide `prettier --write` sweep was bundled into PR #12's original close-out commit but moved out to keep that PR's diff focused. The following files were modified by prettier and reverted out of scope:

```
.claude/agents/frontend-reviewer.md
.github/workflows/hexlet-check.yml
README.md
docs/business-description.md
docs/superpowers/plans/2026-05-09-admin-token-and-settings.md
docs/superpowers/plans/2026-05-10-admin-bookings.md
docs/superpowers/plans/2026-05-10-admin-event-types.md
docs/superpowers/specs/2026-05-09-admin-token-and-settings-design.md
docs/superpowers/specs/2026-05-10-admin-bookings-design.md
docs/superpowers/specs/2026-05-10-admin-event-types-design.md
```

These accumulated formatting drift over prior phases (mostly markdown emphasis style `*x*` → `_x_`, table column padding, quote normalization). The `frontend/`-scoped `prettier --check .` doesn't catch them because they're outside `frontend/`. A future PR can either:
- Run `npx prettier --write .` from repo root, or
- Wire `prettier --check .` from repo root into the future CI workflow (the existing Phase 5 ROADMAP item) so this never accumulates again.

## Already documented in ROADMAP — kept for completeness

The remaining Phase 5 items unstarted as of 2026-05-11 (all in [`frontend/ROADMAP.md`](../../../frontend/ROADMAP.md) Phase 5 § Tasks):
- Loading skeletons
- Mobile responsive pass
- Dark mode toggle
- Accessibility audit (focus management, slot grid keyboard nav, ARIA on day pills + selected-slot, `@axe-core/react`)
- Test coverage expansion (confirm form 400/404, slot picker URL round-trip, success page cache vs no-state, optional Playwright E2E)
- CI workflow (`.github/workflows/frontend.yml`)
- Bundle analysis (see item 2 above for the concrete first target)
- `@example` decorators on admin operations in `contract/`

Each is independently shippable per the ROADMAP's "These are independent tasks; each can be its own small PR" note.

---

**Source:** PR [#12](https://github.com/shimmeg/ai-for-developers-project-386/pull/12) — Phase 5: code-split admin routes + route-level error boundaries. Items 1-4 surfaced in the per-task and final code reviews of that PR; item 5 was a discretionary Prettier cleanup moved out at user request to keep PR #12's scope minimal.

**Removed during a final Codex pass:** an earlier draft of this doc had a 6th item ("`lazyNamed`'s `ComponentType` generic could be tighter") flagging a supposed prop-safety risk. Codex correctly pointed out that `ComponentType` defaults to `ComponentType<{}>`, which already rejects prop-requiring components via TS contravariance — the risk doesn't exist. The original Task 3 and final reviewer notes claiming otherwise were inaccurate.
