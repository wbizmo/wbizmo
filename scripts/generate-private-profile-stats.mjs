import { mkdir, rename, writeFile } from 'node:fs/promises';
import {
  assertAuthenticatedLogin,
  calculateRank,
  mergeContributionTotals,
  renderStatsSvg,
} from './profile-stats-core.mjs';

const token = process.env.PROFILE_STATS_TOKEN;
const login = process.env.PROFILE_LOGIN || 'wbizmo';

if (!token) {
  throw new Error('PROFILE_STATS_TOKEN is required');
}

async function gql(query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': `${login}-private-profile-stats`,
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
query ProfileStats($login: String!, $after: String) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    repositoriesContributedTo(
      first: 1
      contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW]
      includeUserRepositories: true
    ) { totalCount }
    repositories(
      first: 100
      after: $after
      ownerAffiliations: OWNER
      privacy: PUBLIC
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      nodes { stargazerCount }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

let profileAfter = null;
let createdAt = null;
let followers = null;
let contributedTo = null;
let stars = 0;

do {
  const data = await gql(profileQuery, { login, after: profileAfter });
  const user = data.user;
  if (!user) throw new Error(`GitHub profile ${login} was not found`);

  createdAt ??= user.createdAt;
  followers ??= user.followers.totalCount;
  contributedTo ??= user.repositoriesContributedTo.totalCount;
  stars += user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);
  profileAfter = user.repositories.pageInfo.hasNextPage
    ? user.repositories.pageInfo.endCursor
    : null;
} while (profileAfter);

if (!createdAt || followers === null || contributedTo === null) {
  throw new Error('Required profile statistics were not returned by GitHub');
}

const contributionQuery = `
query LifetimeContributions($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
    }
  }
}`;

const now = new Date();
let cursor = new Date(createdAt);
let totals = { commits: 0, pullRequests: 0, issues: 0, reviews: 0 };

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
  const collection = data.user?.contributionsCollection;
  if (!collection) {
    throw new Error('GitHub did not return the required contribution collection');
  }

  totals = mergeContributionTotals(totals, collection);
  cursor = new Date(end);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

const rank = calculateRank({
  ...totals,
  stars,
  followers,
});
const svg = renderStatsSvg({
  login,
  stars,
  commits: totals.commits,
  pullRequests: totals.pullRequests,
  issues: totals.issues,
  reviews: totals.reviews,
  followers,
  contributedTo,
  rank,
});

await mkdir('assets', { recursive: true });
const outputPath = 'assets/github-stats.svg';
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, svg, 'utf8');
await rename(temporaryPath, outputPath);

console.log(JSON.stringify({
  login,
  stars,
  commits: totals.commits,
  pullRequests: totals.pullRequests,
  issues: totals.issues,
  reviews: totals.reviews,
  followers,
  contributedTo,
  rank: rank.level,
}, null, 2));
