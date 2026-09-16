import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { summarizeLanguages } from '../scripts/profile-stats-core.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('summarizeLanguages aggregates Linguist bytes across repositories and returns top ten percentages', () => {
  const repositories = [
    { languages: { edges: [
      { size: 600, node: { name: 'TypeScript', color: '#3178c6' } },
      { size: 300, node: { name: 'Go', color: '#00add8' } },
      { size: 100, node: { name: 'HTML', color: '#e34c26' } },
    ] } },
    { languages: { edges: [
      { size: 400, node: { name: 'TypeScript', color: '#3178c6' } },
      { size: 250, node: { name: 'Python', color: '#3572A5' } },
      { size: 200, node: { name: 'PHP', color: '#4F5D95' } },
      { size: 150, node: { name: 'Shell', color: '#89e051' } },
      { size: 120, node: { name: 'CSS', color: '#563d7c' } },
      { size: 100, node: { name: 'JavaScript', color: '#f1e05a' } },
      { size: 90, node: { name: 'Rust', color: '#dea584' } },
      { size: 80, node: { name: 'Dart', color: '#00B4AB' } },
      { size: 70, node: { name: 'Kotlin', color: '#A97BFF' } },
      { size: 60, node: { name: 'Swift', color: '#F05138' } },
      { size: 50, node: { name: 'C', color: '#555555' } },
    ] } },
  ];

  const summary = summarizeLanguages(repositories, 10);
  assert.equal(summary.length, 10);
  assert.equal(summary[0].name, 'TypeScript');
  assert.equal(summary[0].bytes, 1000);
  assert.equal(summary[1].name, 'Go');
  assert.equal(summary.at(-1).name, 'Dart');
  assert.ok(summary.every((item) => item.percentage > 0));
  const totalPercentage = summary.reduce((sum, item) => sum + item.percentage, 0);
  assert.ok(totalPercentage < 100, 'top ten percentage should be based on all language bytes, including omitted languages');
});

test('private activity generator includes accessible affiliations but limits language totals to repos with authored default-branch commits', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/generate-private-activity-cards.mjs'), 'utf8');
  assert.match(source, /ownerAffiliations:\s*\[\s*OWNER\s*,\s*COLLABORATOR\s*,\s*ORGANIZATION_MEMBER\s*\]/s);
  assert.match(source, /languages\s*\(\s*first:\s*100[\s\S]*orderBy:\s*\{\s*field:\s*SIZE\s*,\s*direction:\s*DESC\s*\}/s);
  assert.match(source, /edges\s*\{[\s\S]*size[\s\S]*node\s*\{[\s\S]*name[\s\S]*color/s);
  assert.match(source, /authoredRepoIds\.add\(repo\.id\)/);
  assert.match(source, /languageRepos\s*=\s*accessibleRepos\.filter/);
  assert.match(source, /summarizeLanguages\s*\(languageRepos,\s*10\)/);
  assert.doesNotMatch(source, /primaryLanguage\s*\{/);
  assert.match(source, /Top Languages/);
  assert.match(source, /slice\(0,\s*5\)/);
  assert.match(source, /slice\(5,\s*10\)/);
});
