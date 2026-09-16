import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { summarizeLanguages } from '../scripts/profile-stats-core.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('summarizeLanguages normalizes each authored repository so one huge codebase cannot dominate the profile', () => {
  const repositories = [
    { languages: { edges: [
      { size: 9000, node: { name: 'HTML', color: '#e34c26' } },
      { size: 1000, node: { name: 'JavaScript', color: '#f1e05a' } },
    ] } },
    { languages: { edges: [
      { size: 900, node: { name: 'Python', color: '#3572A5' } },
      { size: 100, node: { name: 'TypeScript', color: '#3178c6' } },
    ] } },
  ];

  const summary = summarizeLanguages(repositories, 10);
  assert.deepEqual(summary.map((item) => item.name), ['HTML', 'Python', 'JavaScript', 'TypeScript']);
  assert.equal(summary[0].percentage, 45);
  assert.equal(summary[1].percentage, 45);
  assert.equal(summary[2].percentage, 5);
  assert.equal(summary[3].percentage, 5);
  assert.equal(summary[0].repositories, 1);
  assert.equal(summary.reduce((sum, item) => sum + item.percentage, 0), 100);
});

test('private activity generator includes accessible affiliations and discovers authored work beyond default branches', () => {
  const source = readFileSync(resolve(repoRoot, 'scripts/generate-private-activity-cards.mjs'), 'utf8');
  assert.match(source, /ownerAffiliations:\s*\[\s*OWNER\s*,\s*COLLABORATOR\s*,\s*ORGANIZATION_MEMBER\s*\]/s);
  assert.match(source, /languages\s*\(\s*first:\s*100[\s\S]*orderBy:\s*\{\s*field:\s*SIZE\s*,\s*direction:\s*DESC\s*\}/s);
  assert.match(source, /refs\s*\(\s*refPrefix:\s*"refs\/heads\/"[\s\S]*first:\s*25[\s\S]*after:\s*\$refsAfter/s);
  assert.match(source, /history\s*\(\s*first:\s*1[\s\S]*author:\s*\{\s*id:\s*\$authorId\s*\}/s);
  assert.match(source, /authoredRepoIds\.add\(repo\.id\)/);
  assert.match(source, /if\s*\(authoredRepoIds\.has\(repo\.id\)\)\s*continue/);
  assert.match(source, /languageRepos\s*=\s*accessibleRepos\.filter/);
  assert.match(source, /summarizeLanguages\s*\(languageRepos,\s*10\)/);
  assert.doesNotMatch(source, /primaryLanguage\s*\{/);
  assert.match(source, /Top Languages/);
  assert.match(source, /all branches checked/);
  assert.match(source, /slice\(0,\s*5\)/);
  assert.match(source, /slice\(5,\s*10\)/);
});
