import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const packageRoot = new URL('../', import.meta.url);
const template = JSON.parse(readFileSync(new URL('release.json', packageRoot), 'utf8'));
assert.equal(template.commit, '__COMMIT_SHORT_HASH__');
const revision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: packageRoot, encoding: 'utf8' }).trim();
assert.match(revision, /^[0-9a-f]{7,64}$/i, 'The release needs a Git commit hash.');

const commit = revision.slice(0, 7);
const publicRelease = JSON.parse(readFileSync(new URL('public/release.json', packageRoot), 'utf8'));
const builtRelease = {
  ...publicRelease,
  ...template,
  commit,
  sourceCommit: commit,
  generatedAt: new Date().toISOString(),
};
writeFileSync(new URL('dist/release.json', packageRoot), JSON.stringify(builtRelease, null, 2) + '\n');
