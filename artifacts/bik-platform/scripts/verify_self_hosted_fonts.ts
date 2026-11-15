import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
assert.ok(existsSync(join(dist, 'index.html')), 'build the application before testing self-hosted fonts');
const files = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(join(folder, entry.name)) : [join(folder, entry.name)]);
const output = files(dist);
for (const file of output.filter(file => /(?:index\.html|\.(?:css|js))$/.test(file))) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /googleapis|gstatic/i, `${file}: no Google font domain in built output`);
}
const woff2 = output.filter(file => file.endsWith('.woff2'));
for (const [family, weights] of [
  ['noto-sans-arabic', [400, 500, 600, 700, 800, 900]],
  ['noto-naskh-arabic', [500, 700]]
] as const) {
  for (const subset of ['arabic', 'latin']) for (const weight of weights) {
    assert.ok(woff2.some(file => file.includes(`${family}-${subset}-${weight}-normal`)), `${family}: local ${subset} ${weight} WOFF2 exists`);
  }
}
const css = output.filter(file => file.endsWith('.css')).map(file => readFileSync(file, 'utf8')).join('\n');
assert.match(css, /font-display:\s*swap/, 'local fonts preserve swap display');
const sizes = Object.fromEntries(['woff2', 'woff'].map(extension => [extension, output.filter(file => file.endsWith('.' + extension)).reduce((sum, file) => sum + statSync(file).size, 0)]));
console.log(`SELF-HOSTED FONTS: PASSED; WOFF2=${sizes.woff2} bytes (${(sizes.woff2 / 1000).toFixed(3)} KB); WOFF=${sizes.woff} bytes (${(sizes.woff / 1000).toFixed(3)} KB)`);
