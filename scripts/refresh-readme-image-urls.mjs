import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';
const sourceDir = 'assets';

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

const statsPath = `${sourceDir}/github-stats.svg`;
let statsSvg = await readFile(statsPath, 'utf8');
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

const rankStyles = `
  .rank-ring{fill:none;stroke:#0969da;stroke-width:6}
  .rank-grade{font:700 31px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  @media(prefers-color-scheme:dark){.rank-ring{stroke:#58a6ff}.rank-grade{fill:#58a6ff}}
`;
statsSvg = statsSvg.replace('</style>', `${rankStyles}</style>`);

const rankMarkup = `<g data-readme-stats-rank="true">
  <circle class="rank-ring" cx="335" cy="101" r="41"/>
  <text class="rank-grade" x="335" y="111" text-anchor="middle">${rankLevel}</text>
</g>`;

const statsWithRank = statsSvg.replace(
  /<g transform="translate\(300 50\) scale\(3\.25\)">[\s\S]*?<\/g>/,
  rankMarkup,
);
if (statsWithRank === statsSvg) {
  throw new Error('Could not place GitHub Readme Stats rank in the stats card.');
}
statsSvg = statsWithRank;
await writeFile(statsPath, statsSvg);

const cardStems = [
  'github-stats',
  'github-productive-time',
  'github-repos-language',
  'github-streak',
  'github-activity',
];

for (const stem of cardStems) {
  await execFileAsync('rsvg-convert', [
    '--keep-aspect-ratio',
    '--output', `${sourceDir}/${stem}.png`,
    `${sourceDir}/${stem}.svg`,
  ]);
}

console.log(JSON.stringify({
  rank: rankLevel,
  percentile,
  commits,
  prs,
  issues,
  reviews,
  stars,
  followers,
  output: 'stable-png',
}, null, 2));
