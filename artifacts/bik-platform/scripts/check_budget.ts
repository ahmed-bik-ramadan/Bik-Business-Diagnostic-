import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const entryLimit = 350_000;
const chunkLimit = 250_000;
const distUrl = new URL('../dist/', import.meta.url);
const dist = fileURLToPath(distUrl);
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.error('check:budget: missing dist/index.html. Run the build first.');
  process.exit(1);
}

// Vite emits the entry script and its initial links in index.html.
const entryFiles = new Set([index]);
const entryOrigin = new URL('https://bik.invalid/');
let hasModuleEntry = false;
const html = readFileSync(index, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
for (const [, tag, markup] of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
  const attributes = Object.fromEntries(
    Array.from(markup.matchAll(/\s([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g),
      ([, key, doubleQuoted, singleQuoted, unquoted]) =>
        [key.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted]),
  );
  const isScript = tag.toLowerCase() === 'script';
  const entryLink = /(?:^|\s)(?:stylesheet|modulepreload|preload)(?=\s|$)/i.test(attributes.rel ?? '');
  if (!isScript && !entryLink) continue;
  const reference = isScript ? attributes.src : attributes.href;
  if (!reference) continue;

  const url = new URL(reference, entryOrigin);
  if (url.origin !== entryOrigin.origin) continue;
  entryFiles.add(fileURLToPath(new URL('.' + url.pathname, distUrl)));
  if (isScript && attributes.type === 'module') hasModuleEntry = true;
}

if (!hasModuleEntry) {
  console.error('check:budget: no entry module in dist/index.html');
  process.exit(1);
}

const issues: string[] = [];
const gzipBytes = new Map<string, number>();
let largestName = '';
let largestBytes = 0;
for (const file of readdirSync(dist, { withFileTypes: true, recursive: true })) {
  if (!file.isFile() || !/\.[cm]?js$/i.test(file.name)) continue;
  const path = join(file.parentPath, file.name);
  const name = relative(dist, path);
  const bytes = gzipSync(readFileSync(path)).length;
  gzipBytes.set(path, bytes);
  if (bytes > chunkLimit) issues.push(`${name} is ${bytes} gzip bytes (limit ${chunkLimit})`);
  if (bytes > largestBytes) {
    largestBytes = bytes;
    largestName = name;
  }
}

let entryBytes = 0;
for (const path of entryFiles) {
  const content = readFileSync(path);
  // Match Vite preview's gzip threshold for text. Binary files use their on-disk size.
  const compressed = content.length >= 1024 && /\.(?:[cm]?js|css|html|json|svg|txt)$/i.test(path);
  entryBytes += compressed ? (gzipBytes.get(path) ?? gzipSync(content).length) : content.length;
}
if (entryBytes > entryLimit) issues.push(`entry assets are ${entryBytes} bytes (limit ${entryLimit})`);

if (issues.length > 0) {
  for (const issue of issues) console.error('check:budget: ' + issue);
  process.exitCode = 1;
} else {
  console.log(`check:budget: PASS (entry assets ${entryBytes}/${entryLimit} estimated served bytes, largest JS ${largestBytes}/${chunkLimit} gzip bytes: ${largestName})`);
}
