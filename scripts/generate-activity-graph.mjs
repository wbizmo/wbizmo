import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';
if (!token) throw new Error('GITHUB_TOKEN is required');

async function gql(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': `${login}-profile-stats`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(JSON.stringify(payload.errors));
  return payload.data;
}

const profileQuery = `
query Profile($login: String!, $after: String) {
  user(login: $login) {
    createdAt
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC) {
      nodes { stargazerCount }
      pageInfo { hasNextPage endCursor }
    }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW], includeUserRepositories: true) {
      totalCount
    }
  }
}`;

let after = null;
let createdAt = null;
let contributedTo = 0;
let stars = 0;
do {
  const data = await gql(profileQuery, { login, after });
  const user = data.user;
  if (!user) throw new Error(`GitHub user ${login} not found`);
  createdAt ??= user.createdAt;
  contributedTo = user.repositoriesContributedTo.totalCount;
  stars += user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);
  after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
} while (after);

const contributionQuery = `
query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const now = new Date();
let cursor = new Date(createdAt);
let commits = 0;
let prs = 0;
let issues = 0;
let reviews = 0;
while (cursor < now) {
  const end = new Date(cursor);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  if (end > now) end.setTime(now.getTime());
  const data = await gql(contributionQuery, { login, from: cursor.toISOString(), to: end.toISOString() });
  const c = data.user.contributionsCollection;
  commits += c.totalCommitContributions;
  prs += c.totalPullRequestContributions;
  issues += c.totalIssueContributions;
  reviews += c.totalPullRequestReviewContributions;
  cursor = new Date(end);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

const to = new Date();
const from = new Date(to);
from.setUTCDate(from.getUTCDate() - 89);
const recentData = await gql(contributionQuery, { login, from: from.toISOString(), to: to.toISOString() });
const calendar = recentData.user.contributionsCollection.contributionCalendar;

const rawDays = calendar.weeks.flatMap((week) => week.contributionDays);
const byDate = new Map(rawDays.map((day) => [day.date, day.contributionCount]));
const days = [];
for (let i = 0; i < 90; i += 1) {
  const d = new Date(from);
  d.setUTCDate(from.getUTCDate() + i);
  const date = d.toISOString().slice(0, 10);
  days.push({ date, count: byDate.get(date) ?? 0 });
}
const weekly = [];
for (let i = 0; i < days.length; i += 7) {
  const slice = days.slice(i, i + 7);
  weekly.push({ date: slice[0].date, count: slice.reduce((sum, day) => sum + day.count, 0) });
}

const fmt = new Intl.NumberFormat('en-US');
const shortDate = (iso) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="GitHub stats for ${login}">
<style>
.bg{fill:#fff}.title{font:600 20px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}.label{font:400 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.value{font:600 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}.border{fill:none;stroke:#d0d7de}.mark{fill:#0969da}@media(prefers-color-scheme:dark){.bg{fill:#0d1117}.title,.value,.mark{fill:#58a6ff}.label{fill:#8b949e}.border{stroke:#30363d}}
</style>
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">Stats</text>
<text class="label" x="20" y="61">★  Total Stars:</text><text class="value" x="174" y="61">${fmt.format(stars)}</text>
<text class="label" x="20" y="87">⌁  Total Commits:</text><text class="value" x="174" y="87">${fmt.format(commits)}</text>
<text class="label" x="20" y="113">⑂  Total PRs:</text><text class="value" x="174" y="113">${fmt.format(prs)}</text>
<text class="label" x="20" y="139">!  Total Issues:</text><text class="value" x="174" y="139">${fmt.format(issues)}</text>
<text class="label" x="20" y="165">▣  Contributed to:</text><text class="value" x="174" y="165">${fmt.format(contributedTo)}</text>
<path class="mark" transform="translate(300 50) scale(3.25)" d="M16 1.2a15 15 0 0 0-4.74 29.24c.75.14 1.03-.33 1.03-.73v-2.87c-4.2.91-5.09-1.79-5.09-1.79-.68-1.76-1.68-2.23-1.68-2.23-1.37-.95.1-.93.1-.93 1.52.1 2.32 1.58 2.32 1.58 1.35 2.34 3.54 1.66 4.4 1.27.14-.99.53-1.66.96-2.04-3.35-.39-6.88-1.7-6.88-7.48 0-1.65.58-3 1.55-4.06-.16-.39-.67-1.93.15-4.01 0 0 1.27-.41 4.13 1.55A14.2 14.2 0 0 1 16 8.21c1.28 0 2.55.17 3.75.51 2.86-1.96 4.12-1.55 4.12-1.55.82 2.08.31 3.62.15 4.01.97 1.06 1.55 2.41 1.55 4.06 0 5.8-3.53 7.08-6.9 7.47.55.48 1.03 1.42 1.03 2.87v4.25c0 .4.27.88 1.04.73A15 15 0 0 0 16 1.2Z"/>
</svg>`;

const width = 820, height = 270, left = 58, right = 32, top = 72, bottom = 48;
const chartW = width - left - right, chartH = height - top - bottom;
const max = Math.max(1, ...weekly.map((w) => w.count));
const niceMax = Math.max(10, Math.ceil(max / 10) * 10);
const points = weekly.map((item, index) => ({ x: left + (index / Math.max(1, weekly.length - 1)) * chartW, y: top + chartH - (item.count / niceMax) * chartH, ...item }));
const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const area = `${left},${top + chartH} ${line} ${left + chartW},${top + chartH}`;
const grids = Array.from({ length: 5 }, (_, i) => { const value = Math.round((niceMax / 4) * i); const y = top + chartH - (i / 4) * chartH; return `<line x1="${left}" y1="${y}" x2="${left + chartW}" y2="${y}" class="grid"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" class="axis">${value}</text>`; }).join('');
const xTickIndexes = [...new Set([0, Math.round((weekly.length - 1) * .25), Math.round((weekly.length - 1) * .5), Math.round((weekly.length - 1) * .75), weekly.length - 1])];
const xTicks = xTickIndexes.map((index) => { const p = points[index]; return `<text x="${p.x}" y="${height - 18}" text-anchor="middle" class="axis">${shortDate(p.date)}</text>`; }).join('');
const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="point"><title>${p.date}: ${p.count} contributions</title></circle>`).join('');
const graphSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="270" viewBox="0 0 820 270" role="img" aria-label="GitHub contribution activity for ${login} over the last 90 days"><style>.bg{fill:#fff}.title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}.sub{font:400 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.axis{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.grid{stroke:#d8dee4;stroke-width:1}.area{fill:#0969da;fill-opacity:.16}.line{fill:none;stroke:#0969da;stroke-width:2.75;stroke-linejoin:round;stroke-linecap:round}.point{fill:#fff;stroke:#0969da;stroke-width:2}.border{fill:none;stroke:#d0d7de}@media(prefers-color-scheme:dark){.bg{fill:#0d1117}.title{fill:#58a6ff}.sub,.axis{fill:#8b949e}.grid,.border{stroke:#30363d}.area{fill:#58a6ff;fill-opacity:.16}.line{stroke:#58a6ff}.point{fill:#0d1117;stroke:#58a6ff}}</style><rect class="bg" width="820" height="270" rx="8"/><rect class="border" x=".5" y=".5" width="819" height="269" rx="8"/><text x="28" y="34" class="title">Contribution Activity</text><text x="792" y="34" text-anchor="end" class="sub">last 90 days · ${fmt.format(calendar.totalContributions)} contributions</text>${grids}<polygon points="${area}" class="area"/><polyline points="${line}" class="line"/>${dots}${xTicks}</svg>`;

await mkdir('assets', { recursive: true });
await Promise.all([
  writeFile('assets/github-stats.svg', statsSvg),
  writeFile('assets/github-activity.svg', graphSvg),
]);
console.log(JSON.stringify({ stars, commits, pullRequests: prs, issues, reviews, contributedTo, recentContributions: calendar.totalContributions }, null, 2));
