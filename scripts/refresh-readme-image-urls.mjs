import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';
const version = process.env.GITHUB_RUN_ID || Date.now().toString(36);
const readmePath = 'README.md';
const sourceDir = 'assets';
const snapshotDir = 'assets/profile-cards';

if (!token) throw new Error('GITHUB_TOKEN is required');

async function gql(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': `${login}-profile-cards`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) throw new Error(JSON.stringify(payload.errors));
  return payload.data;
}

const numberFrom = (source, pattern, label) => {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not read ${label} from generated GitHub cards.`);
  return Number(match[1].replaceAll(',', ''));
};

// Preserve the familiar streak flame locally so the streak card remains fully
// self-hosted and does not depend on emoji-font rendering.
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

// GitHub itself does not publish an A/B/S profile grade. The familiar rank shown
// on GitHub profile stat cards comes from GitHub Readme Stats. Reproduce that
// project's current rank algorithm exactly, but calculate it locally from GitHub
// data so the README does not depend on an external image service being online.
const statsSvg = await readFile(`${sourceDir}/github-stats.svg`, 'utf8');
const stars = numberFrom(statsSvg, /Total Stars:<\/text><text[^>]*>([\d,]+)<\/text>/, 'total stars');
const commits = numberFrom(statsSvg, /Total Commits:<\/text><text[^>]*>([\d,]+)<\/text>/, 'total commits');
const prs = numberFrom(statsSvg, /Total PRs:<\/text><text[^>]*>([\d,]+)<\/text>/, 'total pull requests');
const issues = numberFrom(statsSvg, /Total Issues:<\/text><text[^>]*>([\d,]+)<\/text>/, 'total issues');

const rankProfileQuery = `
query RankProfile($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
  }
}`;

const rankProfile = (await gql(rankProfileQuery, { login })).user;
if (!rankProfile) throw new Error(`GitHub user ${login} not found`);

const followers = rankProfile.followers.totalCount;
const createdAt = new Date(rankProfile.createdAt);
const now = new Date();
let reviewCursor = new Date(createdAt);
let reviews = 0;

const reviewsQuery = `
query RankReviews($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalPullRequestReviewContributions
    }
  }
}`;

while (reviewCursor < now) {
  const end = new Date(reviewCursor);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  if (end > now) end.setTime(now.getTime());

  const data = await gql(reviewsQuery, {
    login,
    from: reviewCursor.toISOString(),
    to: end.toISOString(),
  });
  reviews += data.user.contributionsCollection.totalPullRequestReviewContributions;

  reviewCursor = new Date(end);
  reviewCursor.setUTCDate(reviewCursor.getUTCDate() + 1);
}

const exponentialCdf = (x) => 1 - 2 ** -x;
const logNormalCdf = (x) => x / (1 + x);

// Exact medians, weights and thresholds used by anuraghazra/github-readme-stats.
const COMMITS_MEDIAN = 1000;
const COMMITS_WEIGHT = 2;
const PRS_MEDIAN = 50;
const PRS_WEIGHT = 3;
const ISSUES_MEDIAN = 25;
const ISSUES_WEIGHT = 1;
const REVIEWS_MEDIAN = 2;
const REVIEWS_WEIGHT = 1;
const STARS_MEDIAN = 50;
const STARS_WEIGHT = 4;
const FOLLOWERS_MEDIAN = 10;
const FOLLOWERS_WEIGHT = 1;
const TOTAL_WEIGHT = 12;
const THRESHOLDS = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
const LEVELS = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];

const rankFraction = 1 - (
  COMMITS_WEIGHT * exponentialCdf(commits / COMMITS_MEDIAN) +
  PRS_WEIGHT * exponentialCdf(prs / PRS_MEDIAN) +
  ISSUES_WEIGHT * exponentialCdf(issues / ISSUES_MEDIAN) +
  REVIEWS_WEIGHT * exponentialCdf(reviews / REVIEWS_MEDIAN) +
  STARS_WEIGHT * logNormalCdf(stars / STARS_MEDIAN) +
  FOLLOWERS_WEIGHT * logNormalCdf(followers / FOLLOWERS_MEDIAN)
) / TOTAL_WEIGHT;

const percentile = rankFraction * 100;
const levelIndex = THRESHOLDS.findIndex((threshold) => percentile <= threshold);
const rankLevel = LEVELS[levelIndex === -1 ? LEVELS.length - 1 : levelIndex];
const percentileLabel = percentile < 1 ? '<1%' : `${percentile.toFixed(1)}%`;

const ratingSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="GitHub Readme Stats rank ${rankLevel}, top ${percentileLabel}">
<style>
  .bg{fill:#fff}.border,.divider{fill:none;stroke:#d0d7de;stroke-width:1}
  .title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .sub{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .grade{font:700 42px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .metric{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .value{font:600 13px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .ring{fill:none;stroke:#0969da;stroke-width:5}
  @media(prefers-color-scheme:dark){
    .bg{fill:#0d1117}.border,.divider{stroke:#30363d}.title,.grade,.value{fill:#58a6ff}.sub,.metric{fill:#8b949e}.ring{stroke:#58a6ff}
  }
</style>
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">GitHub Stats Rank</text>
<circle class="ring" cx="77" cy="99" r="43"/>
<text class="grade" x="77" y="109" text-anchor="middle">${rankLevel}</text>
<text class="sub" x="77" y="151" text-anchor="middle">Top ${percentileLabel}</text>
<line class="divider" x1="145" y1="48" x2="145" y2="160"/>
<text class="metric" x="170" y="63">Commits</text><text class="value" x="170" y="82">${commits.toLocaleString('en-US')}</text>
<text class="metric" x="300" y="63">Pull requests</text><text class="value" x="300" y="82">${prs.toLocaleString('en-US')}</text>
<text class="metric" x="170" y="105">Issues</text><text class="value" x="170" y="124">${issues.toLocaleString('en-US')}</text>
<text class="metric" x="300" y="105">Reviews</text><text class="value" x="300" y="124">${reviews.toLocaleString('en-US')}</text>
<text class="metric" x="170" y="147">Stars</text><text class="value" x="170" y="166">${stars.toLocaleString('en-US')}</text>
<text class="metric" x="300" y="147">Followers</text><text class="value" x="300" y="166">${followers.toLocaleString('en-US')}</text>
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

console.log(JSON.stringify({
  rank: rankLevel,
  percentile,
  commits,
  prs,
  issues,
  reviews,
  stars,
  followers,
  version,
}, null, 2));
