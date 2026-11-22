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
// Missions 10 and 10B revise the following interfaces and storage calls.
const revisedStructure = {
  'src/services/dialect.ts': '7633c45b6d299fddac9f94267814b0d02d738d13d320a27a04319441314abd1d',
  'src/pages/AdminDashboard.tsx': '7dd731e9193fb587ac0e4d7712c07ae7e311ed74b127c0b4e09b4078e22b845e',
  'src/services/evidenceSwot.ts': '88584caaaa5395076d73c8560ce05a6bde5a3c5609c1af290a451e38b3210af4',
  'src/services/reportGenerator.ts': '6377cdcc08004128737a289ec227bc0ded44984ad1e433ab5508dcf014132038',
  'src/pages/Processing.tsx': '6f8a6259d8bc5b450d6f46e0ded14b3b6dd8fd2a156743dc5d1dddc448667a27',
  // Mission 11D updates the sector formulas and their report consumers.
  'src/components/report/ReportPreview.tsx': '63514c2b2dee23928ecc7955491a0d60d95f413abb1d0639d8aca65bf9e59fd6',
  'src/data/sectorFinancialTaxonomy.ts': '0f11c60211d80923473c7306f76670f6a569ef0db603bbddb37bf5f5786c7b71',
  'src/services/dualLayerReport.ts': '8654531d2c789db5d4de320bd52de81638a9e1d37241615adf93abb68490b956',
  // Mission 11C replaces the three financial projections with unit sensitivities.
  'src/services/deterministicScoring.ts': 'c1d862892d0d06402ebbf8ac638133b45c66884d8b318d12e5568080b1f60397',
  'src/services/reportFallback.ts': '54eb6ce6226664e15d6c2bb8dfadde16d7ed481e25a95625148fd293879f01e9',
  'src/components/OfferCards.tsx': 'a78a50ade808d798181ac3bb84c525b43656e1cef4a0bbfb580a73b374fb5615',
  'src/config/appConfig.ts': 'f05db41691ad87f60e473e61d40f939b3935c17a79aa4c83aa9c6323753be1a9',
  'src/pages/LeadGate.tsx': 'ad7f053f51f51261b7618636d2ec31a9c7f12f67f9b2a5ae2dfd6c105daca126',
  'src/pages/Questionnaire.tsx': 'edeabe6cbbfa021fc4573b192b47e43c8530ff62cf6c00a4b7be26c6ebf11c48',
  'src/pages/Report.tsx': '440dddbdee9b7701e7ed22e25a47a11c5c02b8dd112181051e9e650aefe93462',
  'src/pages/ReportTransfer.tsx': '79e5a13201c9494afd1d3ef98fb6e5d22bf7aeea8a33f5733ed8287f089c0c73',
  'src/pages/Welcome.tsx': 'b29cfdda70130ad681f2afcab3b9226460bbb771b337cbf8d4fe0f21f1c024c0',
  'src/pages/consultant/ConsultantPage.jsx': 'a9ef0d8c80d48be144c93feb24f7cfcb1f9b0426d3fecd0fb789efba5e0da4f4',
};
for (const [file, expected] of Object.entries({ ...baseline.structure, ...revisedStructure })) {
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
assert.deepEqual(Object.values(BIK_OFFERS).map(offer => offer.price), ['$5000', '$499', '$272']);
check(true, 'offer amounts, order and dollar-sign labels match the release');
check(MIN_WAIT_MS === 0 && APP_CONFIG.consultantWhatsApp === baseline.whatsapp, 'zero wait and consultant WhatsApp destination are unchanged');
const consultant = syntax('src/pages/consultant/ConsultantPage.jsx');
const stats = consultant.statements.flatMap(statement => ts.isVariableStatement(statement) ? statement.declarationList.declarations : [])
  .find(declaration => declaration.name.getText() === 'STATS')!;
check(digest(stats.initializer!.getText()) === 'f75846a9c1f7877f8a12e5c7191dfd0ad168dd94ec57c35b187bb7fd86d7ff29', 'the approved consultant figures and satisfaction goal match the Mission 10 revision');
const protectedFiles = { ...baseline.protectedFiles, 'src/services/chatPolicy.ts': 'aded94b7ae478febe94b6ed7e88ec8ade077f54be4bc6241262db9a8042cd0c3', 'src/services/reportTransferState.ts': '4d48851bde32a4eaea65c5b814213e64c7c971b387da35b2f9a7ed64d5cb6e41' };
for (const [file, expected] of Object.entries(protectedFiles)) {
  check(digest(source(file)) === expected, `${file}: sending/storage/chat policy matches its approved revision`);
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
