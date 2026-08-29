import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';

if (!token) {
  throw new Error('GITHUB_TOKEN is required');
}

const now = new Date();
const from = new Date(now);
from.setUTCFullYear(from.getUTCFullYear() - 1);

const query = `
  query ProfileActivity($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      name
      login
      createdAt
      repositories(first: 1, ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
      }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': `${login}-profile-readme`,
  },
  body: JSON.stringify({
    query,
    variables: {
      login,
      from: from.toISOString(),
      to: now.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${await response.text()}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(`GitHub GraphQL errors: ${JSON.stringify(payload.errors)}`);
}

const user = payload.data?.user;
if (!user) throw new Error(`GitHub user ${login} was not returned`);

const collection = user.contributionsCollection;
const calendar = collection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays).sort((a, b) => a.date.localeCompare(b.date));

const fmt = new Intl.NumberFormat('en-US');
const shortDate = (iso) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

function streaks(contributionDays) {
  const active = contributionDays.map((day) => ({ ...day, active: day.contributionCount > 0 }));

  let longest = 0;
  let longestStart = null;
  let longestEnd = null;
  let run = 0;
  let runStart = null;

  for (const day of active) {
    if (day.active) {
      if (run === 0) runStart = day.date;
      run += 1;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = day.date;
      }
    } else {
      run = 0;
      runStart = null;
    }
  }

  let index = active.length - 1;
  if (index >= 0 && !active[index].active) index -= 1;

  let current = 0;
  let currentEnd = index >= 0 ? active[index].date : null;
  let currentStart = currentEnd;
  while (index >= 0 && active[index].active) {
    current += 1;
    currentStart = active[index].date;
    index -= 1;
  }

  return { current, currentStart, currentEnd, longest, longestStart, longestEnd };
}

const streak = streaks(days);
const total = calendar.totalContributions;
const publicRepos = user.repositories.totalCount;
const prs = collection.totalPullRequestContributions;
const issues = collection.totalIssueContributions;
const reviews = collection.totalPullRequestReviewContributions;

const styles = `
  <style>
    .title { font: 600 18px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; fill: #0969da; }
    .label { font: 400 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; fill: #57606a; }
    .value { font: 600 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; fill: #0969da; }
    .big { font: 700 31px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; fill: #0969da; }
    .small { font: 400 13px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; fill: #57606a; }
    .strong { font: 600 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; fill: #0969da; }
    .rule { stroke: #d0d7de; stroke-width: 1; }
    .graph { fill: rgba(9,105,218,.16); stroke: #0969da; stroke-width: 2.5; }
    .grid { stroke: #d8dee4; stroke-width: 1; }
    @media (prefers-color-scheme: dark) {
      .title,.value,.big,.strong { fill: #58a6ff; }
      .label,.small { fill: #8b949e; }
      .rule,.grid { stroke: #30363d; }
      .graph { fill: rgba(88,166,255,.16); stroke: #58a6ff; }
    }
  </style>`;

const githubMark = `<path fill="#0969da" d="M16 1.2a15 15 0 0 0-4.74 29.24c.75.14 1.03-.33 1.03-.73v-2.87c-4.2.91-5.09-1.79-5.09-1.79-.68-1.76-1.68-2.23-1.68-2.23-1.37-.95.1-.93.1-.93 1.52.1 2.32 1.58 2.32 1.58 1.35 2.34 3.54 1.66 4.4 1.27.14-.99.53-1.66.96-2.04-3.35-.39-6.88-1.7-6.88-7.48 0-1.65.58-3 1.55-4.06-.16-.39-.67-1.93.15-4.01 0 0 1.27-.41 4.13 1.55A14.2 14.2 0 0 1 16 8.21c1.28 0 2.55.17 3.75.51 2.86-1.96 4.12-1.55 4.12-1.55.82 2.08.31 3.62.15 4.01.97 1.06 1.55 2.41 1.55 4.06 0 5.8-3.53 7.08-6.9 7.47.55.48 1.03 1.42 1.03 2.87v4.25c0 .4.27.88 1.04.73A15 15 0 0 0 16 1.2Z"/>`;

const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="GitHub activity stats for ${escapeXml(login)}">
  ${styles}
  <text class="title" x="18" y="29">Stats · last 12 months</text>
  <g transform="translate(344 48) scale(2.15)">${githubMark}</g>
  <text class="label" x="18" y="61">Total contributions</text><text class="value" x="184" y="61">${fmt.format(total)}</text>
  <text class="label" x="18" y="87">Pull requests</text><text class="value" x="184" y="87">${fmt.format(prs)}</text>
  <text class="label" x="18" y="113">Issues</text><text class="value" x="184" y="113">${fmt.format(issues)}</text>
  <text class="label" x="18" y="139">PR reviews</text><text class="value" x="184" y="139">${fmt.format(reviews)}</text>
  <text class="label" x="18" y="165">Public repos</text><text class="value" x="184" y="165">${fmt.format(publicRepos)}</text>
</svg>`;

const rangeLabel = (start, end) => start && end ? `${shortDate(start)} – ${shortDate(end)}` : '—';
const streakSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="190" viewBox="0 0 820 190" role="img" aria-label="GitHub contribution streak for ${escapeXml(login)}">
  ${styles}
  <line class="rule" x1="273" y1="25" x2="273" y2="165"/><line class="rule" x1="547" y1="25" x2="547" y2="165"/>
  <text class="big" x="137" y="74" text-anchor="middle">${fmt.format(total)}</text>
  <text class="label" x="137" y="111" text-anchor="middle">Contributions</text>
  <text class="small" x="137" y="139" text-anchor="middle">last 12 months</text>

  <circle cx="410" cy="73" r="43" fill="none" stroke="#0969da" stroke-width="6"/>
  <text class="big" x="410" y="84" text-anchor="middle">${streak.current}</text>
  <text class="strong" x="410" y="126" text-anchor="middle">Current streak</text>
  <text class="small" x="410" y="153" text-anchor="middle">${escapeXml(rangeLabel(streak.currentStart, streak.currentEnd))}</text>

  <text class="big" x="683" y="74" text-anchor="middle">${streak.longest}</text>
  <text class="label" x="683" y="111" text-anchor="middle">Longest streak</text>
  <text class="small" x="683" y="139" text-anchor="middle">${escapeXml(rangeLabel(streak.longestStart, streak.longestEnd))}</text>
</svg>`;

const weekly = calendar.weeks.map((week) => week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0));
const chartX = 42;
const chartY = 45;
const chartW = 736;
const chartH = 112;
const maxWeek = Math.max(1, ...weekly);
const points = weekly.map((value, index) => {
  const x = chartX + (index / Math.max(1, weekly.length - 1)) * chartW;
  const y = chartY + chartH - (value / maxWeek) * chartH;
  return [x, y];
});
const linePoints = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const areaPoints = `${chartX},${chartY + chartH} ${linePoints} ${chartX + chartW},${chartY + chartH}`;

const graphSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="195" viewBox="0 0 820 195" role="img" aria-label="GitHub contributions over the last 12 months for ${escapeXml(login)}">
  ${styles}
  <text class="title" x="18" y="28">GitHub contributions · last 12 months</text>
  <text class="value" x="802" y="28" text-anchor="end">${fmt.format(total)} total</text>
  <line class="grid" x1="42" y1="157" x2="778" y2="157"/>
  <polygon class="graph" points="${areaPoints}"/>
  <polyline fill="none" stroke="#0969da" stroke-width="2.5" points="${linePoints}"/>
  <text class="small" x="42" y="181">${escapeXml(shortDate(days[0]?.date))}</text>
  <text class="small" x="778" y="181" text-anchor="end">${escapeXml(shortDate(days.at(-1)?.date))}</text>
</svg>`;

await mkdir('assets', { recursive: true });
await Promise.all([
  writeFile('assets/github-stats.svg', statsSvg),
  writeFile('assets/github-streak.svg', streakSvg),
  writeFile('assets/github-contributions.svg', graphSvg),
]);

console.log(JSON.stringify({
  login,
  window: { from: from.toISOString(), to: now.toISOString() },
  totalContributions: total,
  currentStreak: streak.current,
  longestStreak: streak.longest,
  publicRepos,
  pullRequests: prs,
  issues,
  reviews,
  restrictedContributions: collection.restrictedContributionsCount,
}, null, 2));
