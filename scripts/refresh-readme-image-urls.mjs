import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';

const version = process.env.GITHUB_RUN_ID || Date.now().toString(36);
const readmePath = 'README.md';
const sourceDir = 'assets';
const snapshotDir = 'assets/profile-cards';

const cardFiles = [
  'github-stats.svg',
  'github-productive-time.svg',
  'github-repos-language.svg',
  'github-streak.svg',
  'github-activity.svg',
];

await mkdir(snapshotDir, { recursive: true });

const snapshotName = (file) => file.replace(/\.svg$/, `-${version}.svg`);
const snapshotPath = (file) => `./${snapshotDir}/${snapshotName(file)}`;

for (const file of cardFiles) {
  await copyFile(`${sourceDir}/${file}`, `${snapshotDir}/${snapshotName(file)}`);
}

// Keep only the files for this refresh. The README points at immutable filenames,
// so GitHub's image proxy never reuses a stale response for a newly generated card.
for (const entry of await readdir(snapshotDir)) {
  if (!entry.endsWith(`-${version}.svg`)) {
    await rm(`${snapshotDir}/${entry}`);
  }
}

let readme = await readFile(readmePath, 'utf8');

for (const file of cardFiles) {
  const stem = file.replace(/\.svg$/, '');
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const existingAssetUrl = new RegExp(
    `(?:https://raw\\.githubusercontent\\.com/[^"']+?/assets/(?:profile-cards/)?|(?:\\./)?assets/(?:profile-cards/)?)${escapedStem}(?:-[^/"']+)?\\.svg(?:\\?[^"']*)?`,
    'g',
  );

  readme = readme.replace(existingAssetUrl, snapshotPath(file));
}

readme = readme.replace(
  /https:\/\/streak-stats\.demolab\.com\?[^"']*/g,
  snapshotPath('github-streak.svg'),
);

await writeFile(readmePath, readme);

console.log(`Published immutable local profile-card snapshot ${version}.`);
