import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { selectProfileLanguageRepositories, summarizeLanguages } from '../scripts/profile-stats-core.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('summarizeLanguages normalizes each repository and excludes HTML by default', () => {
  const repositories = [
    { languages: { edges: [
      { size: 9000, node: { name: 'HTML', color: '#e34c26' } },
      { size: 1000, node: { name: 'JavaScript', color: '#f1e05a' } },
      { size: 500, node: { name: 'Shell', color: '#89e051' } },
    ] } },
    { languages: { edges: [
      { size: 900, node: { name: 'Python', color: '#3572A5' } },
      { size: 100, node: { name: 'TypeScript', color: '#3178c6' } },
    ] } },
  ];

  const summary = summarizeLanguages(repositories, 10);
  assert.deepEqual(summary.map((item) => item.name), ['Python', 'JavaScript', 'Shell', 'TypeScript']);
  assert.equal(summary.some((item) => item.name === 'HTML'), false);
  assert.ok(Math.abs(summary.reduce((sum, item) => sum + item.percentage, 0) - 100) < 1e-9);
});

test('summarizeLanguages supports explicit additional exclusions', () => {
  const repositories = [{ languages: { edges: [
    { size: 500, node: { name: 'HTML', color: '#e34c26' } },
    { size: 300, node: { name: 'JavaScript', color: '#f1e05a' } },
    { size: 200, node: { name: 'Python', color: '#3572A5' } },
  ] } }];

  const summary = summarizeLanguages(repositories, 10, {
    excludedLanguages: new Set(['HTML', 'JavaScript']),
  });
  assert.deepEqual(summary.map((item) => item.name), ['Python']);
  assert.equal(summary[0].percentage, 100);
});

test('HTML, SQL and MySQL remain excluded even when a caller passes an empty exclusion set', () => {
  const repositories = [
    { languages: { edges: [
      { size: 1000, node: { name: 'HTML' } },
      { size: 1000, node: { name: 'SQL' } },
      { size: 1000, node: { name: 'MySQL' } },
      { size: 1000, node: { name: 'PLpgSQL', color: '#336790' } },
      { size: 1000, node: { name: 'TypeScript', color: '#3178c6' } },
    ] } },
    { languages: { edges: [{ size: 1000, node: { name: 'HTML' } }] } },
    { languages: { edges: [{ size: 1000, node: { name: 'SQL' } }] } },
  ];
  for (const options of [undefined, { excludedLanguages: new Set() }]) {
    const summary = summarizeLanguages(repositories, 10, options);
    assert.deepEqual(summary.map(({ name }) => name), ['PLpgSQL', 'TypeScript']);
    assert.equal(summary[0].percentage, 50);
    assert.equal(summary[1].percentage, 50);
  }
});

test('Express Cloud backup repository is excluded from profile language stats', () => {
  const repositories = [
    { nameWithOwner: 'wbizmo/express-cloud-backups', languages: { edges: [{ size: 5000, node: { name: 'JavaScript' } }] } },
    { nameWithOwner: 'wbizmo/express-cloud', languages: { edges: [{ size: 2000, node: { name: 'PHP' } }] } },
    { nameWithOwner: 'wbizmo/nairabank', languages: { edges: [{ size: 1000, node: { name: 'PLpgSQL' } }] } },
  ];
  const included = selectProfileLanguageRepositories(repositories, 'wbizmo');
  assert.equal(included.length, 2);
  assert.equal(repositories.length, 3);
  assert.deepEqual(summarizeLanguages(included).map(({ name }) => name), ['PHP', 'PLpgSQL']);
  assert.equal(selectProfileLanguageRepositories([{ nameWithOwner: 'WBIZMO/EXPRESS-CLOUD-BACKUPS' }], 'WBizmo').length, 0);
});

test('private activity generator includes all owned repos without an authorship filter', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/generate-private-activity-cards.mjs'), 'utf8');
  assert.match(source, /ownerAffiliations:\s*\[\s*OWNER\s*\]/s);
  assert.match(source, /languages\s*\(\s*first:\s*100[\s\S]*orderBy:\s*\{\s*field:\s*SIZE\s*,\s*direction:\s*DESC\s*\}/s);
  assert.match(source, /const languageRepos = selectProfileLanguageRepositories\(repositories, login\);/);
  assert.match(source, /const historyRepos = repositories\.filter/);
  assert.match(source, /summarizeLanguages\(languageRepos, 10\)/);
  assert.doesNotMatch(source, /authoredRepoIds|AuthoredBranchDiscovery|!repo\.isFork/);
  assert.doesNotMatch(source, /primaryLanguage\s*\{/);
  assert.match(source, /Top Languages/);
  assert.match(source, /owned repos/);
  assert.match(source, /slice\(0,\s*5\)/);
  assert.match(source, /slice\(5,\s*10\)/);
});
