import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const entryPage = join(dist, 'index.html');
const sessionStartPaths = new Set([
  '/v1/sessions/start',          // path appended to /_bik-api in the browser build
  '/_bik-api/v1/sessions/start',
  '/api/v1/sessions/start',
]);
const apiPath = /\/(?:(?:api|_bik-api)\/)?v1\/[\w./:%-]*/g;
const forbiddenName = /^(?:server\.js|\.env(?:\..*)?)$|\.(?:env|map)$/i;

if (!lstatSync(dist, { throwIfNoEntry: false })?.isDirectory()
    || !lstatSync(entryPage, { throwIfNoEntry: false })?.isFile()) {
  console.error('check:dist: missing dist/index.html. Run the build first.');
  process.exit(1);
}

const issues: string[] = [];
let fileCount = 0;

function inspect(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = relative(dist, path);
    if (forbiddenName.test(entry.name)) {
      issues.push(`${name}: forbidden in the publish folder`);
    } else if (entry.isDirectory()) {
      inspect(path);
    } else if (entry.isFile()) {
      fileCount += 1;
      const content = readFileSync(path, 'utf8').replaceAll('\\/', '/');
      for (const endpoint of new Set(content.match(apiPath))) {
        if (!sessionStartPaths.has(endpoint)) {
          issues.push(`${name}: unexpected API path ${endpoint}`);
        }
      }
    } else {
      issues.push(`${name}: expected a regular file or directory`);
    }
  }
}

inspect(dist);

if (issues.length > 0) {
  for (const issue of issues) console.error('check:dist: ' + issue);
  process.exitCode = 1;
} else {
  console.log(`check:dist: PASS (${fileCount} files)`);
}
