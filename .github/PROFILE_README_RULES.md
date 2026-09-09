# Profile README invariants

These are hard rules for the `wbizmo/wbizmo` profile README and its GitHub activity cards.

1. The README must use stable local card paths under `profile/`: `stats.svg`, `top-langs.svg`, `streak.svg`, and `productive-time.svg`.
2. Do not rotate filenames, append run IDs, append cache-busting query parameters, point README cards at `raw.githubusercontent.com`, or rewrite README card URLs on every refresh.
3. Generate the cards with maintained upstream GitHub Actions rather than custom SVG rendering logic:
   - `stats-organization/github-readme-stats-action` for stats/rank and top languages.
   - `DenverCoder1/github-readme-streak-stats` for streak/fire.
   - `vn7n24fzkq/github-profile-summary-cards` for productive-time.
4. The scheduled workflow overwrites the same stable `profile/*.svg` files and commits those files only. The README is static between intentional edits.
5. Use dark GitHub-compatible themes for all cards. Do not post-process upstream SVG markup unless an upstream action cannot express the required theme.
6. Validate every generated SVG is non-empty and contains an `<svg` root before committing it. If generation fails, fail the workflow rather than committing an error/blank card.
7. Keep `README.md` and generated `profile/` files out of the workflow's `push.paths` trigger list so bot refresh commits do not recursively trigger another refresh.
8. Do not re-add the CodersRank recognition section or the generated-data explanatory footnote unless the repository owner explicitly asks for them.
9. Do not use image generation for these cards. They are repository-generated SVGs from GitHub data.
10. Do not restore the legacy custom generator/snapshot pipeline in `scripts/` or `assets/profile-cards/` unless the repository owner explicitly asks for it.

If a future change conflicts with these rules, preserve these invariants unless the repository owner explicitly overrides them.
