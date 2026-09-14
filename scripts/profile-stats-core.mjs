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
<text class="label" x="20" y="82">⌁  Total Commits:</text><text class="value" x="165" y="82">${fmt.format(commits)}</text>
<text class="label" x="20" y="106">⑂  Total PRs:</text><text class="value" x="165" y="106">${fmt.format(pullRequests)}</text>
<text class="label" x="20" y="130">!  Total Issues:</text><text class="value" x="165" y="130">${fmt.format(issues)}</text>
<text class="label" x="20" y="154">▣  Contributed to:</text><text class="value" x="165" y="154">${fmt.format(contributedTo)}</text>
<g transform="translate(337 91) rotate(-90)">
  <circle cx="0" cy="0" r="41" fill="none" stroke="#21262d" stroke-width="6"/>
  <circle cx="0" cy="0" r="41" fill="none" stroke="#58a6ff" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"/>
</g>
<text data-testid="rank-grade" class="rank" x="337" y="101" text-anchor="middle">${escapeXml(rank.level)}</text>
</svg>`;
}
