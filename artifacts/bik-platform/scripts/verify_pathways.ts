import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { generateSlimPathways } from './build_pathways_slim';
import { listForConsultant, localizePathway, PATHWAY_AXIS_NAMES, selectForReport, type SlimPathway } from '../src/pathways/engine';
import { DIAGNOSTIC_DIMENSIONS } from '../src/services/deterministicScoring';
import PathwayCards from '../src/pathways/PathwayCards';

const path = new URL('../src/pathways/pathways.slim.json', import.meta.url);
const file = readFileSync(path, 'utf8');
assert.equal(file, generateSlimPathways(), 'the committed projection matches the generator byte for byte');
const slim = JSON.parse(file) as SlimPathway[];
const { pathways: source } = JSON.parse(readFileSync(new URL('../../../docs/codex/bik-library-v2.json', import.meta.url), 'utf8')) as {
  pathways: { id: string; release_group: number; scope_flag?: string | null }[];
};
const overrides = JSON.parse(readFileSync(new URL('../../../docs/codex/release-overrides.json', import.meta.url), 'utf8'));
const approved = {
  'PW-AX2-006': { release_group: 1 },
  'PW-AX2-007': { release_group: 1 },
  'PW-AX2-008': { release_group: 1 },
  'PW-AX2-009': { release_group: 1 },
  'PW-AX2-010': { release_group: 1 },
  'PW-AX2-011': { release_group: 1, scope_flag: null },
  'PW-AX2-014': { release_group: 1, scope_flag: null },
};
assert.deepEqual(overrides, approved);
assert.equal(source.filter(p => p.scope_flag).length, 20);
assert.deepEqual([1, 2, 3].map(group => source.filter(p => p.release_group === group).length), [80, 5, 20]);
const expectedIds = source.filter(p => Object.hasOwn(approved, p.id) || (p.release_group === 1 && !p.scope_flag))
  .map(p => p.id).sort();
const slimIds = new Set(slim.map(pathway => pathway.id));
assert.equal(slim.length, 87);
assert.deepEqual(slim.map(p => p.id).sort(), expectedIds);
for (const id of ['PW-AX2-012', 'PW-AX2-013', 'PW-AX2-015']) assert.ok(!slimIds.has(id), `${id} remains excluded`);
for (const pathway of source) {
  if (!Object.hasOwn(approved, pathway.id) && (pathway.release_group === 3 || pathway.scope_flag)) {
    assert.ok(!slimIds.has(pathway.id), `${pathway.id} remains outside the published scope`);
  }
}
for (const pathway of slim) {
  assert.deepEqual(Object.keys(pathway), ['id', 'axis', 'title', 'service_name', 'dialects', 'platform_copy']);
  assert.deepEqual(Object.keys(pathway.dialects).sort(), ['egypt', 'emirati', 'gulf_generic', 'msa_neutral', 'saudi']);
  for (const copy of Object.values(pathway.platform_copy)) assert.deepEqual(Object.keys(copy), ['headline', 'meaning', 'action']);
}
assert.deepEqual(Object.values(PATHWAY_AXIS_NAMES), Object.keys(DIAGNOSTIC_DIMENSIONS));

const result = {
  axisDetails: {
    [PATHWAY_AXIS_NAMES.AX1]: { score: 20, status: 'نقطة حرجة' },
    [PATHWAY_AXIS_NAMES.AX3]: { score: 30, status: 'نقطة حرجة' },
    [PATHWAY_AXIS_NAMES.AX4]: { score: 45, status: 'يحتاج تحسين' },
    [PATHWAY_AXIS_NAMES.AX5]: { score: 0, status: 'بيانات غير كافية' },
    [PATHWAY_AXIS_NAMES.AX6]: { score: 75, status: 'مستقر' },
  },
  topWeaknesses: ['u01', 'u02', 'u03', 'u09', 'u10', 'u11', 'u12', 'u13', 'u17', 'u20', 'u25'].map(sourceQuestionId => ({ sourceQuestionId })),
} as const;
const matches = await selectForReport(result, 'fusha');
assert.deepEqual(matches.map(p => p.id), ['PW-AX1-001', 'PW-AX1-002', 'PW-AX3-003', 'PW-AX3-005']);
assert.deepEqual(await selectForReport(result, 'fusha'), matches);
assert.ok(matches.every(p => expectedIds.includes(p.id)));
const markup = renderToStaticMarkup(createElement(PathwayCards, { pathways: matches }));
assert.equal((markup.match(/<article\b/g) ?? []).length, matches.length);
assert.match(markup, /ما يظهر في المحورين الأضعف/u);
assert.match(markup, /هذه فرضيات نفحصها معك، وليست أحكاماً على شركتك\./u);
assert.doesNotMatch(markup.replace(/<[^>]*>/g, ''), /[0-9٠-٩۰-۹]/u);
assert.equal(renderToStaticMarkup(createElement(PathwayCards, { pathways: [] })), '');
assert.deepEqual(await selectForReport({ topWeaknesses: result.topWeaknesses }, 'fusha'), []);
assert.deepEqual(await selectForReport({ ...result, topWeaknesses: [] }, 'fusha'), []);
assert.deepEqual(await selectForReport({
  axisDetails: { [PATHWAY_AXIS_NAMES.AX1]: { score: Number.NaN, status: 'نقطة حرجة' } },
  topWeaknesses: [{ sourceQuestionId: 'u03' }],
}, 'fusha'), []);
assert.deepEqual(await selectForReport({
  axisDetails: { [PATHWAY_AXIS_NAMES.AX2]: { score: 0, status: 'نقطة حرجة' } },
  topWeaknesses: [{ sourceQuestionId: 'u06' }],
}, 'fusha'), [], 'published pathways still need a shared token to qualify');
const financialMatches = await selectForReport({
  axisDetails: { [PATHWAY_AXIS_NAMES.AX2]: { score: 0, status: 'نقطة حرجة' } },
  topWeaknesses: [{ sourceQuestionId: 'u08' }],
}, 'fusha');
assert.deepEqual(financialMatches.map(pathway => pathway.id), ['PW-AX2-011', 'PW-AX2-014']);

const groups = await listForConsultant('fusha');
assert.deepEqual(groups.map(({ title }) => title), Object.keys(DIAGNOSTIC_DIMENSIONS));
assert.deepEqual(groups.flatMap(({ pathways }) => pathways.map(p => p.id)).sort(), expectedIds);
for (const { pathways } of groups) {
  const ids = pathways.map(p => p.id);
  assert.deepEqual(ids, [...ids].sort());
}
const example = slim[0];
assert.equal(localizePathway(example, 'egyptian').ownerPhrase, example.dialects.egypt);
assert.equal(localizePathway(example, 'gulf').ownerPhrase, example.dialects.gulf_generic);
assert.deepEqual(localizePathway(example, 'unknown'), localizePathway(example, 'fusha'));
const partial: SlimPathway = {
  ...example,
  dialects: { msa_neutral: example.dialects.msa_neutral, saudi: ' ' },
  platform_copy: {
    msa_neutral: example.platform_copy.msa_neutral,
    saudi: { headline: example.platform_copy.saudi?.headline, action: ' ' },
  },
};
assert.deepEqual(localizePathway(partial, 'saudi'), {
  ...localizePathway(example, 'fusha'), headline: example.platform_copy.saudi?.headline,
});
console.log('PATHWAYS: PASS (87 projected IDs, approved overrides, raw release counts, matching and dialect fallback)');
