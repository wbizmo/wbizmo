import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';

const login = process.env.PROFILE_LOGIN || 'wbizmo';
const version = process.env.GITHUB_RUN_ID || Date.now().toString(36);
const readmePath = 'README.md';
const sourceDir = 'assets';
const snapshotDir = 'assets/profile-cards';

// Preserve the familiar streak flame locally so the streak card does not depend
// on a third-party image host or emoji-font rendering.
const streakPath = `${sourceDir}/github-streak.svg`;
let streakSvg = await readFile(streakPath, 'utf8');
const flameMarkup = `<g data-streak-flame="true" transform="translate(286 5) scale(.86)">
  <path d="M16 1c1 7-3 9-1 14 1-3 4-5 6-8 3 4 5 8 5 13 0 7-5 12-12 12S2 27 2 20c0-6 4-10 8-14-1 5 1 8 4 9-1-5 2-8 2-14Z" fill="#f78166"/>
  <path d="M14 18c3-3 4-5 4-8 3 3 5 6 5 9 0 5-4 9-9 9s-9-4-9-9c0-3 2-6 5-9 0 4 1 6 4 8Z" fill="#ffab70"/>
</g>`;

if (!streakSvg.includes('data-streak-flame="true"')) {
  streakSvg = streakSvg.replace(
    '<circle cx="300" cy="69"',
    `${flameMarkup}\n<circle cx="300" cy="69"`,
  );
  await writeFile(streakPath, streakSvg);
}

// Use the established GitHub Readme Stats rank card instead of inventing a
// local grading formula. Snapshot the returned SVG into this repository so the
// README itself never depends on the remote service at render time.
const rankUrl = new URL('https://github-readme-stats.vercel.app/api');
rankUrl.searchParams.set('username', login);
rankUrl.searchParams.set('show_icons', 'true');
rankUrl.searchParams.set('include_all_commits', 'true');
rankUrl.searchParams.set('rank_icon', 'default');
rankUrl.searchParams.set('theme', 'transparent');
rankUrl.searchParams.set('hide_border', 'true');
rankUrl.searchParams.set('number_format', 'long');

const rankResponse = await fetch(rankUrl, {
  headers: { 'user-agent': `${login}-profile-cards` },
});

if (!rankResponse.ok) {
  throw new Error(`GitHub Readme Stats HTTP ${rankResponse.status}: ${await rankResponse.text()}`);
}

const rankSvg = await rankResponse.text();
if (!/^\s*<svg[\s>]/i.test(rankSvg) || !/rank-circle|rank-text|rank/i.test(rankSvg)) {
  throw new Error('GitHub Readme Stats returned an unexpected rank-card payload.');
}
await writeFile(`${sourceDir}/github-rating.svg`, rankSvg);

const cardFiles = [
  'github-stats.svg',
  'github-productive-time.svg',
  'github-repos-language.svg',
  'github-streak.svg',
  'github-rating.svg',
  'github-activity.svg',
];

await mkdir(snapshotDir, { recursive: true });

const snapshotName = (file) => file.replace(/\.svg$/, `-${version}.svg`);
const snapshotPath = (file) => `./${snapshotDir}/${snapshotName(file)}`;

for (const file of cardFiles) {
  await copyFile(`${sourceDir}/${file}`, `${snapshotDir}/${snapshotName(file)}`);
}

// Each refresh receives immutable filenames so GitHub's image proxy cannot
// serve an older cached response for newly generated cards.
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

if (!/github-rating(?:-[^/"']+)?\.svg/.test(readme)) {
  const ratingBlock = `<p align="center"><img width="50%" src="${snapshotPath('github-rating.svg')}" alt="Williams' GitHub stats rank" /></p>`;
  const beforeActivity = /(<\/table>\s*)(<p align="center"><img[^>]+github-activity[^>]+><\/p>)/;
  if (!beforeActivity.test(readme)) {
    throw new Error('Could not place GitHub stats rank in README.');
  }
  readme = readme.replace(beforeActivity, `$1\n${ratingBlock}\n\n$2`);
}

readme = readme.replace(/alt="Williams' custom GitHub activity grade"/g, 'alt="Williams\' GitHub stats rank"');

await writeFile(readmePath, readme);

console.log(`Published immutable local profile-card snapshot ${version} with GitHub Readme Stats rank.`);
