import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  calculateRank,
  assertAuthenticatedLogin,
  mergeContributionTotals,
  escapeXml,
  renderStatsSvg,
} from '../scripts/profile-stats-core.mjs';

const medianFixture = {
  commits: 1000,
  pullRequests: 50,
  issues: 25,
  reviews: 2,
  stars: 50,
  followers: 10,
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('calculateRank matches the upstream median fixture', () => {
  const rank = calculateRank(medianFixture);
  assert.equal(rank.level, 'B+');
  assert.equal(rank.percentile, 50);
});

test('calculateRank gives a new account C and a very high activity account S', () => {
  assert.equal(calculateRank({ commits: 0, pullRequests: 0, issues: 0, reviews: 0, stars: 0, followers: 0 }).level, 'C');
  assert.equal(calculateRank({ commits: 100000, pullRequests: 10000, issues: 10000, reviews: 10000, stars: 10000, followers: 10000 }).level, 'S');
});

test('assertAuthenticatedLogin accepts the expected account and rejects a mismatch', () => {
  assert.doesNotThrow(() => assertAuthenticatedLogin('wbizmo', 'wbizmo'));
  assert.doesNotThrow(() => assertAuthenticatedLogin('WBizmo', 'wbizmo'));
  assert.throws(() => assertAuthenticatedLogin('someone-else', 'wbizmo'), /authenticated GitHub account/i);
});

test('mergeContributionTotals accumulates lifetime windows without mutating the input', () => {
  const total = { commits: 10, pullRequests: 2, issues: 3, reviews: 4 };
  const window = {
    totalCommitContributions: 7,
    totalPullRequestContributions: 5,
    totalIssueContributions: 11,
    totalPullRequestReviewContributions: 13,
  };
  const merged = mergeContributionTotals(total, window);
  assert.deepEqual(merged, { commits: 17, pullRequests: 7, issues: 14, reviews: 17 });
  assert.deepEqual(total, { commits: 10, pullRequests: 2, issues: 3, reviews: 4 });
});

test('escapeXml escapes untrusted SVG text', () => {
  assert.equal(escapeXml(`<wbizmo & "friends">`), '&lt;wbizmo &amp; &quot;friends&quot;&gt;');
});

test('renderStatsSvg is deterministic, borderless, ranked, and does not leak extra metadata', () => {
  const model = {
    login: 'wbizmo',
    stars: 3,
    commits: 3169,
    pullRequests: 149,
    issues: 113,
    reviews: 42,
    followers: 20,
    contributedTo: 23,
    rank: calculateRank({ commits: 3169, pullRequests: 149, issues: 113, reviews: 42, stars: 3, followers: 20 }),
    privateRepositories: ['secret-client-repo'],
  };
  const first = renderStatsSvg(model);
  const second = renderStatsSvg(model);
  assert.equal(first, second);
  assert.match(first, /Total Commits:<\/text><text[^>]*>3,169<\/text>/);
  assert.match(first, /data-testid="rank-grade"/);
  assert.doesNotMatch(first, /<text[^>]*>rank<\/text>/);
  assert.doesNotMatch(first, /class="border"/);
  assert.doesNotMatch(first, /secret-client-repo/);
});

test('private stats generator requires the dedicated profile token before any network work', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-private-profile-stats.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, PROFILE_STATS_TOKEN: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROFILE_STATS_TOKEN is required/);
});

test('private stats generator verifies viewer identity and fetches followers plus yearly contribution totals', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/generate-private-profile-stats.mjs'), 'utf8');
  assert.match(source, /viewer\s*\{\s*login\s*\}/s);
  assert.match(source, /assertAuthenticatedLogin/);
  assert.match(source, /followers\s*\{\s*totalCount\s*\}/s);
  assert.match(source, /totalCommitContributions/);
  assert.match(source, /totalPullRequestReviewContributions/);
  assert.match(source, /mergeContributionTotals/);
  assert.match(source, /renderStatsSvg/);
  assert.match(source, /PROFILE_STATS_TOKEN/);
  assert.doesNotMatch(source, /console\.log\([^\n]*token/i);
});

test('profile stats workflow is scheduled, manual, main-push triggered, secret-backed, and resilient to stale reruns', () => {
  const source = readFileSync(resolve(repoRoot, '.github/workflows/profile-stats.yml'), 'utf8');
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /schedule:/);
  assert.match(source, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(source, /PROFILE_STATS_TOKEN:\s*\$\{\{ secrets\.PROFILE_STATS_TOKEN \}\}/);
  assert.match(source, /git fetch origin main/);
  assert.match(source, /git reset --hard origin\/main/);
  assert.match(source, /node scripts\/generate-private-profile-stats\.mjs/);
  assert.match(source, /node scripts\/activate-private-profile-stats\.mjs/);
  assert.match(source, /git add assets\/github-stats\.svg assets\/github-productive-time\.svg assets\/github-repos-language\.svg assets\/github-activity\.svg README\.md/);
  assert.match(source, /git pull --rebase origin main/);
  assert.doesNotMatch(source, /PROFILE_STATS_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

test('activation script switches the README stats card to the local card idempotently', async () => {
  const { activatePrivateStatsCard } = await import('../scripts/activate-private-profile-stats.mjs');
  const source = '<img src="https://github-readme-stats.shion.dev/api?username=wbizmo&hide_border=true" alt="Williams stats">';
  const activated = activatePrivateStatsCard(source);
  assert.match(activated, /src="\.\/assets\/github-stats\.svg"/);
  assert.doesNotMatch(activated, /github-readme-stats\.shion\.dev/);
  assert.equal(activatePrivateStatsCard(activated), activated);
});

test('profile README uses local private-aware cards but leaves the streak card untouched', () => {
  const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /github-profile-summary-cards\.vercel\.app/);
  for (const file of [
    'github-stats.svg',
    'github-productive-time.svg',
    'github-repos-language.svg',
    'github-activity.svg',
  ]) {
    assert.match(readme, new RegExp(`src="\\.\\/assets\\/${file.replace('.', '\\.')}`));
  }
  assert.match(readme, /src="https:\/\/streak-stats\.demolab\.com\?user=wbizmo[^"\s]*"/);
  assert.doesNotMatch(readme, /src="\.\/assets\/github-streak\.svg"/);
});

test('private activity generator uses the authenticated profile token and includes private repositories', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/generate-private-activity-cards.mjs'), 'utf8');
  assert.match(source, /process\.env\.PROFILE_STATS_TOKEN/);
  assert.match(source, /viewer\s*\{\s*login\s*\}/s);
  assert.match(source, /assertAuthenticatedLogin/);
  assert.match(source, /ownerAffiliations:\s*OWNER/);
  assert.doesNotMatch(source, /privacy:\s*PUBLIC/);
  assert.doesNotMatch(source, /process\.env\.GITHUB_TOKEN/);
  assert.match(source, /github-productive-time\.svg/);
  assert.match(source, /github-repos-language\.svg/);
  assert.match(source, /github-activity\.svg/);
  assert.doesNotMatch(source, /github-streak\.svg/);
});

test('profile stats workflow refreshes private-aware cards from the dedicated profile token without touching streak', () => {
  const source = readFileSync(resolve(repoRoot, '.github/workflows/profile-stats.yml'), 'utf8');
  assert.match(source, /node scripts\/generate-private-activity-cards\.mjs/);
  assert.match(source, /PROFILE_STATS_TOKEN:\s*\$\{\{ secrets\.PROFILE_STATS_TOKEN \}\}/);
  assert.doesNotMatch(source, /GITHUB_TOKEN:\s*\$\{\{ secrets\.PROFILE_STATS_TOKEN \}\}/);
  assert.match(source, /git add assets\/github-stats\.svg assets\/github-productive-time\.svg assets\/github-repos-language\.svg assets\/github-activity\.svg README\.md/);
  assert.doesNotMatch(source, /git add[^\n]*github-streak\.svg/);
});
