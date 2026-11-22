import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { platformCopy, platformCopyRules, formatPlatformCopy } from '../src/copy/platformCopy';

type Constraint = { variables: string[]; maxLength: number; locked: boolean; text?: string };
const approved: Record<string, Constraint> = JSON.parse(readFileSync('scripts/fixtures/copyDeckConstraints.json', 'utf8'));
const sorted = (values: string[]) => [...values].sort();
const variables = (value: string) => sorted([...new Set([...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]))]);

// The immutable fixture records the approved contract independently of replaceable prose.
// Unlocked wording may change later; approved keys, variables, limits and privacy may not.
function verifyCopyDeck(copy: Record<string, string>, rules: Record<string, Constraint>) {
  assert.deepEqual(sorted(Object.keys(copy)), sorted(Object.keys(approved)), 'copy keys exactly match the approved deck');
  assert.deepEqual(sorted(Object.keys(rules)), sorted(Object.keys(approved)), 'metadata keys exactly match the approved deck');
  for (const [key, constraint] of Object.entries(approved)) {
    const value = copy[key];
    assert.equal(typeof value, 'string', `${key}: text is a string`);
    assert.deepEqual(sorted([...rules[key].variables]), sorted(constraint.variables), `${key}: metadata retains the approved variables`);
    assert.equal(rules[key].maxLength, constraint.maxLength, `${key}: the approved length limit remains fixed`);
    assert.equal(rules[key].locked, constraint.locked, `${key}: the approved lock marker remains fixed`);
    assert.deepEqual(variables(value), sorted(constraint.variables), `${key}: text has exactly the allowed placeholder set`);
    assert.ok(!/[{}]/.test(value.replace(/\{\w+\}/g, '')), `${key}: no malformed placeholders`);
    assert.ok(value.length <= constraint.maxLength, `${key}: ${value.length} characters fit ${constraint.maxLength}`);
    assert.ok(!/ا\/\s/u.test(value), `${key}: owner address has hamza`);
    assert.ok(!value.includes('...'), `${key}: ellipsis uses the approved character`);
    assert.ok(!/[٠-٩۰-۹]/u.test(value), `${key}: copy has no non-Western digits`);
    assert.ok(!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u20E3/u.test(value), `${key}: no emoji`);
    assert.ok(!/قيد الصياغة|ضمان|نضمن|حتماً|بالتأكيد|مضمون/u.test(value), `${key}: no drafting marker or promise of results`);
    if (key.startsWith('value.')) assert.ok(!/ROI|عائد|يغطي|لا يغطي|ضمان|سنحقق|ستربح|نسبة تسرب/iu.test(value), `${key}: no prohibited cost-module wording`);
    // The margin question is defined per hundred units.
    const untemplated = (key === 'value.marginLabel' ? value.replace(/^من كل 100 /u, '') : value).replace(/\{\w+\}/g, '');
    assert.ok(!/[0-9]/.test(untemplated), `${key}: no invented literal numbers`);
    if (constraint.locked) assert.equal(value, constraint.text, `${key}: locked privacy is verbatim`);
  }
}
verifyCopyDeck(platformCopy, platformCopyRules as unknown as Record<string, Constraint>);

// Mission 7-A: the final owner-approved wording is frozen independently of the
// existing editable-copy metadata; no variable, length or privacy rule is relaxed.
function verifyApprovedCopy(copy: Record<string, string>) {
  for (const [key, constraint] of Object.entries(approved)) {
    assert.equal(typeof constraint.text, 'string', `${key}: the final wording is recorded`);
    assert.equal(copy[key], constraint.text, `${key}: final approved text is verbatim`);
  }
}
verifyApprovedCopy(platformCopy);
assert.throws(() => verifyApprovedCopy({ ...platformCopy, 'start.title': platformCopy['start.title'] + ' ' }),
  undefined, 'otherwise valid prose still cannot silently replace final approved wording');

// Prove the validator rejects changes to the contract as well as unsafe replacement prose.
const invalid = (key: keyof typeof platformCopy, value: string) => {
  assert.throws(() => verifyCopyDeck({ ...platformCopy, [key]: value }, platformCopyRules as unknown as Record<string, Constraint>), undefined, `${key}: invalid replacement is rejected`);
};
invalid('start.title', 'x'.repeat(41));
invalid('start.title', '...');
invalid('start.title', '١');
invalid('start.title', '🙂');
invalid('start.title', 'ا/ ');
for (const forbidden of ['قيد الصياغة', 'ضمان', 'نضمن', 'حتماً', 'بالتأكيد', 'مضمون']) invalid('start.title', forbidden);
invalid('start.title', '{axis}');
invalid('result.crisisLead', 'No placeholder');
invalid('chat.privacy', platformCopy['chat.privacy'] + ' ');
assert.throws(() => verifyCopyDeck({ ...platformCopy, extra: 'Extra' }, platformCopyRules as unknown as Record<string, Constraint>));
const missing = { ...platformCopy } as Record<string, string>;
delete missing['start.title'];
assert.throws(() => verifyCopyDeck(missing, platformCopyRules as unknown as Record<string, Constraint>));
const weakened = { ...platformCopyRules, 'start.title': { ...platformCopyRules['start.title'], maxLength: 999 } };
assert.throws(() => verifyCopyDeck(platformCopy, weakened as unknown as Record<string, Constraint>));
const wrongVariables = { ...platformCopyRules, 'result.crisisLead': { ...platformCopyRules['result.crisisLead'], variables: [] } };
assert.throws(() => verifyCopyDeck(platformCopy, wrongVariables as unknown as Record<string, Constraint>));
const unlockedPrivacy = { ...platformCopyRules, 'chat.privacy': { ...platformCopyRules['chat.privacy'], locked: false } };
assert.throws(() => verifyCopyDeck(platformCopy, unlockedPrivacy as unknown as Record<string, Constraint>));
verifyCopyDeck({ ...platformCopy, 'start.title': platformCopy['start.title'] + ' ' }, platformCopyRules as unknown as Record<string, Constraint>);
assert.equal(formatPlatformCopy('result.crisisLead', { axis: 'AXIS' }), platformCopy['result.crisisLead'].replace('{axis}', 'AXIS'));
assert.throws(() => formatPlatformCopy('result.crisisLead'));
assert.throws(() => formatPlatformCopy('result.crisisLead', { axis: 'AXIS', other: 'unexpected' }));
console.log(`COPY DECK: PASS (${Object.keys(approved).length} keys, approved metadata, privacy lock and invalid-copy rejection)`);
