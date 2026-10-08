import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { summarizeLanguages } from '../scripts/profile-stats-core.mjs';

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

test('summarizeLanguages can include HTML-only repositories when requested', () => {
  const repositories = [
    { languages: { edges: [{ size: 2000, node: { name: 'HTML', color: '#e34c26' } }] } },
    { languages: { edges: [{ size: 500, node: { name: 'Python', color: '#3572A5' } }] } },
    { languages: { edges: [] } },
  ];
  const summary = summarizeLanguages(repositories, 10, { excludedLanguages: new Set() });
  assert.deepEqual(summary.map((item) => item.name), ['HTML', 'Python']);
  assert.equal(summary[0].percentage, 50);
  assert.equal(summary[1].percentage, 50);
});

test('private activity generator includes all owned repos without an authorship filter', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/generate-private-activity-cards.mjs'), 'utf8');
  assert.match(source, /ownerAffiliations:\s*\[\s*OWNER\s*\]/s);
  assert.match(source, /languages\s*\(\s*first:\s*100[\s\S]*orderBy:\s*\{\s*field:\s*SIZE\s*,\s*direction:\s*DESC\s*\}/s);
  assert.match(source, /const languageRepos = repositories;/);
  assert.match(source, /const historyRepos = repositories\.filter/);
  assert.match(source, /summarizeLanguages\(languageRepos, 10, \{ excludedLanguages: new Set\(\) \}\)/);
  assert.doesNotMatch(source, /authoredRepoIds|AuthoredBranchDiscovery|!repo\.isFork/);
  assert.doesNotMatch(source, /primaryLanguage\s*\{/);
  assert.match(source, /Top Languages/);
  assert.match(source, /owned repos/);
  assert.match(source, /slice\(0,\s*5\)/);
  assert.match(source, /slice\(5,\s*10\)/);
});
