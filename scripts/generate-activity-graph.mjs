import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';
const utcOffset = 1;

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

const fmt = new Intl.NumberFormat('en-US');
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const shortDate = (iso) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`));

const humanDate = (iso) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`));

const profileQuery = `
query Profile($login: String!, $after: String) {
  user(login: $login) {
    id
    createdAt
    repositories(
      first: 100
      after: $after
      ownerAffiliations: OWNER
      privacy: PUBLIC
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      nodes {
        name
        isFork
        stargazerCount
        primaryLanguage { name color }
        defaultBranchRef { name }
      }
      pageInfo { hasNextPage endCursor }
    }
    repositoriesContributedTo(
      first: 1
      contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW]
      includeUserRepositories: true
    ) {
      totalCount
    }
  }
}`;

let after = null;
let userId = null;
let createdAt = null;
let contributedTo = 0;
let stars = 0;
const repositories = [];

do {
  const data = await gql(profileQuery, { login, after });
  const user = data.user;
  if (!user) throw new Error(`GitHub user ${login} not found`);

  userId ??= user.id;
  createdAt ??= user.createdAt;
  contributedTo = user.repositoriesContributedTo.totalCount;
  repositories.push(...user.repositories.nodes);
  stars += user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);

  after = user.repositories.pageInfo.hasNextPage
    ? user.repositories.pageInfo.endCursor
    : null;
} while (after);

const authoredRepos = repositories.filter((repo) => !repo.isFork && repo.defaultBranchRef);

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
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
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
const contributionDaysByDate = new Map();

while (cursor < now) {
  const end = new Date(cursor);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  if (end > now) end.setTime(now.getTime());

  const data = await gql(contributionQuery, {
    login,
    from: cursor.toISOString(),
    to: end.toISOString(),
  });

  const collection = data.user.contributionsCollection;
  commits += collection.totalCommitContributions;
  prs += collection.totalPullRequestContributions;
  issues += collection.totalIssueContributions;
  reviews += collection.totalPullRequestReviewContributions;

  const segmentStart = cursor.toISOString().slice(0, 10);
  const segmentEnd = end.toISOString().slice(0, 10);
  for (const week of collection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      if (day.date >= segmentStart && day.date <= segmentEnd) {
        contributionDaysByDate.set(day.date, day.contributionCount);
      }
    }
  }

  cursor = new Date(end);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

const allContributionDays = [...contributionDaysByDate.entries()]
  .map(([date, count]) => ({ date, count }))
  .sort((a, b) => a.date.localeCompare(b.date));

function calculateStreaks(days) {
  let longest = 0;
  let longestStart = null;
  let longestEnd = null;
  let run = 0;
  let runStart = null;

  for (const day of days) {
    if (day.count > 0) {
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

  let index = days.length - 1;
  const today = now.toISOString().slice(0, 10);
  if (index >= 0 && days[index].date === today && days[index].count === 0) index -= 1;

  let current = 0;
  let currentStart = index >= 0 ? days[index].date : null;
  let currentEnd = currentStart;

  while (index >= 0 && days[index].count > 0) {
    current += 1;
    currentStart = days[index].date;
    index -= 1;
  }

  return { current, currentStart, currentEnd, longest, longestStart, longestEnd };
}

const streak = calculateStreaks(allContributionDays);
const oneYearAgo = new Date(now);
oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 364);
const oneYearStart = oneYearAgo.toISOString().slice(0, 10);
const activeDaysYear = allContributionDays.filter((day) => day.date >= oneYearStart && day.count > 0).length;

const recentStartDate = new Date(now);
recentStartDate.setUTCDate(recentStartDate.getUTCDate() - 89);
const recentStart = recentStartDate.toISOString().slice(0, 10);
const recentDays = [];

for (let i = 0; i < 90; i += 1) {
  const d = new Date(recentStartDate);
  d.setUTCDate(recentStartDate.getUTCDate() + i);
  const date = d.toISOString().slice(0, 10);
  recentDays.push({ date, count: contributionDaysByDate.get(date) ?? 0 });
}

const recentTotal = recentDays.reduce((sum, day) => sum + day.count, 0);
const weekly = [];
for (let i = 0; i < recentDays.length; i += 7) {
  const slice = recentDays.slice(i, i + 7);
  weekly.push({
    date: slice[0].date,
    count: slice.reduce((sum, day) => sum + day.count, 0),
  });
}

const historyQuery = `
query RepoHistory($owner: String!, $name: String!, $authorId: ID!, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100, after: $after, author: { id: $authorId }) {
            nodes { committedDate }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }
}`;

const commitDates = [];
for (const repo of authoredRepos) {
  let historyAfter = null;
  do {
    const data = await gql(historyQuery, {
      owner: login,
      name: repo.name,
      authorId: userId,
      after: historyAfter,
    });

    const history = data.repository?.defaultBranchRef?.target?.history;
    if (!history) break;

    commitDates.push(...history.nodes.map((node) => node.committedDate));
    historyAfter = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;
  } while (historyAfter);
}

const hourCounts = Array.from({ length: 24 }, () => 0);
for (const committedDate of commitDates) {
  const utcHour = new Date(committedDate).getUTCHours();
  const localHour = (utcHour + utcOffset + 24) % 24;
  hourCounts[localHour] += 1;
}

const languageCounts = new Map();
for (const repo of authoredRepos) {
  const language = repo.primaryLanguage?.name || 'Other';
  const color = repo.primaryLanguage?.color || '#8c959f';
  const current = languageCounts.get(language) || { count: 0, color };
  current.count += 1;
  languageCounts.set(language, current);
}

const languages = [...languageCounts.entries()]
  .map(([name, data]) => ({ name, ...data }))
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const sharedStyles = `
<style>
  .bg{fill:#fff}.border{fill:none;stroke:#d0d7de;stroke-width:1}
  .title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .label{font:400 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .value{font:600 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .big{font:700 31px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .small{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .sub{font:400 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .strong{font:600 14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}
  .grid{stroke:#d8dee4;stroke-width:1}.track{fill:#eaeef2}.mark{fill:#0969da}
  @media(prefers-color-scheme:dark){
    .bg{fill:#0d1117}.border,.grid{stroke:#30363d}.track{fill:#21262d}
    .title,.value,.big,.strong,.mark{fill:#58a6ff}.label,.small,.sub{fill:#8b949e}
  }
</style>`;

const githubMark = `<path class="mark" d="M16 1.2a15 15 0 0 0-4.74 29.24c.75.14 1.03-.33 1.03-.73v-2.87c-4.2.91-5.09-1.79-5.09-1.79-.68-1.76-1.68-2.23-1.68-2.23-1.37-.95.1-.93.1-.93 1.52.1 2.32 1.58 2.32 1.58 1.35 2.34 3.54 1.66 4.4 1.27.14-.99.53-1.66.96-2.04-3.35-.39-6.88-1.7-6.88-7.48 0-1.65.58-3 1.55-4.06-.16-.39-.67-1.93.15-4.01 0 0 1.27-.41 4.13 1.55A14.2 14.2 0 0 1 16 8.21c1.28 0 2.55.17 3.75.51 2.86-1.96 4.12-1.55 4.12-1.55.82 2.08.31 3.62.15 4.01.97 1.06 1.55 2.41 1.55 4.06 0 5.8-3.53 7.08-6.9 7.47.55.48 1.03 1.42 1.03 2.87v4.25c0 .4.27.88 1.04.73A15 15 0 0 0 16 1.2Z"/>`;

const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Lifetime GitHub stats for ${escapeXml(login)}">
${sharedStyles}
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">Stats</text><text class="sub" x="410" y="29" text-anchor="end">lifetime</text>
<text class="label" x="20" y="61">★  Total Stars:</text><text class="value" x="174" y="61">${fmt.format(stars)}</text>
<text class="label" x="20" y="87">⌁  Total Commits:</text><text class="value" x="174" y="87">${fmt.format(commits)}</text>
<text class="label" x="20" y="113">⑂  Total PRs:</text><text class="value" x="174" y="113">${fmt.format(prs)}</text>
<text class="label" x="20" y="139">!  Total Issues:</text><text class="value" x="174" y="139">${fmt.format(issues)}</text>
<text class="label" x="20" y="165">▣  Contributed to:</text><text class="value" x="174" y="165">${fmt.format(contributedTo)}</text>
<g transform="translate(300 50) scale(3.25)">${githubMark}</g>
</svg>`;

const productiveWidth = 430;
const productiveHeight = 180;
const pLeft = 44;
const pTop = 48;
const pBottom = 30;
const pChartW = 362;
const pChartH = productiveHeight - pTop - pBottom;
const maxHour = Math.max(1, ...hourCounts);
const barSlot = pChartW / 24;
const bars = hourCounts.map((count, hour) => {
  const height = (count / maxHour) * pChartH;
  const x = pLeft + hour * barSlot + 1;
  const y = pTop + pChartH - height;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(2, barSlot - 2).toFixed(1)}" height="${height.toFixed(1)}" rx="1" fill="#0969da"><title>${hour}:00 — ${count} commits</title></rect>`;
}).join('');
const pTicks = [0, 6, 12, 18, 23].map((hour) => {
  const x = pLeft + hour * barSlot + barSlot / 2;
  return `<text class="small" x="${x.toFixed(1)}" y="169" text-anchor="middle">${hour}</text>`;
}).join('');

const productiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Commit time distribution for ${escapeXml(login)}">
${sharedStyles}
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">Commits (UTC +1.00)</text><text class="sub" x="410" y="29" text-anchor="end">default branches</text>
<line class="grid" x1="${pLeft}" y1="${pTop + pChartH}" x2="${pLeft + pChartW}" y2="${pTop + pChartH}"/>
<line class="grid" x1="${pLeft}" y1="${pTop}" x2="${pLeft + pChartW}" y2="${pTop}"/>
<text class="small" x="36" y="${pTop + 4}" text-anchor="end">${maxHour}</text>
<text class="small" x="36" y="${pTop + pChartH + 4}" text-anchor="end">0</text>
${bars}${pTicks}
<text class="small" x="406" y="169" text-anchor="end">per day hour</text>
</svg>`;

const languageRows = languages.slice(0, 5);
const maxLanguage = Math.max(1, ...languageRows.map((item) => item.count));
const languageBars = languageRows.map((item, index) => {
  const y = 55 + index * 24;
  const width = (item.count / maxLanguage) * 220;
  return `<text class="label" x="18" y="${y + 10}">${escapeXml(item.name)}</text><rect class="track" x="145" y="${y}" width="220" height="11" rx="5.5"/><rect x="145" y="${y}" width="${width.toFixed(1)}" height="11" rx="5.5" fill="${escapeXml(item.color)}"/><text class="value" x="405" y="${y + 10}" text-anchor="end">${item.count}</text>`;
}).join('');

const languageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Repositories per language for ${escapeXml(login)}">
${sharedStyles}
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">Repos per Language</text><text class="sub" x="410" y="29" text-anchor="end">${authoredRepos.length} authored public repos</text>
${languageBars}
</svg>`;

const rangeLabel = (start, end) => start && end ? `${humanDate(start)} – ${humanDate(end)}` : '—';
const streakSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180" role="img" aria-label="GitHub contribution streak for ${escapeXml(login)}">
${sharedStyles}
<rect class="bg" width="600" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="599" height="179" rx="8"/>
<line class="grid" x1="200" y1="24" x2="200" y2="158"/><line class="grid" x1="400" y1="24" x2="400" y2="158"/>
<text class="big" x="100" y="72" text-anchor="middle">${activeDaysYear}</text>
<text class="label" x="100" y="105" text-anchor="middle">Active Days</text>
<text class="sub" x="100" y="131" text-anchor="middle">last 12 months</text>
<circle cx="300" cy="69" r="38" fill="none" stroke="#0969da" stroke-width="6"/>
<text class="big" x="300" y="80" text-anchor="middle">${streak.current}</text>
<text class="strong" x="300" y="120" text-anchor="middle">Current Streak</text>
<text class="sub" x="300" y="146" text-anchor="middle">${escapeXml(rangeLabel(streak.currentStart, streak.currentEnd))}</text>
<text class="big" x="500" y="72" text-anchor="middle">${streak.longest}</text>
<text class="label" x="500" y="105" text-anchor="middle">Longest Streak</text>
<text class="sub" x="500" y="131" text-anchor="middle">${escapeXml(rangeLabel(streak.longestStart, streak.longestEnd))}</text>
</svg>`;

const width = 820;
const height = 270;
const left = 58;
const right = 32;
const top = 72;
const bottom = 48;
const chartW = width - left - right;
const chartH = height - top - bottom;
const maxWeek = Math.max(1, ...weekly.map((w) => w.count));
const niceMax = Math.max(10, Math.ceil(maxWeek / 10) * 10);
const points = weekly.map((item, index) => ({
  x: left + (index / Math.max(1, weekly.length - 1)) * chartW,
  y: top + chartH - (item.count / niceMax) * chartH,
  ...item,
}));
const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const area = `${left},${top + chartH} ${line} ${left + chartW},${top + chartH}`;
const grids = Array.from({ length: 5 }, (_, i) => {
  const value = Math.round((niceMax / 4) * i);
  const y = top + chartH - (i / 4) * chartH;
  return `<line x1="${left}" y1="${y}" x2="${left + chartW}" y2="${y}" class="grid"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" class="small">${value}</text>`;
}).join('');
const xTickIndexes = [...new Set([
  0,
  Math.round((weekly.length - 1) * 0.25),
  Math.round((weekly.length - 1) * 0.5),
  Math.round((weekly.length - 1) * 0.75),
  weekly.length - 1,
])];
const xTicks = xTickIndexes.map((index) => {
  const p = points[index];
  return `<text x="${p.x}" y="${height - 18}" text-anchor="middle" class="small">${shortDate(p.date)}</text>`;
}).join('');
const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#fff" stroke="#0969da" stroke-width="2"><title>${p.date}: ${p.count} GitHub contribution events</title></circle>`).join('');

const activityStyles = `<style>
.bg{fill:#fff}.title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}.sub{font:400 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.small{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.grid{stroke:#d8dee4;stroke-width:1}.area{fill:#0969da;fill-opacity:.16}.line{fill:none;stroke:#0969da;stroke-width:2.75;stroke-linejoin:round;stroke-linecap:round}.border{fill:none;stroke:#d0d7de}@media(prefers-color-scheme:dark){.bg{fill:#0d1117}.title{fill:#58a6ff}.sub,.small{fill:#8b949e}.grid,.border{stroke:#30363d}.area{fill:#58a6ff;fill-opacity:.16}.line{stroke:#58a6ff}}
</style>`;

const activitySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="270" viewBox="0 0 820 270" role="img" aria-label="GitHub contribution activity for ${escapeXml(login)} over the last 90 days">
${activityStyles}
<rect class="bg" width="820" height="270" rx="8"/><rect class="border" x=".5" y=".5" width="819" height="269" rx="8"/>
<text x="28" y="34" class="title">Contribution Activity</text>
<text x="792" y="34" text-anchor="end" class="sub">last 90 days · ${fmt.format(recentTotal)} GitHub contribution events</text>
${grids}
<polygon points="${area}" class="area"/>
<polyline points="${line}" class="line"/>
${dots}${xTicks}
</svg>`;

await mkdir('assets', { recursive: true });
await Promise.all([
  writeFile('assets/github-stats.svg', statsSvg),
  writeFile('assets/github-productive-time.svg', productiveSvg),
  writeFile('assets/github-repos-language.svg', languageSvg),
  writeFile('assets/github-streak.svg', streakSvg),
  writeFile('assets/github-activity.svg', activitySvg),
]);

console.log(JSON.stringify({
  stars,
  commits,
  pullRequests: prs,
  issues,
  reviews,
  contributedTo,
  publicOwnedRepos: repositories.length,
  authoredPublicRepos: authoredRepos.length,
  commitTimestampsUsedForProductiveTime: commitDates.length,
  activeDaysLast12Months: activeDaysYear,
  currentStreak: streak.current,
  longestStreak: streak.longest,
  recentContributionEvents: recentTotal,
  recentWindowStart: recentStart,
}, null, 2));
