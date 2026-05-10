---
name: frontend-review
description: Use when reviewing the calendar-booking project's frontend (React/TypeScript/Mantine) for spec adherence, code quality, accessibility, and security — before merge, before release, or when auditing a PR.
---

# Frontend Review

Triggers an exhaustive, evidence-backed audit of the React/TypeScript/Mantine frontend in `frontend/` against the authoritative spec at `docs/business-description.md` and the TypeSpec API contract in `contract/`.

## How to use

Dispatch the `frontend-reviewer` subagent via the Agent tool:

- `subagent_type: frontend-reviewer`
- `description`: short, e.g. "Frontend code review"
- `prompt`: pass through any scoping the user gave (specific files, a PR number, a branch range, or "everything"). If the user gave no scope, ask the agent to review the entire `frontend/` source tree.

The subagent runs read-only. It will read the spec, the contract, and the source, and may run verification commands (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run gen:api` from `frontend/`).

## Returning the findings

Return the subagent's report **verbatim**. Do not re-summarise severity groupings, condense findings into bullets, or drop file:line citations — the structure (Executive summary → Stack and tooling → Findings by severity/dimension → v2 considerations → Verification log → Overall verdict) is the deliverable.

If the user asks for a follow-up (a fix, a deeper dive on one finding, a re-review after changes), dispatch the subagent again with the narrowed scope rather than answering from the previous report — the agent has more context than what's quoted back.
