import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LOCAL_CARD = './assets/github-stats.svg';
const EXTERNAL_CARD = /https:\/\/github-readme-stats(?:\.shion\.dev|\.vercel\.app)\/api\?[^"\s]+/;

export function activatePrivateStatsCard(readme) {
  if (readme.includes(`src="${LOCAL_CARD}"`)) return readme;
  if (!EXTERNAL_CARD.test(readme)) {
    throw new Error('Could not find the external GitHub stats card in README.md');
  }
  return readme.replace(EXTERNAL_CARD, LOCAL_CARD);
}

async function main() {
  const readme = await readFile('README.md', 'utf8');
  const activated = activatePrivateStatsCard(readme);
  if (activated !== readme) await writeFile('README.md', activated, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
