# Private-aware GitHub profile stats card

## Goal

Replace the external top-left GitHub stats card in the profile README with a locally generated SVG whose lifetime activity inputs include both public and private GitHub contributions visible to an authenticated token, while preserving the familiar GitHub Readme Stats rank scale (`S`, `A+`, `A`, `A-`, `B+`, `B`, `B-`, `C+`, `C`).

## Existing foundation

The repository already contains `scripts/generate-activity-graph.mjs` and generated SVG assets under `assets/`. The generator already queries GitHub GraphQL contribution history in yearly windows and writes `assets/github-stats.svg`, so this work extends that pipeline instead of introducing a second renderer.

## Data model

The generator will use an authenticated token supplied through `PROFILE_STATS_TOKEN` and query the profile account only. Lifetime values will be accumulated across yearly `contributionsCollection` windows from account creation to the current time:

- commit contributions
- pull request contributions
- issue contributions
- pull request review contributions

The generator will also fetch:

- public stars across owned public repositories
- follower count
- contributed-to repository count where available to the token

Private repository names, organization names, repository URLs, commit messages, and other private metadata will never be written into generated assets or logs.

## Rank calculation

The rank calculation will intentionally match the existing GitHub Readme Stats formula so the grade remains comparable with the previous card. Inputs will be the corrected private+public lifetime contribution totals instead of public-only commit-search counts.

Weights and medians remain:

- commits: weight 2, median 1000 for all-time mode
- pull requests: weight 3, median 50
- issues: weight 1, median 25
- reviews: weight 1, median 2
- stars: weight 4, median 50
- followers: weight 1, median 10

Rank thresholds remain `S`, `A+`, `A`, `A-`, `B+`, `B`, `B-`, `C+`, `C`.

## Rendering

`assets/github-stats.svg` will render a borderless dark-mode-aware card compatible with the existing two-column activity table. It will show lifetime totals for stars, commits, PRs, issues, contributed-to repositories, and the grade/rank circle. The README will reference the repository-local asset rather than a third-party stats endpoint.

## Automation

A GitHub Actions workflow will run on a schedule and via `workflow_dispatch`. It will:

1. Require `PROFILE_STATS_TOKEN`.
2. Run the generator with `PROFILE_LOGIN=wbizmo`.
3. Fail if the token is absent, invalid, or authenticates a different account.
4. Regenerate the SVG assets.
5. Commit only changed generated assets back to `main` using the workflow token.

The workflow must never silently fall back to unauthenticated or public-only data.

## Security

`PROFILE_STATS_TOKEN` is stored only as an Actions secret. The generator must not print token values or private repository identifiers. The token should use the narrowest permissions that allow the authenticated account's private contribution data; `read:user` is required for private/internal contribution visibility, with any organization SSO authorization handled by the user where applicable.

## Failure handling

Generation fails closed when required authenticated data cannot be fetched. Existing generated SVGs remain in the repository, so a transient API failure does not break the profile card. No partial SVG is written until all required data has been fetched and validated.

## Testing

Tests will cover:

- the rank function against known upstream-equivalent fixtures
- lifetime accumulation across multiple contribution windows
- authentication/login mismatch handling
- missing-token failure
- XML escaping and deterministic SVG rendering
- no private repository identifiers in generated output

## README change

Only the top-left GitHub activity image changes from the external mirror to `./assets/github-stats.svg`. The rest of the README layout and cards remain unchanged.

## Success criteria

- the top-left card renders from the repository itself
- lifetime commit/PR/issue/review inputs include private+public contribution data available to the authenticated token
- the displayed rank uses the same formula as GitHub Readme Stats
- the workflow is scheduled and manually runnable
- missing or under-scoped credentials fail loudly rather than degrading to public-only stats
- no private repository identity or secret material is exposed
