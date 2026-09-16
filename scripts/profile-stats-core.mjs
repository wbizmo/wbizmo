const THRESHOLDS = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
const LEVELS = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
const fmt = new Intl.NumberFormat('en-US');

function exponentialCdf(x) {
  return 1 - 2 ** -x;
}

function logNormalCdf(x) {
  return x / (1 + x);
}

export function calculateRank({
  commits,
  pullRequests,
  issues,
  reviews,
  stars,
  followers,
}) {
  const totalWeight = 12;
  const weighted =
    2 * exponentialCdf(commits / 1000) +
    3 * exponentialCdf(pullRequests / 50) +
    1 * exponentialCdf(issues / 25) +
    1 * exponentialCdf(reviews / 2) +
    4 * logNormalCdf(stars / 50) +
    1 * logNormalCdf(followers / 10);

  const percentile = (1 - weighted / totalWeight) * 100;
  const thresholdIndex = THRESHOLDS.findIndex((threshold) => percentile <= threshold);
  return {
    level: LEVELS[thresholdIndex === -1 ? LEVELS.length - 1 : thresholdIndex],
    percentile,
  };
}

export function assertAuthenticatedLogin(actual, expected) {
  if (!actual || !expected || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Authenticated GitHub account ${actual || '<unknown>'} does not match expected profile ${expected || '<unknown>'}`);
  }
}

export function mergeContributionTotals(total, window) {
  return {
    commits: total.commits + window.totalCommitContributions,
    pullRequests: total.pullRequests + window.totalPullRequestContributions,
    issues: total.issues + window.totalIssueContributions,
    reviews: total.reviews + window.totalPullRequestReviewContributions,
  };
}

export function mergeLineChangeTotals(total, commits, seenCommitOids) {
  let next = total;
  for (const commit of commits) {
    if (seenCommitOids.has(commit.oid)) continue;
    seenCommitOids.add(commit.oid);
    next += commit.additions + commit.deletions;
  }
  return next;
}

export function summarizeLanguages(repositories, limit = 10) {
  const totals = new Map();
  let contributingRepositories = 0;

  for (const repository of repositories) {
    const edges = (repository.languages?.edges ?? []).filter((edge) => {
      const name = edge?.node?.name;
      const size = Number(edge?.size) || 0;
      return Boolean(name) && size > 0;
    });
    const repositoryBytes = edges.reduce((sum, edge) => sum + Number(edge.size), 0);
    if (repositoryBytes <= 0) continue;

    contributingRepositories += 1;
    const seenLanguages = new Set();

    for (const edge of edges) {
      const name = edge.node.name;
      const size = Number(edge.size);
      const current = totals.get(name) || {
        weight: 0,
        bytes: 0,
        repositories: 0,
        color: edge.node.color || '#8c959f',
      };

      current.weight += size / repositoryBytes;
      current.bytes += size;
      if (!seenLanguages.has(name)) {
        current.repositories += 1;
        seenLanguages.add(name);
      }
      if ((!current.color || current.color === '#8c959f') && edge.node.color) {
        current.color = edge.node.color;
      }
      totals.set(name, current);
    }
  }

  return [...totals.entries()]
    .map(([name, data]) => ({
      name,
      bytes: data.bytes,
      repositories: data.repositories,
      color: data.color || '#8c959f',
      percentage: contributingRepositories > 0
        ? (data.weight / contributingRepositories) * 100
        : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage || b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderStatsSvg({
  login,
  stars,
  commits,
  pullRequests,
  issues,
  contributedTo,
  linesChanged,
  rank,
}) {
  const safeLogin = escapeXml(login);
  const circumference = 2 * Math.PI * 41;
  const completion = Math.max(0, Math.min(100, 100 - rank.percentile));
  const dash = (circumference * completion) / 100;
  const gap = circumference - dash;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="180" viewBox="0 0 430 180" role="img" aria-label="Lifetime GitHub stats for ${safeLogin}">
<style>
  .bg{fill:#0d1117}.title{font:600 18px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#58a6ff}
  .label{font:400 13px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#8b949e}
  .value{font:600 13px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#58a6ff}
  .rank{font:700 34px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;fill:#58a6ff}
</style>
<rect class="bg" width="430" height="180" rx="8"/>
<text class="title" x="18" y="28">${safeLogin}&apos;s GitHub Stats</text>
<text class="label" x="20" y="58">★  Total Stars:</text><text class="value" x="165" y="58">${fmt.format(stars)}</text>
<text class="label" x="20" y="78">⌁  Total Commits:</text><text class="value" x="165" y="78">${fmt.format(commits)}</text>
<text class="label" x="20" y="98">⑂  Total PRs:</text><text class="value" x="165" y="98">${fmt.format(pullRequests)}</text>
<text class="label" x="20" y="118">!  Total Issues:</text><text class="value" x="165" y="118">${fmt.format(issues)}</text>
<text class="label" x="20" y="138">▣  Contributed to:</text><text class="value" x="165" y="138">${fmt.format(contributedTo)}</text>
<text class="label" x="20" y="158">±  Lines Changed:</text><text class="value" x="165" y="158">${fmt.format(linesChanged)}</text>
<g transform="translate(337 91) rotate(-90)">
  <circle cx="0" cy="0" r="41" fill="none" stroke="#21262d" stroke-width="6"/>
  <circle cx="0" cy="0" r="41" fill="none" stroke="#58a6ff" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"/>
</g>
<text data-testid="rank-grade" class="rank" x="337" y="101" text-anchor="middle">${escapeXml(rank.level)}</text>
</svg>`;
}
