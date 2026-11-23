import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = new URL('../../../docs/codex/bik-library-v2.json', import.meta.url);
const library: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(source)));
const dialects = ['egypt', 'saudi', 'emirati', 'gulf_generic', 'msa_neutral'];
const copyFields = ['headline', 'meaning', 'action'];
const expectedGroups = new Map([[1, 80], [2, 5], [3, 20]]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const pathways = asRecord(library)?.pathways;
assert.ok(Array.isArray(pathways), 'The library must contain a pathways array.');

const structureIssues: string[] = [];
function check(condition: boolean, message: string) {
  if (!condition) structureIssues.push(message);
}

const ids = new Set<string>();
const groupCounts = new Map<number, number>();
let flaggedCount = 0;
check(pathways.length === 105, `Expected 105 pathways, found ${pathways.length}.`);

for (const [index, item] of pathways.entries()) {
  const pathway = asRecord(item);
  if (!pathway) {
    structureIssues.push(`pathways[${index}] must be an object.`);
    continue;
  }

  const id = pathway.id;
  const label = hasText(id) ? id : `pathways[${index}]`;
  if (hasText(id)) {
    check(!ids.has(id), `Duplicate pathway ID: ${id}.`);
    ids.add(id);
  } else {
    structureIssues.push(`${label}.id must be non-empty text.`);
  }

  const dialectText = asRecord(pathway.dialects);
  const platformCopy = asRecord(pathway.platform_copy);
  for (const key of dialects) {
    check(hasText(dialectText?.[key]), `${label}.dialects.${key} must be non-empty text.`);
    const copy = asRecord(platformCopy?.[key]);
    for (const field of copyFields) {
      check(hasText(copy?.[field]), `${label}.platform_copy.${key}.${field} must be non-empty text.`);
    }
  }

  const method = asRecord(pathway.method_fields);
  const chain = method?.why_chain;
  check(Array.isArray(chain) && chain.length === 5 && chain.every(hasText),
    `${label}.method_fields.why_chain must contain five non-empty strings.`);
  check(hasText(method?.kaizen_control), `${label}.method_fields.kaizen_control must be non-empty text.`);
  check(hasText(method?.decision_required), `${label}.method_fields.decision_required must be non-empty text.`);

  const flag = pathway.scope_flag;
  if (typeof flag === 'string' ? hasText(flag) : Boolean(flag)) flaggedCount++;
  const group = pathway.release_group;
  if (typeof group === 'number' && expectedGroups.has(group)) {
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  } else {
    structureIssues.push(`${label}.release_group must be 1, 2 or 3.`);
  }
}

check(ids.size === 105, `Expected 105 unique IDs, found ${ids.size}.`);
check(flaggedCount === 20, `Expected 20 scope flags, found ${flaggedCount}.`);
for (const [group, expected] of expectedGroups) {
  const actual = groupCounts.get(group) ?? 0;
  check(actual === expected, `Expected ${expected} pathways in release group ${group}, found ${actual}.`);
}

const digitIssues: string[] = [];
const wordIssues: string[] = [];
const newCopyFields = ['dialects', 'platform_copy', 'method_fields'];
const forbidden = new Set(['بنوك', 'قروض', 'تحكيم']);
const guarantees = new Set(['ضمان', 'نضمن', 'يضمن', 'تضمن']);
// The final tokens also cover the phrases "من غير" and "من دون".
const negations = new Set(['دون', 'بلا', 'بدون', 'لا', 'ليس', 'غير']);

function inspectText(value: unknown, path: string) {
  if (typeof value === 'string') {
    if (/[0-9٠-٩۰-۹]/u.test(value)) digitIssues.push(path);
    const normalized = value.normalize('NFC').replace(/[\p{M}\u0640]/gu, '');
    const tokens = normalized.match(/[\p{L}\p{N}_]+/gu) ?? [];
    const breaches = new Set<string>();
    for (const [index, token] of tokens.entries()) {
      if (forbidden.has(token) || (guarantees.has(token)
        && !tokens.slice(Math.max(0, index - 3), index).some(prior => negations.has(prior)))) {
        breaches.add(token);
      }
    }
    if (breaches.size > 0) wordIssues.push(`${path}: ${[...breaches].join(', ')}`);
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      inspectText(item, `${path}[${index}]`);
    }
    return;
  }

  for (const [key, child] of Object.entries(asRecord(value) ?? {})) {
    inspectText(child, `${path}.${key}`);
  }
}

for (const [index, item] of pathways.entries()) {
  const pathway = asRecord(item);
  const id = pathway?.id;
  for (const field of newCopyFields) inspectText(pathway?.[field], `pathways[${hasText(id) ? id : index}].${field}`);
}

if (structureIssues.length || digitIssues.length || wordIssues.length) {
  console.error('LIBRARY V2: FAIL');
  const checks = [
    ['Structure violations', structureIssues],
    ['New text fields containing digits', digitIssues],
    ['New text fields containing forbidden words or unnegated guarantees', wordIssues],
  ] as const;
  for (const [label, issues] of checks) {
    console.error(`${label}: ${issues.length}`);
    for (const issue of issues.slice(0, 20)) console.error(`  ${issue}`);
    if (issues.length > 20) console.error(`  … and ${issues.length - 20} more`);
  }
  process.exitCode = 1;
} else {
  console.log('LIBRARY V2: PASS (105 unique IDs, five dialects, method fields, 20 scope flags, release groups 80/5/20 and new copy rules)');
}
