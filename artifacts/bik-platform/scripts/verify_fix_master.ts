import assert from 'node:assert/strict';
import { platformCopy } from '../src/copy/platformCopy';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { universalQuestions } from '../src/data/universalQuestions';
import { sectorQuestions } from '../src/data/sectorQuestions';
import { deltaQuestions } from '../src/data/deltaQuestions';
import { INTAKE_QUESTIONS_META } from '../src/data/intakeQuestionsData';
import { DEEP_TIER_QUESTIONS, UNIVERSAL_DEEP_QUESTIONS } from '../src/data/sectorFinancialTaxonomy';
import { DIAGNOSTIC_DIMENSIONS, POSITIVE_SIGNALS, NEGATIVE_SIGNALS, DATA_GAP_SIGNALS } from '../src/services/deterministicScoring';
import { APP_CONFIG, BIK_OFFERS, FOCUSED_WEEK_USD, MONTHLY_RETAINER_USD, EXECUTIVE_PROJECT_USD } from '../src/config/appConfig';
import { MIN_WAIT_MS } from '../src/services/transferGate';
import { dialectForCountry, questionnaireCopy } from '../src/services/dialect';
import { toastMessages } from '../src/data/toastMessages';
import { getSectorQuestions } from '../src/data/sectorRegistry';

const baseline = JSON.parse(readFileSync('scripts/fixtures/fixMasterBaseline.json', 'utf8'));
let passed = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); passed += 1; console.log(`PASS: ${message}`); };
const source = (file: string) => readFileSync(file, 'utf8');

// Baseline helpers: v11 invariants, with explicit owner-authorized revisions recorded
// in the fixture. Missions 5-A and 5-C change the approved review composition and start-mode journey only.
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const questionValues = (questions: any[]) => questions.map(question => ({ id: question.id,
  options: (question.options || []).map((option: any) => option.value),
  type: question.type, min: question.min, max: question.max, step: question.step, highIsBad: question.highIsBad,
  dependencies: question.dependencies, dependsOn: question.dependsOn })).sort((a, b) => a.id.localeCompare(b.id, 'en'));
function syntax(file: string, text = source(file)) { return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS); }
function structure(node: ts.Node): unknown {
  // B-009 permits a display label separate from the existing stored value.
  if (ts.isElementAccessExpression(node) && ts.isArrayLiteralExpression(node.expression)
    && node.expression.elements.every(ts.isStringLiteral) && node.argumentExpression.getText() === 'optionIndex'
    && ts.isJsxExpression(node.parent)) return [ts.SyntaxKind.Identifier, 'v'];
  if (ts.isParameter(node) && node.name.getText() === 'optionIndex') return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
    || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) return [node.kind];
  if (ts.isIdentifier(node) || ts.isNumericLiteral(node)) return [node.kind, node.getText()];
  const children: unknown[] = [];
  ts.forEachChild(node, child => { const value = structure(child); if (value !== null) children.push(value); });
  return [node.kind, children];
}
const bankValues = {
  universal: questionValues(universalQuestions), sector: questionValues(Object.values(sectorQuestions).flat()),
  delta: questionValues(Object.values(deltaQuestions).flat()), intake: questionValues(Object.values(INTAKE_QUESTIONS_META)),
  deep: questionValues([...Object.values(DEEP_TIER_QUESTIONS).flat(), ...UNIVERSAL_DEEP_QUESTIONS])
};
// End baseline helpers.

for (const [bank, values] of Object.entries(bankValues)) {
  check(digest(values) === baseline.banks[bank], `${bank}: option values, IDs, numeric bounds and dependencies match v11`);
}
check(digest({ DIAGNOSTIC_DIMENSIONS, POSITIVE_SIGNALS, NEGATIVE_SIGNALS, DATA_GAP_SIGNALS }) === baseline.scoringRules,
  'scoring rules and categorical answer keys match v11');
// Mission 10 revises these interfaces. Other protected files keep their original hashes.
const mission10Structure = {
  'src/components/OfferCards.tsx': '84e5af82fc7618f9d59a5b6151414b861863901d5b547c8c899512bd718b5aeb',
  'src/config/appConfig.ts': '37cae12136a1ee520039e2ec65ecc0d0ca1d4cd0f100cb984bb1a3dc7fa44cc3',
  'src/pages/LeadGate.tsx': '430564f4535612cd9a3a093e22c8884eb0a8e91cd061de133a206b6164a4aea2',
  'src/pages/Report.tsx': '40969ce27cb0af017bd11f8ef317dcae616cd29810b680bdaed0c6ab61b8548a',
  'src/pages/Welcome.tsx': '821d7a3bf5b067bf32c1acaa36f330e83a1b9694f6311c59b225f0d72c216320',
  'src/pages/consultant/ConsultantPage.jsx': 'b7efaa2619e07cbb0d2ab787b27e9983ed42821ca37013f8637c937ebeb87cbf'
};
for (const [file, expected] of Object.entries({ ...baseline.structure, ...mission10Structure })) {
  check(digest(structure(syntax(file))) === expected, `${file}: executable structure, identifiers and numbers match the approved revision`);
}

const part3 = source('src/data/_part3.ts');
for (const [file, newText, oldText] of [
  ['src/data/_part3.ts', 'نعم، لكن جودتهم والتزامهم سيئان', 'نعم لكن جودتهم والالتزام سيء'],
  ['src/data/_part3.ts', 'لا — نعتمد على عمالتنا الخاصة', 'لا نعتمد على عمالتنا الخاصة'],
  ['src/data/_part3.ts', 'هل تستفيد من قاعدة بيانات العملاء لإرسال عروض شخصية وتذكير بموعد القصّة أو اللون؟', 'هل تستفيد من قاعدة بيانات العملاء لإرسال عروض شخصية تذكير بموعد القصة/اللون؟'],
  ['src/data/_part3.ts', 'لا — ننتظرهم ليتصلوا', 'لا ننتظرهم ليتصلوا'],
  ['src/data/toastMessages.ts', 'تحليل العناية الشخصية: هل تستفيد من قاعدة بيانات العملاء لإرسال عروض شخصية وتذكير بموعد القصّة أو اللون.', 'تحليل العناية الشخصية: هل تستفيد من قاعدة بيانات العملاء لإرسال عروض شخصية تذكير بموعد القصة/اللون.']
]) check(source(file).includes(newText) && !source(file).includes(oldText), `P0 corrected text is present and its original is absent: ${newText}`);
check(part3.includes('نعم — موثوقون ونديرهم جيداً') && part3.includes('نعم — نظام آلي يذكّرهم'), 'all companion P0 labels are corrected');
for (const country of ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'المغرب']) {
  check(questionnaireCopy(dialectForCountry(country)).skip === 'تخطي', `${country}: A-0020 means skip`);
  check(questionnaireCopy(dialectForCountry(country)).remaining(7) === 'المتبقي تقريباً: 7 د', `${country}: time interpolation is preserved`);
}
check(!/skip:\s*'(?:عدي|أجّل|عدّي|عادي)'/.test(source('src/services/dialect.ts')), 'all old P0 dialect skip labels are absent');
check(source('src/services/dialect.ts').includes('${m}') && source('src/pages/SectorSelect.tsx').includes('«{searchQuery}»'),
  'literal interpolation tokens ${m} and {searchQuery} are preserved');

function filesUnder(folder: string): string[] { return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? filesUnder(`${folder}/${entry.name}`) : /\.(?:tsx?|jsx?)$/.test(entry.name) ? [`${folder}/${entry.name}`] : []); }
for (const file of filesUnder('src')) check(!source(file).includes('ا/ '), `${file}: no owner address without hamza`);
for (const file of Object.keys(baseline.structure)) {
  const tree = syntax(file);
  function visit(node: ts.Node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && /[ء-ي]/.test(node.text)) {
      assert.ok(!/[٠-٩۰-۹]|\.\.\./u.test(node.text), `${file}: non-Western digits or three dots in interface prose: ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
check(true, 'modified interface prose uses Western digits and the ellipsis character; parsing tables and code are excluded');

const intake = syntax('src/pages/CompanyIntake.tsx');
const storedArrays: string[][] = [];
function collectArrays(node: ts.Node) {
  if (ts.isArrayLiteralExpression(node) && node.elements.every(ts.isStringLiteral) && ts.isPropertyAccessExpression(node.parent)
    && node.parent.name.text === 'map') storedArrays.push(node.elements.map(item => (item as ts.StringLiteral).text));
  ts.forEachChild(node, collectArrays);
}
collectArrays(intake);
check(digest(storedArrays) === baseline.intakeValueArrays, 'B-009 changes presentation labels while all mapped intake value arrays match v11');
check((source('src/pages/CompanyIntake.tsx').match(/\[optionIndex\]/g) || []).length === 4, 'four intake label groups are separated from their stored values');

assert.deepEqual(Object.keys(BIK_OFFERS), ['executiveProject', 'monthlyRetainer', 'focusedWeek']);
assert.deepEqual([EXECUTIVE_PROJECT_USD, MONTHLY_RETAINER_USD, FOCUSED_WEEK_USD], [5000, 499, 272]);
check(true, 'offer order remains 5000 then 499 then 272');
check(MIN_WAIT_MS === 0 && APP_CONFIG.consultantWhatsApp === baseline.whatsapp, 'zero wait and consultant WhatsApp destination are unchanged');
const consultant = syntax('src/pages/consultant/ConsultantPage.jsx');
const stats = consultant.statements.flatMap(statement => ts.isVariableStatement(statement) ? statement.declarationList.declarations : [])
  .find(declaration => declaration.name.getText() === 'STATS')!;
check(digest(stats.initializer!.getText()) === 'f75846a9c1f7877f8a12e5c7191dfd0ad168dd94ec57c35b187bb7fd86d7ff29', 'the approved consultant figures and satisfaction goal match the Mission 10 revision');
for (const [file, expected] of Object.entries(baseline.protectedFiles)) {
  check(digest(source(file)) === expected, `${file}: sending/storage/chat policy is byte-identical to v11`);
}
for (const sector of ['healthcare', 'personal_care', 'professional', 'financial', 'energy']) {
  for (const question of getSectorQuestions(sector)) {
    if (!['no_show', 'proactive_crm_pc', 'actual_margin', 'aum_stability', 'esg_compliance'].includes(question.toastKey || '')) continue;
    const text = toastMessages[question.toastKey!]?.text || '';
    check(text.endsWith(question.question.replace(/؟$/, '.')), `${question.id}: paired question and toast remain aligned`);
  }
}
check(source('src/pages/Processing.tsx').includes('ولا تُرسل هذه الإجابات إلى خادم BIK أو نموذج خارجي')
  && source('src/components/ConsultantChat.tsx').includes("platformCopy['chat.privacy']")
  && platformCopy['chat.privacy'] === 'تُرسل المحادثة إلى خادم BIK ثم مزودها: سجل الرسائل والقطاع وحالة المحاور ونوع بدايتك (تحليل أو أزمة) وإشارات محدودة عن النتيجة والتوصية. لا تُرفق إجابات التشخيص أو بيانات الهوية المحفوظة؛ ويُنقّح نص الرسائل آلياً، لذا تجنّب كتابة بيانات شخصية.',
  'privacy copy distinguishes local diagnostic generation from optional server/provider chat');
console.log(`FIX MASTER: ${passed} PASSED, 0 FAILED`);
