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

const numberFrom = (source, pattern, label) => {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not read ${label} from generated GitHub cards.`);
  return Number(match[1].replaceAll(',', ''));
};

const clamp = (value, max) => Math.min(max, Math.max(0, value));

// Keep the local streak card visually recognisable. The previous third-party
// streak card had a flame; the first local replacement intentionally kept the
// design minimal and lost that cue. Use a vector flame so rendering does not
// depend on emoji fonts or another image host.
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

// Build a transparent, explicitly custom activity grade from the same data the
// profile cards already expose. This is not an official GitHub score and does
// not attempt to judge code quality; it summarizes public engineering activity.
const statsSvg = await readFile(`${sourceDir}/github-stats.svg`, 'utf8');
const languageSvg = await readFile(`${sourceDir}/github-repos-language.svg`, 'utf8');

const commits = numberFrom(statsSvg, /Total Commits:<\/text><text[^>]*>([\d,]+)<\/text>/, 'total commits');
const pullRequests = numberFrom(statsSvg, /Total PRs:<\/text><text[^>]*>([\d,]+)<\/text>/, 'total pull requests');
const contributedTo = numberFrom(statsSvg, /Contributed to:<\/text><text[^>]*>([\d,]+)<\/text>/, 'repositories contributed to');
const activeDays = numberFrom(streakSvg, /class="big" x="100" y="72"[^>]*>([\d,]+)<\/text>/, 'active days');
const currentStreak = numberFrom(streakSvg, /class="big" x="300" y="80"[^>]*>([\d,]+)<\/text>/, 'current streak');
const authoredRepos = numberFrom(languageSvg, />([\d,]+) authored public repos<\/text>/, 'authored public repositories');

const gradeParts = [
  { label: 'Commits', score: clamp((commits / 1000) * 25, 25), max: 25 },
  { label: 'Pull requests', score: clamp((pullRequests / 100) * 25, 25), max: 25 },
  { label: 'Collaboration', score: clamp((contributedTo / 25) * 20, 20), max: 20 },
  { label: 'Consistency', score: clamp((activeDays / 120) * 15, 15), max: 15 },
  { label: 'Streak', score: clamp((currentStreak / 30) * 10, 10), max: 10 },
  { label: 'Public repos', score: clamp((authoredRepos / 15) * 5, 5), max: 5 },
];

const rawActivityScore = gradeParts.reduce((sum, part) => sum + part.score, 0);
const activityScore = Math.floor(rawActivityScore);
const activityGrade = rawActivityScore >= 95 ? 'A+'
  : rawActivityScore >= 90 ? 'A'
    : rawActivityScore >= 80 ? 'B'
      : rawActivityScore >= 70 ? 'C'
        : rawActivityScore >= 60 ? 'D'
          : 'E';

const part = (label) => gradeParts.find((item) => item.label === label);
const partText = (label) => {
  const item = part(label);
  return `${Math.round(item.score)}/${item.max}`;
};

const ratingSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Custom GitHub activity grade ${activityGrade}, ${activityScore} out of 100">
<style>
  .bg{fill:#fff}.border,.divider{fill:none;stroke:#d0d7de;stroke-width:1}
  .title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .sub{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .grade{font:700 44px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .score{font:600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .metric{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .value{font:600 13px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .ring{fill:none;stroke:#0969da;stroke-width:5}
  @media(prefers-color-scheme:dark){
    .bg{fill:#0d1117}.border,.divider{stroke:#30363d}.title,.grade,.value{fill:#58a6ff}.sub,.score,.metric{fill:#8b949e}.ring{stroke:#58a6ff}
  }
</style>
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">GitHub Activity Grade</text><text class="sub" x="412" y="29" text-anchor="end">custom metric · not GitHub-issued</text>
<circle class="ring" cx="76" cy="101" r="43"/>
<text class="grade" x="76" y="111" text-anchor="middle">${activityGrade}</text>
<text class="score" x="76" y="148" text-anchor="middle">${activityScore} / 100</text>
<line class="divider" x1="145" y1="48" x2="145" y2="160"/>
<text class="metric" x="170" y="65">Commits</text><text class="value" x="170" y="84">${partText('Commits')}</text>
<text class="metric" x="300" y="65">Pull requests</text><text class="value" x="300" y="84">${partText('Pull requests')}</text>
<text class="metric" x="170" y="105">Collaboration</text><text class="value" x="170" y="124">${partText('Collaboration')}</text>
<text class="metric" x="300" y="105">Consistency</text><text class="value" x="300" y="124">${partText('Consistency')}</text>
<text class="metric" x="170" y="145">Streak</text><text class="value" x="170" y="164">${partText('Streak')}</text>
<text class="metric" x="300" y="145">Public repos</text><text class="value" x="300" y="164">${partText('Public repos')}</text>
</svg>`;

await writeFile(`${sourceDir}/github-rating.svg`, ratingSvg);

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

if (!/github-rating(?:-[^/"']+)?\.svg/.test(readme)) {
  const ratingBlock = `<p align="center"><img width="50%" src="${snapshotPath('github-rating.svg')}" alt="Williams' custom GitHub activity grade" /></p>`;
  const beforeActivity = /(<\/table>\s*)(<p align="center"><img[^>]+github-activity[^>]+><\/p>)/;
  if (!beforeActivity.test(readme)) {
    throw new Error('Could not place GitHub activity grade in README.');
  }
  readme = readme.replace(beforeActivity, `$1\n${ratingBlock}\n\n$2`);
}

await writeFile(readmePath, readme);

console.log(`Published immutable local profile-card snapshot ${version}; activity grade ${activityGrade} (${activityScore}/100).`);
