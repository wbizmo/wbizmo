import { mkdir, rename, writeFile } from 'node:fs/promises';
import { assertAuthenticatedLogin, escapeXml } from './profile-stats-core.mjs';

const token = process.env.PROFILE_STATS_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';
const utcOffset = 1;

if (!token) throw new Error('PROFILE_STATS_TOKEN is required');

async function gql(query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': `${login}-private-activity-cards`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error('GitHub GraphQL request failed; verify PROFILE_STATS_TOKEN permissions and SSO authorization');
  }
  return payload.data;
}

const identity = await gql(`
query AuthenticatedViewer {
  viewer { login }
}`);
assertAuthenticatedLogin(identity.viewer?.login, login);

const profileQuery = `
query PrivateAwareProfile($login: String!, $after: String) {
  user(login: $login) {
    id
    createdAt
    repositories(
      first: 100
      after: $after
      ownerAffiliations: OWNER
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      nodes {
        id
        isFork
        primaryLanguage { name color }
        defaultBranchRef { name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

let after = null;
let userId = null;
let createdAt = null;
const repositories = [];

do {
  const data = await gql(profileQuery, { login, after });
  const user = data.user;
  if (!user) throw new Error(`GitHub profile ${login} was not found`);

  userId ??= user.id;
  createdAt ??= user.createdAt;
  repositories.push(...user.repositories.nodes);
  after = user.repositories.pageInfo.hasNextPage
    ? user.repositories.pageInfo.endCursor
    : null;
} while (after);

if (!userId || !createdAt) throw new Error('Required GitHub profile data was not returned');

const authoredRepos = repositories.filter((repo) => !repo.isFork && repo.defaultBranchRef);

const contributionQuery = `
query PrivateAwareContributions($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
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
  const calendar = data.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error('GitHub did not return the contribution calendar');

  const segmentStart = cursor.toISOString().slice(0, 10);
  const segmentEnd = end.toISOString().slice(0, 10);
  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      if (day.date >= segmentStart && day.date <= segmentEnd) {
        contributionDaysByDate.set(day.date, day.contributionCount);
      }
    }
  }

  cursor = new Date(end);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

const historyQuery = `
query PrivateAwareRepoHistory($repoId: ID!, $authorId: ID!, $after: String) {
  node(id: $repoId) {
    ... on Repository {
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
  }
}`;

const commitDates = [];
for (const repo of authoredRepos) {
  let historyAfter = null;
  do {
    const data = await gql(historyQuery, {
      repoId: repo.id,
      authorId: userId,
      after: historyAfter,
    });
    const history = data.node?.defaultBranchRef?.target?.history;
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
  .small{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .sub{font:400 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}
  .grid{stroke:#d8dee4;stroke-width:1}.track{fill:#eaeef2}
  @media(prefers-color-scheme:dark){
    .bg{fill:#0d1117}.border,.grid{stroke:#30363d}.track{fill:#21262d}
    .title,.value{fill:#58a6ff}.label,.small,.sub{fill:#8b949e}
  }
</style>`;

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

const productiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Private-aware commit time distribution for ${escapeXml(login)}">
${sharedStyles}
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">Commits (UTC +1.00)</text><text class="sub" x="410" y="29" text-anchor="end">all accessible default branches</text>
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

const languageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Private-aware repositories per language for ${escapeXml(login)}">
${sharedStyles}
<rect class="bg" width="430" height="180" rx="8"/><rect class="border" x=".5" y=".5" width="429" height="179" rx="8"/>
<text class="title" x="18" y="30">Repos per Language</text><text class="sub" x="410" y="29" text-anchor="end">${authoredRepos.length} accessible authored repos</text>
${languageBars}
</svg>`;

const shortDate = (iso) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`));

const recentStartDate = new Date(now);
recentStartDate.setUTCDate(recentStartDate.getUTCDate() - 89);
const recentDays = [];
for (let i = 0; i < 90; i += 1) {
  const d = new Date(recentStartDate);
  d.setUTCDate(recentStartDate.getUTCDate() + i);
  const date = d.toISOString().slice(0, 10);
  recentDays.push({ date, count: contributionDaysByDate.get(date) ?? 0 });
}

const weekly = [];
for (let i = 0; i < recentDays.length; i += 7) {
  const slice = recentDays.slice(i, i + 7);
  weekly.push({
    date: slice[0].date,
    count: slice.reduce((sum, day) => sum + day.count, 0),
  });
}

const activityWidth = 820;
const activityHeight = 270;
const left = 58;
const right = 32;
const top = 72;
const bottom = 48;
const chartW = activityWidth - left - right;
const chartH = activityHeight - top - bottom;
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
  return `<text x="${p.x}" y="${activityHeight - 18}" text-anchor="middle" class="small">${shortDate(p.date)}</text>`;
}).join('');
const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#fff" stroke="#0969da" stroke-width="2"><title>${p.date}: ${p.count} GitHub contribution events</title></circle>`).join('');
const recentTotal = recentDays.reduce((sum, day) => sum + day.count, 0);

const activityStyles = `<style>
.bg{fill:#fff}.title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}.sub{font:400 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.small{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.grid{stroke:#d8dee4;stroke-width:1}.area{fill:#0969da;fill-opacity:.16}.line{fill:none;stroke:#0969da;stroke-width:2.75;stroke-linejoin:round;stroke-linecap:round}.border{fill:none;stroke:#d0d7de}@media(prefers-color-scheme:dark){.bg{fill:#0d1117}.title{fill:#58a6ff}.sub,.small{fill:#8b949e}.grid,.border{stroke:#30363d}.area{fill:#58a6ff;fill-opacity:.16}.line{stroke:#58a6ff}}
</style>`;

const activitySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="270" viewBox="0 0 820 270" role="img" aria-label="Private-aware GitHub activity for ${escapeXml(login)}">
${activityStyles}
<rect class="bg" width="820" height="270" rx="8"/><rect class="border" x=".5" y=".5" width="819" height="269" rx="8"/>
<text class="title" x="24" y="34">GitHub Activity</text>
<text class="sub" x="796" y="33" text-anchor="end">${recentTotal} contributions · last 90 days</text>
${grids}
<polygon class="area" points="${area}"/><polyline class="line" points="${line}"/>
${dots}${xTicks}
</svg>`;

await mkdir('assets', { recursive: true });
const outputs = [
  ['assets/github-productive-time.svg', productiveSvg],
  ['assets/github-repos-language.svg', languageSvg],
  ['assets/github-activity.svg', activitySvg],
];

for (const [outputPath, svg] of outputs) {
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, svg, 'utf8');
  await rename(temporaryPath, outputPath);
}

console.log(JSON.stringify({
  login,
  accessibleAuthoredRepositories: authoredRepos.length,
  defaultBranchCommitsAnalysed: commitDates.length,
  contributionsLast90Days: recentTotal,
  cards: outputs.map(([path]) => path),
}, null, 2));
