import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const CARD_REPLACEMENTS = [
  {
    local: './assets/github-stats.svg',
    external: /https:\/\/github-readme-stats(?:\.shion\.dev|\.vercel\.app)\/api\?[^"\s]+/g,
  },
  {
    local: './assets/github-productive-time.svg',
    external: /https:\/\/github-profile-summary-cards\.vercel\.app\/api\/cards\/productive-time\?[^"\s]+/g,
  },
  {
    local: './assets/github-repos-language.svg',
    external: /https:\/\/github-profile-summary-cards\.vercel\.app\/api\/cards\/repos-per-language\?[^"\s]+/g,
  },
  {
    local: './assets/github-activity.svg',
    external: /https:\/\/github-profile-summary-cards\.vercel\.app\/api\/cards\/profile-details\?[^"\s]+/g,
  },
];

export function activatePrivateStatsCard(readme) {
  let activated = readme;
  for (const { local, external } of CARD_REPLACEMENTS) {
    activated = activated.replace(external, local);
  }
  return activated;
}

async function main() {
  const readme = await readFile('README.md', 'utf8');
  const activated = activatePrivateStatsCard(readme);
  if (activated !== readme) await writeFile('README.md', activated, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
