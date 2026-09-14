# Private-aware Profile Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and publish a repository-local lifetime GitHub stats card whose rank inputs include the account's authenticated public + private contribution history.

**Architecture:** Extend the existing `scripts/generate-activity-graph.mjs` pipeline rather than adding a second renderer. Extract deterministic rank/validation/SVG helpers into `scripts/profile-stats-core.mjs`, test them with Node's built-in test runner, then wire the generator to require `PROFILE_STATS_TOKEN`, verify the authenticated viewer, fetch followers and yearly contribution windows, render a borderless rank card, and refresh it through a scheduled GitHub Action.

**Tech Stack:** Node.js 20+ ESM, GitHub GraphQL API, GitHub Actions, SVG, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-14-private-aware-profile-stats-design.md`

## Global Constraints

- Rank levels and weighting must match GitHub Readme Stats: commits 2/1000, PRs 3/50, issues 1/25, reviews 1/2, stars 4/50, followers 1/10.
- Lifetime contribution totals are aggregated from account creation to now in <=1-year `contributionsCollection` windows.
- Private repository names, URLs, organizations, commit messages, and token material must never be emitted.
- The generator must fail closed when `PROFILE_STATS_TOKEN` is missing, invalid, or authenticates a different account.
- The README changes only the top-left activity card source to `./assets/github-stats.svg`.
- The generated stats card is borderless.

---

### Task 1: Deterministic stats core

**Files:**
- Create: `scripts/profile-stats-core.mjs`
- Create: `tests/profile-stats.test.mjs`

**Interfaces:**
- Produces: `calculateRank(stats)`, `assertAuthenticatedLogin(actual, expected)`, `mergeContributionTotals(total, window)`, `escapeXml(value)`, `renderStatsSvg(model)`.

- [ ] **Step 1: Write failing tests** for upstream-equivalent rank fixtures, login mismatch, contribution accumulation, XML escaping, deterministic SVG output, borderlessness, and absence of supplied private metadata.
- [ ] **Step 2: Run** `node --test tests/profile-stats.test.mjs` and verify RED because the module does not exist.
- [ ] **Step 3: Implement the minimal core module** with pure functions only and no network access.
- [ ] **Step 4: Run** `node --test tests/profile-stats.test.mjs` and verify all tests pass.
- [ ] **Step 5: Commit** the tested core and tests.

### Task 2: Private-aware generator integration

**Files:**
- Modify: `scripts/generate-activity-graph.mjs`

**Interfaces:**
- Consumes: core functions from Task 1.
- Produces: validated `assets/github-stats.svg` from authenticated lifetime totals.

- [ ] **Step 1: Add failing generator-contract tests** that inspect the generator source for required `PROFILE_STATS_TOKEN`, viewer-login verification, follower fetch, and use of the core renderer without embedding private identifiers.
- [ ] **Step 2: Run** `node --test tests/profile-stats.test.mjs` and verify the new assertions fail against the current generator.
- [ ] **Step 3: Modify the generator** to require `PROFILE_STATS_TOKEN`, query `viewer.login`, reject mismatches, fetch `followers.totalCount`, aggregate yearly commit/PR/issue/review totals, compute rank via the core module, and render the local stats SVG only after all required data succeeds.
- [ ] **Step 4: Run** `node --test tests/profile-stats.test.mjs` and verify GREEN.
- [ ] **Step 5: Commit** the generator integration.

### Task 3: Scheduled refresh and README wiring

**Files:**
- Create: `.github/workflows/profile-stats.yml`
- Modify: `README.md`

**Interfaces:**
- Workflow consumes secret `PROFILE_STATS_TOKEN` and writes generated `assets/*.svg` only.

- [ ] **Step 1: Add failing repository-contract tests** for the workflow secret wiring and README local card path.
- [ ] **Step 2: Run** `node --test tests/profile-stats.test.mjs` and verify RED.
- [ ] **Step 3: Add a scheduled + `workflow_dispatch` action** on Node 20 with `contents: write`, fail when the secret is absent, run `PROFILE_LOGIN=wbizmo node scripts/generate-activity-graph.mjs`, commit only changed `assets/*.svg`, and use an actor guard to prevent recursion.
- [ ] **Step 4: Replace only the README top-left card source** with `./assets/github-stats.svg`.
- [ ] **Step 5: Run** `node --test tests/profile-stats.test.mjs` and verify GREEN.
- [ ] **Step 6: Commit** workflow and README changes.

### Task 4: Verification and integration

**Files:**
- Verify all changed files on `feat/private-aware-profile-stats`.

- [ ] **Step 1: Run** `node --test tests/profile-stats.test.mjs` and require a clean pass.
- [ ] **Step 2: Verify** no token/private-repository literals are present in generated output or workflow logs/configuration.
- [ ] **Step 3: Open a PR** from `feat/private-aware-profile-stats` to `main` and inspect the diff for README-only top-left-card replacement plus the new tested pipeline.
- [ ] **Step 4: Merge** after verification.
- [ ] **Step 5: Confirm** `main` references `./assets/github-stats.svg` and the workflow exists.
- [ ] **Step 6: Report the single remaining account-side action:** add `PROFILE_STATS_TOKEN` under repository Actions secrets with `read:user` and any required org SSO authorization, then manually dispatch the workflow once to populate private-aware live numbers.
