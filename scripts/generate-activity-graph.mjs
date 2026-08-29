import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';
if (!token) throw new Error('GITHUB_TOKEN is required');

const to = new Date();
const from = new Date(to);
from.setUTCDate(from.getUTCDate() - 89);

const query = `
query Activity($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
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

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': `${login}-profile-activity-graph`,
  },
  body: JSON.stringify({
    query,
    variables: { login, from: from.toISOString(), to: to.toISOString() },
  }),
});

if (!response.ok) throw new Error(`GitHub GraphQL HTTP ${response.status}: ${await response.text()}`);
const payload = await response.json();
if (payload.errors?.length) throw new Error(JSON.stringify(payload.errors));

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) throw new Error('No contribution calendar returned');

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
  weekly.push({
    date: slice[0].date,
    count: slice.reduce((sum, day) => sum + day.count, 0),
  });
}

const fmt = new Intl.NumberFormat('en-US');
const shortDate = (iso) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: '2-digit', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`));

const width = 820;
const height = 270;
const left = 58;
const right = 32;
const top = 72;
const bottom = 48;
const chartW = width - left - right;
const chartH = height - top - bottom;
const max = Math.max(1, ...weekly.map((w) => w.count));
const niceMax = Math.max(10, Math.ceil(max / 10) * 10);

const points = weekly.map((item, index) => {
  const x = left + (index / Math.max(1, weekly.length - 1)) * chartW;
  const y = top + chartH - (item.count / niceMax) * chartH;
  return { x, y, ...item };
});

const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const area = `${left},${top + chartH} ${line} ${left + chartW},${top + chartH}`;

const yTicks = 4;
const grids = Array.from({ length: yTicks + 1 }, (_, i) => {
  const value = Math.round((niceMax / yTicks) * i);
  const y = top + chartH - (i / yTicks) * chartH;
  return `<line x1="${left}" y1="${y}" x2="${left + chartW}" y2="${y}" class="grid"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" class="axis">${value}</text>`;
}).join('');

const xTickIndexes = [...new Set([0, Math.round((weekly.length - 1) * .25), Math.round((weekly.length - 1) * .5), Math.round((weekly.length - 1) * .75), weekly.length - 1])];
const xTicks = xTickIndexes.map((index) => {
  const p = points[index];
  return `<text x="${p.x}" y="${height - 18}" text-anchor="middle" class="axis">${shortDate(p.date)}</text>`;
}).join('');

const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="point"><title>${p.date}: ${p.count} contributions</title></circle>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="270" viewBox="0 0 820 270" role="img" aria-label="GitHub contribution activity for ${login} over the last 90 days">
<style>
  .bg{fill:#ffffff}.title{font:600 19px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#0969da}.sub{font:400 12px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.axis{font:400 11px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#57606a}.grid{stroke:#d8dee4;stroke-width:1}.area{fill:#0969da;fill-opacity:.16}.line{fill:none;stroke:#0969da;stroke-width:2.75;stroke-linejoin:round;stroke-linecap:round}.point{fill:#ffffff;stroke:#0969da;stroke-width:2}.border{fill:none;stroke:#d0d7de;stroke-width:1}
  @media (prefers-color-scheme: dark){.bg{fill:#0d1117}.title{fill:#58a6ff}.sub,.axis{fill:#8b949e}.grid,.border{stroke:#30363d}.area{fill:#58a6ff;fill-opacity:.16}.line{stroke:#58a6ff}.point{fill:#0d1117;stroke:#58a6ff}}
</style>
<rect class="bg" width="820" height="270" rx="8"/>
<rect class="border" x=".5" y=".5" width="819" height="269" rx="8"/>
<text x="28" y="34" class="title">Contribution Activity</text>
<text x="792" y="34" text-anchor="end" class="sub">last 90 days · ${fmt.format(calendar.totalContributions)} contributions</text>
${grids}
<polygon points="${area}" class="area"/>
<polyline points="${line}" class="line"/>
${dots}
${xTicks}
</svg>`;

await mkdir('assets', { recursive: true });
await writeFile('assets/github-activity.svg', svg);
console.log(`Generated assets/github-activity.svg for ${login}: ${calendar.totalContributions} contributions in GraphQL window`);
