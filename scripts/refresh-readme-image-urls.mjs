import { readFile, writeFile } from 'node:fs/promises';

const login = process.env.PROFILE_LOGIN || 'wbizmo';
const repository = process.env.PROFILE_REPOSITORY || `${login}/${login}`;
const ref = process.env.PROFILE_REF || 'main';
const version = process.env.GITHUB_RUN_ID || Date.now().toString(36);
const readmePath = 'README.md';

const cardFiles = [
  'github-stats.svg',
  'github-productive-time.svg',
  'github-repos-language.svg',
  'github-streak.svg',
  'github-activity.svg',
];

const rawUrl = (file) =>
  `https://raw.githubusercontent.com/${repository}/${ref}/assets/${file}?v=${version}`;

let readme = await readFile(readmePath, 'utf8');

for (const file of cardFiles) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingAssetUrl = new RegExp(
    `(?:https://raw\\.githubusercontent\\.com/[^"']+?/assets/|(?:\\./)?assets/)${escaped}(?:\\?[^"']*)?`,
    'g',
  );
  readme = readme.replace(existingAssetUrl, rawUrl(file));
}

// Eliminate the remaining third-party streak dependency so every GitHub
// activity card is generated and served from this profile repository.
readme = readme.replace(
  /https:\/\/streak-stats\.demolab\.com\?[^"']*/g,
  rawUrl('github-streak.svg'),
);

await writeFile(readmePath, readme);

console.log(`Refreshed README profile-card URLs with cache version ${version}.`);
