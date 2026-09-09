# Profile README invariants

These are hard rules for the `wbizmo/wbizmo` profile README and its generated GitHub activity cards.

1. GitHub activity cards must use immutable, per-run local snapshot filenames under `assets/profile-cards/`, e.g. `github-stats-<GITHUB_RUN_ID>.svg`.
2. The README must point to those local immutable snapshot files. Do not switch the cards back to mutable `assets/github-*.svg`/`.png` paths, third-party stats services, or `raw.githubusercontent.com` query-string cache busting.
3. Never delete old immutable snapshot files automatically. GitHub can serve cached README HTML that still references an older snapshot; deleting it recreates broken-image states.
4. The scheduled workflow regenerates the source SVGs, creates a fresh snapshot set, rewrites the README to that new set, forces the final committed SVGs to the dark palette, and commits README + assets together.
5. The profile cards are dark-mode assets by default. Do not rely only on `prefers-color-scheme`; GitHub's README/image proxy may not preserve it consistently.
6. README/assets bot commits must not recursively retrigger the workflow. Keep `README.md` and `assets/` out of the workflow's `push.paths` trigger list.
7. Do not re-add the CodersRank recognition section or the generated-data explanatory footnote unless the repository owner explicitly asks for them.
8. Do not use image generation for these cards. They are deterministic repository-generated data visualizations.

If a future change conflicts with these rules, preserve these invariants unless the repository owner explicitly overrides them.
