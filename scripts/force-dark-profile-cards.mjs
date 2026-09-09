import { readdir, readFile, writeFile } from 'node:fs/promises';

const sourceDir = 'assets';
const snapshotDir = 'assets/profile-cards';
const sourceFiles = [
  'github-stats.svg',
  'github-productive-time.svg',
  'github-repos-language.svg',
  'github-streak.svg',
  'github-activity.svg',
];

// Keep the committed SVGs dark by default. GitHub's README/image proxy does not
// reliably preserve prefers-color-scheme behavior, so the dark palette must be
// the actual default palette in the file rather than only a CSS media override.
const palette = [
  [/#fff\b/gi, '#0d1117'],
  [/#ffffff\b/gi, '#0d1117'],
  [/#f6f8fa\b/gi, '#161b22'],
  [/#d0d7de\b/gi, '#30363d'],
  [/#d8dee4\b/gi, '#30363d'],
  [/#eaeef2\b/gi, '#21262d'],
  [/#57606a\b/gi, '#8b949e'],
  [/#0969da\b/gi, '#58a6ff'],
];

const forceDark = (svg) => palette.reduce(
  (content, [pattern, replacement]) => content.replace(pattern, replacement),
  svg,
);

async function darken(path) {
  const before = await readFile(path, 'utf8');
  const after = forceDark(before);
  if (after !== before) await writeFile(path, after);
}

for (const file of sourceFiles) {
  await darken(`${sourceDir}/${file}`);
}

// Current and legacy immutable snapshots are kept dark too. Existing snapshot
// names are never deleted or recycled; fresh workflow runs create fresh names.
for (const entry of await readdir(snapshotDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.svg')) {
    await darken(`${snapshotDir}/${entry.name}`);
  }
}

console.log('Forced GitHub profile card SVGs to the dark palette.');
