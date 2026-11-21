/**
 * Fix F — automated chat after the result.
 * Run: tsx scripts/verify_chat.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { platformCopy, formatPlatformCopy } from '../src/copy/platformCopy';
import { fileURLToPath } from 'node:url';
import { BIK_OFFERS } from '../src/config/appConfig';
import {
  CHAT_FALLBACK_REPLY,
  CONTACT_AFTER_REPLIES,
  MAX_REPLY_CHARS,
  buildChatContext,
  buildChatSystemPrompt,
  suggestedChatQuestions,
  recommendationForContext,
  guardAssistantReply,
  appendPersonalDataWarning,
  PERSONAL_DATA_NOTICE,
  containsPersonalData,
  redactPersonalData,
  shouldOfferContact,
  validateChatRequest
} from '../src/services/chatPolicy';
import { DEFAULT_CHAT_MODEL, handleChat } from '../server/chatHandler';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvedPersona: string[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/chatPersona.json'), 'utf8'));
let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

const CANARY = { name: 'خالد-العتيبي-CANARY', company: 'شركة-الأفق-CANARY', phone: '01012345678', city: 'القاهرة-CANARY' };
const TEST_KEY = 'test-key-not-real-0001';

const axes = [
  { label: 'الصحة المالية', status: 'نقطة حرجة' },
  { label: 'العملاء والمبيعات', status: 'يحتاج تحسين' },
  { label: 'الفريق والعمليات', status: 'يحتاج تحسين' },
  { label: 'الموقع التنافسي', status: 'بيانات غير كافية' }
];
const context = { sector: 'وكالة رياضية وتسويق رياضي', overallComputed: true, axes };
const userMsg = (text: string) => ({ role: 'user', text });

// 1. Validation is a whitelist.
{
  const body = {
    messages: [userMsg('ما أولوية العمل؟')],
    context: { ...context, name: CANARY.name, companyName: CANARY.company, phone: CANARY.phone },
    intakeAnswers: { name: CANARY.name },
    name: CANARY.name
  };
  const parsed = validateChatRequest(body);
  check(parsed.ok, 'valid request is accepted');
  const serialized = JSON.stringify(parsed.ok ? parsed.value : {});
  check(!serialized.includes('CANARY') && !serialized.includes(CANARY.phone), 'unknown fields (name, company, phone, intake) are dropped');
  check(!validateChatRequest({ messages: [], context }).ok, 'empty messages rejected');
  check(!validateChatRequest({ messages: [{ role: 'assistant', text: 'x' }], context }).ok, 'last message must be from the user');
  check(!validateChatRequest({ messages: [{ role: 'system', text: 'x' }], context }).ok, 'system role from the client rejected');
  check(!validateChatRequest(null).ok, 'null body rejected');
  // F6 (round-5): the oversized message is rejected with a named reason, not silently sliced.
  const long = validateChatRequest({ messages: [userMsg('ا'.repeat(2000))], context });
  check(!long.ok && (long as any).error === 'message_too_long', 'message over 500 chars rejected as message_too_long');
  const atLimit = validateChatRequest({ messages: [userMsg('ا'.repeat(500))], context });
  check(atLimit.ok && atLimit.value.messages[0].text.length === 500, 'message exactly at 500 chars accepted');
  const many = validateChatRequest({ messages: Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? userMsg(`س${i}`) : { role: 'assistant', text: `ج${i}` })).concat([userMsg('أخير') as any]), context });
  check(many.ok && many.value.messages.length === 12, 'history capped at 12 messages');
}

// 5-F: optional mode is validated; the whitelist still excludes personal fields and raw answers.
{
  for (const mode of ['analysis', 'crisis'] as const) {
    const accepted = validateChatRequest({ messages: [userMsg('ما أولوية العمل؟')], context: { ...context, mode, ...CANARY, country: 'CANARY', answers: { secret: 81 } } });
    check(accepted.ok && accepted.value?.context.mode === mode, `${mode} mode passes validation`);
    check(!JSON.stringify(accepted.value).includes('CANARY') && !JSON.stringify(accepted.value).includes('secret'), 'mode whitelist excludes all personal and raw-answer fields');
    const built = buildChatContext({ sector: 'تجزئة', startMode: mode, ...CANARY } as any);
    check(built.mode === mode && !JSON.stringify(built).includes('CANARY'), 'store startMode maps to context mode without personal fields');
  }
  for (const mode of ['', null, 0, false, 'other', {}, []]) {
    const rejected = validateChatRequest({ messages: [userMsg('سؤال')], context: { ...context, mode } });
    check(!rejected.ok && rejected.error === 'invalid_mode', `invalid mode ${JSON.stringify(mode)} is rejected explicitly`);
  }
  check(validateChatRequest({ messages: [userMsg('سؤال')], context }).ok, 'legacy context without mode remains accepted');
  check(!Object.hasOwn(buildChatContext({ sector: 'تجزئة' }), 'mode'), 'legacy context builder omits absent optional mode');
  const twoCritical = { ...context, axes: [{ label: 'أول', status: 'نقطة حرجة' }, { label: 'ثان', status: 'نقطة حرجة' }, { label: 'ثالث', status: 'مستقر' }] };
  check(recommendationForContext({ ...twoCritical, mode: 'crisis' }) === 'monthlyRetainer', 'chat recommendation applies the crisis rule');
  check(recommendationForContext({ ...twoCritical, mode: 'analysis' }) === recommendationForContext(twoCritical), 'analysis chat recommendation preserves the original rule');
}

// Suggestions preserve approved copy, priority and stable axis order.
{
  const ranked = { ...context, axes: [{ label: 'تحسين سابق', status: 'يحتاج تحسين' }, { label: 'حرج أول', status: 'نقطة حرجة' }, { label: 'حرج ثان', status: 'نقطة حرجة' }] };
  const questions = suggestedChatQuestions(ranked);
  check(questions.length === 3 && questions[0] === platformCopy['chat.q1'], 'axis suggestions are exactly three, starting with approved q1');
  check(questions[1] === formatPlatformCopy('chat.q2Axis', { axis: 'حرج أول' }) && questions[2] === formatPlatformCopy('chat.q3Axis', { axis: 'حرج أول' }), 'first critical axis outranks earlier improvement axis and ties stay in session order');
  check(suggestedChatQuestions({ ...context, axes: [{ label: 'تحسين أول', status: 'يحتاج تحسين' }, { label: 'تحسين ثان', status: 'يحتاج تحسين' }] })[1] === formatPlatformCopy('chat.q2Axis', { axis: 'تحسين أول' }), 'first improvement axis is used when none is critical');
  for (const safeAxes of [[], [{ label: 'مستقر', status: 'مستقر' }], [{ label: 'غير معروف', status: 'بيانات غير كافية' }]]) {
    const generic = suggestedChatQuestions({ ...context, axes: safeAxes });
    check(generic.length === 3 && generic[0] === platformCopy['chat.q1'] && generic[1] === platformCopy['chat.q2Generic'] && generic[2] === platformCopy['chat.q3Generic'], 'no actionable axis uses exactly the three approved generic suggestions');
    check(generic[2] === 'أي العروض أنسب لي، ولماذا؟', '7-B: generic offer question uses the approved plural for the three available offers');
  }
}

// 2. Redaction.
{
  check(!redactPersonalData('رقمي 01012345678 اتصل').includes('0101'), 'Latin phone redacted');
  check(!redactPersonalData('رقمي +20 101 234 5678').match(/\d{3}\s\d{4}/), 'international phone with spaces redacted');
  check(!redactPersonalData('رقمي ٠١٠١٢٣٤٥٦٧٨').includes('٠١٠١'), 'Arabic-Indic phone redacted');
  check(!redactPersonalData('بريدي ahmed@example.com').includes('@'), 'email redacted');
  check(!redactPersonalData('موقعنا https://example.com/x').includes('example'), 'url redacted');
  check(redactPersonalData('نكتسب 4 عملاء شهرياً و12 موظفاً') === 'نكتسب 4 عملاء شهرياً و12 موظفاً', 'short ordinary numbers are kept');
  const nameIntro = redactPersonalData('اسمي نور الاختبار وسؤالي عن المحور المالي');
  check(!nameIntro.includes('نور الاختبار') && nameIntro.includes('اسمي [محذوف]'), 'a name typed after "اسمي" is redacted before the provider sees it');
  check(!redactPersonalData('أنا نور الاختبار وسؤالي عن المحور المالي').includes('نور'), 'a name typed after "أنا" is redacted before the provider sees it');
  check(containsPersonalData(nameIntro) && containsPersonalData('رقمي [محذوف]'), 'personal-data messages are detected after sanitising');
  check(!containsPersonalData('ما أولوية العمل؟'), 'ordinary questions are not flagged as personal data');
  const warned = appendPersonalDataWarning('أولويتك المحور المالي.');
  check(warned.includes('أولويتك المحور المالي.') && warned.includes('لا حاجة لأي بيانات شخصية هنا'), 'the no-personal-data notice is appended deterministically');
  // The suppression anchor is the notice's exact phrase, never a generic "لا حاجة":
  // a model reply using that expression in another sense must not swallow the notice.
  check(appendPersonalDataWarning('قلقك مفهوم، ولا حاجة للقلق.').includes('لا حاجة لأي بيانات شخصية هنا'), 'a generic لا حاجة in the reply does not suppress the notice');
  check(appendPersonalDataWarning('أولويتك المحور المالي.' + PERSONAL_DATA_NOTICE) === 'أولويتك المحور المالي.' + PERSONAL_DATA_NOTICE, 'the notice is not duplicated when the reply already carries it');
  const longReply = 'ج'.repeat(MAX_REPLY_CHARS);
  check(appendPersonalDataWarning(longReply).length === MAX_REPLY_CHARS && appendPersonalDataWarning(longReply).includes('لا حاجة لأي بيانات شخصية هنا'), 'the notice survives the reply-length cap');
}

// 3. Context building keeps labels and statuses only.
{
  const ctx = buildChatContext({
    sector: 'تجزئة',
    overallComputed: false,
    axisDetails: { 'الصحة المالية': { status: 'مستقر', score: 80, evidence: [{ q: 'secret' }] } as any }
  });
  const s = JSON.stringify(ctx);
  check(!s.includes('80') && !s.includes('secret') && !s.includes('score'), 'context keeps no scores or evidence');
  check(ctx.overallComputed === false && ctx.axes.length === 1, 'context keeps the computed flag and axis labels');
}

// 4. System prompt.
{
  const prompt = buildChatSystemPrompt(context);
  check(approvedPersona.length === 8 && prompt.startsWith([...approvedPersona, '', ''].join('\n')),
    '7-C: prompt starts with all eight approved persona lines and the blank separator');
  check(!prompt.includes('بكلماته هو') && prompt.includes('اعتماداً على محاور الجلسة وحدها'),
    '7-C: the persona relies only on session axes and never claims to know the visitor wording');
  check(prompt.includes(`- القطاع: ${context.sector}`) && prompt.includes('حالة المحاور:')
    && context.axes.every(axis => prompt.includes(`- ${axis.label}: ${axis.status}`)),
    '7-C: the original sector and every axis/status remain in the runtime prompt');
  check(Array.from({ length: 8 }, (_, index) => `${index + 1}. `)
    .every(prefix => prompt.split('\n').some(line => line.startsWith(prefix))),
    '7-C: all eight mandatory rules remain in the runtime prompt');
  check(prompt.includes('المكالمة المجانية 15 دقيقة') && !prompt.includes('المكالمة المجانية ١٥ دقيقة')
    && approvedPersona.every(line => !/[٠-٩۰-۹]/u.test(line)),
    '7-C: the authorized persona and free-call line use Western digits; configured offer figures are preserved');
  // F9 (round-5): the diagnostic flow quotes the currency-free figure; the USD wording stays on /consultant.
  check(prompt.includes(BIK_OFFERS.focusedWeek.name) && prompt.includes(BIK_OFFERS.focusedWeek.priceFigure), 'prompt has offer 1 name and currency-free figure from BIK_OFFERS');
  check(prompt.includes(BIK_OFFERS.monthlyRetainer.name) && prompt.includes(BIK_OFFERS.monthlyRetainer.priceFigure), 'prompt has offer 2 name and currency-free figure from BIK_OFFERS');
  check(prompt.includes(BIK_OFFERS.executiveProject.name) && prompt.includes(BIK_OFFERS.executiveProject.priceFigure), 'prompt has offer 3 name and currency-free figure from BIK_OFFERS');
  check(prompt.includes(`حسب قاعدة النظام: ${BIK_OFFERS.executiveProject.name}`), 'prompt names the offer recommended by the coded rule (3 of 3 scored axes need work -> executive project)');
  const thin = buildChatSystemPrompt({ sector: 'تجزئة', overallComputed: false, axes: [{ label: 'الصحة المالية', status: 'بيانات غير كافية' }] });
  check(thin.includes(`حسب قاعدة النظام: ${BIK_OFFERS.focusedWeek.name}`), 'thin data recommends the focused week');
  check(prompt.includes('ليس المستشار') || prompt.includes('لست المستشار'), 'prompt states the assistant is not the consultant');
  check(prompt.includes('لا تخترع أرقاماً') && prompt.includes('لا تقترح أي خدمة'), 'prompt forbids invented numbers and other services');
  check(prompt.includes('بيانات غير كافية" تعني نقص بيانات وليست ضعفاً'), 'prompt keeps "data gap is not weakness"');
}

// 5. Output guard.
{
  check(guardAssistantReply('الأنسب لك أسبوع استشاري مركز بسعر 272 دولاراً.') .includes('272'), 'approved price 272 passes');
  check(guardAssistantReply('التعاقد الشهري 499 دولاراً شهرياً').includes('499'), 'approved price 499 passes');
  check(guardAssistantReply('السعر ٢٧٢ دولار').includes('٢٧٢'), 'Arabic-Indic approved price passes');
  for (const text of ['5000 دولار', '٥٠٠٠ دولاراً', 'أقل من 17 دولاراً في اليوم', 'أقل من ١٧ دولاراً في اليوم', '272 دولاراً', '499 دولاراً']) {
    check(guardAssistantReply(text) === text, `7-D: configured price passes unchanged: ${text}`);
  }
  for (const text of ['6000 دولار', '4999 دولاراً', '16 دولاراً', '٦٠٠٠ دولاراً', '٤٩٩٩ دولاراً', '١٦ دولاراً', '5000 دولار و16 دولاراً', 'خصم 17%', 'خصم ١٧٪', '5000 دولار https://example.com', '499 دولار a@b.com']) {
    check(guardAssistantReply(text) === CHAT_FALLBACK_REPLY, `7-D: unsupported price, percentage or contact is replaced: ${text}`);
  }
  check(guardAssistantReply('السعر 900 دولار') === CHAT_FALLBACK_REPLY, 'unapproved price blocked');
  check(guardAssistantReply('تكلفته $1,500') === CHAT_FALLBACK_REPLY, 'dollar-sign price blocked');
  check(guardAssistantReply('ستزيد المبيعات 30%') === CHAT_FALLBACK_REPLY, 'unsourced percentage blocked');
  check(guardAssistantReply('راسلنا على a@b.com') === CHAT_FALLBACK_REPLY, 'email in reply blocked');
  check(guardAssistantReply('زر https://x.example') === CHAT_FALLBACK_REPLY, 'link in reply blocked');
  check(guardAssistantReply('   ') === CHAT_FALLBACK_REPLY && guardAssistantReply(undefined) === CHAT_FALLBACK_REPLY, 'empty or non-string reply blocked');
  check(guardAssistantReply('ا'.repeat(3000)).length === MAX_REPLY_CHARS, 'long reply capped');
}

// Mission 7-D: mutate the real appConfig module only in an in-memory build.
// This proves all four allowed amounts are imported, without editing configuration.
async function guardConfigOverrides() {
  const prices: Record<string, number> = {
    FOCUSED_WEEK_USD: 373, MONTHLY_RETAINER_USD: 827,
    EXECUTIVE_PROJECT_USD: 7100, RETAINER_PER_DAY_USD: 29
  };
  let replacements = 0;
  const compiled = await build({
    entryPoints: [path.join(ROOT, 'src/services/chatPolicy.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
    plugins: [{ name: 'test-config-price-overrides', setup(builder) {
      builder.onLoad({ filter: /[\\/]config[\\/]appConfig\.ts$/ }, async args => {
        let contents = fs.readFileSync(args.path, 'utf8');
        for (const [name, value] of Object.entries(prices)) {
          const declaration = new RegExp(`export const ${name} = [^;]+;`);
          if (!declaration.test(contents)) throw new Error(`Missing configuration declaration: ${name}`);
          contents = contents.replace(declaration, `export const ${name} = ${value};`);
          replacements += 1;
        }
        return { contents, loader: 'ts' };
      });
    } }]
  });
  const module = { exports: {} as any };
  runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports });
  const overridden = module.exports.guardAssistantReply as typeof guardAssistantReply;
  check(replacements === 4, '7-D: the in-memory test changes all four real appConfig price constants');
  for (const value of Object.values(prices)) {
    const text = `السعر ${value} دولاراً`;
    check(overridden(text) === text, `7-D: changed appConfig amount ${value} is accepted`);
  }
  for (const value of [272, 499, 5000, 17, 6000, 4999, 16]) {
    check(overridden(`السعر ${value} دولاراً`) === CHAT_FALLBACK_REPLY,
      `7-D: old or unsupported amount ${value} is rejected after configuration changes`);
  }
  for (const text of ['نسبة 29%', 'رابط https://example.com', 'بريد a@b.com']) {
    check(overridden(text) === CHAT_FALLBACK_REPLY, '7-D: config overrides retain percentage, URL and email rejection');
  }
}

// 6. Contact after the 3rd reply.
{
  const mk = (n: number) => Array.from({ length: n }, () => ({ role: 'assistant' as const, text: 'ج' }));
  check(CONTACT_AFTER_REPLIES === 3, 'contact threshold is 3');
  check(!shouldOfferContact(mk(0)) && !shouldOfferContact(mk(2)), 'no contact before the 3rd reply');
  check(shouldOfferContact(mk(3)) && shouldOfferContact(mk(4)), 'contact from the 3rd reply on');
}

// 7. Handler with a mocked upstream.
async function run() {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };

  const calls: Array<{ url: string; init: any }> = [];
  const okFetch = (content: unknown, status = 200) => (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return { ok: status >= 200 && status < 300, status, json: async () => ({ choices: [{ message: { content } }] }) } as any;
  }) as unknown as typeof fetch;
  const bucketsFor = () => new Map<string, { count: number; resetAt: number }>();
  const body = {
    messages: [userMsg(`اتصل بي على ${CANARY.phone} ما أولويتي؟`)],
    context,
    name: CANARY.name,
    companyName: CANARY.company,
    city: CANARY.city
  };

  // missing key
  calls.length = 0;
  let r = await handleChat(body, { env: {}, fetchImpl: okFetch('x'), ip: '1', buckets: bucketsFor() });
  check(r.status === 503 && r.json.error === 'chat_unavailable' && calls.length === 0, 'no OPENROUTER_API_KEY -> 503 and no upstream call');

  // success path
  calls.length = 0;
  r = await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('أولويتك المحور المالي. الأنسب أسبوع استشاري مركز بسعر 272 دولاراً.'), ip: '2', buckets: bucketsFor() });
  check(r.status === 200 && typeof r.json.text === 'string' && (r.json.text as string).includes('272'), 'success returns the guarded reply');
  check((r.json.text as string).includes('لا حاجة لأي بيانات شخصية هنا'), 'the handler appends the no-personal-data notice in code when a user turn carried personal data (never left to the model)');
  check(calls.length === 1 && calls[0].url === 'https://openrouter.ai/api/v1/chat/completions', 'exactly one upstream call to OpenRouter');
  const sent = String(calls[0]?.init?.body || '');
  check(!sent.includes('CANARY') && !sent.includes(CANARY.phone), 'upstream payload contains no name, company, city or phone');
  check(sent.includes('[محذوف]'), 'phone typed in the message is redacted before sending');
  check(calls[0]?.init?.headers?.Authorization === `Bearer ${TEST_KEY}`, 'key is sent only in the Authorization header');
  check(!sent.includes(TEST_KEY) && !JSON.stringify(r.json).includes(TEST_KEY), 'key is not in the payload or the response');
  check(JSON.parse(sent).model === DEFAULT_CHAT_MODEL, 'default model used');
  const parsedBody = JSON.parse(sent);
  check(parsedBody.messages[0].role === 'system' && parsedBody.messages.length === 2, 'system prompt first, then the user message');

  // model override
  calls.length = 0;
  await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY, OPENROUTER_MODEL: 'vendor/other-model' }, fetchImpl: okFetch('رد'), ip: '3', buckets: bucketsFor() });
  check(JSON.parse(String(calls[0]?.init?.body)).model === 'vendor/other-model', 'OPENROUTER_MODEL overrides the default');

  // output guard applied
  r = await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('السعر 900 دولار'), ip: '4', buckets: bucketsFor() });
  check(r.status === 200 && r.json.text === CHAT_FALLBACK_REPLY, 'unapproved price from the model is replaced, not shown');

  // upstream failures are explicit, no synthetic reply
  r = await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('x', 500), ip: '5', buckets: bucketsFor() });
  check(r.status === 502 && !('text' in r.json), 'upstream 500 -> 502 with no text');
  r = await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('', 200), ip: '6', buckets: bucketsFor() });
  check(r.status === 502 && !('text' in r.json), 'empty upstream content -> 502 with no text');
  r = await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: (async () => { throw new Error('network down'); }) as any, ip: '7', buckets: bucketsFor() });
  check(r.status === 502 && !('text' in r.json), 'network error -> 502 with no text');

  // bad input
  r = await handleChat({ messages: [] }, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('x'), ip: '8', buckets: bucketsFor() });
  check(r.status === 400, 'invalid request -> 400');

  // rate limit
  calls.length = 0;
  const buckets = bucketsFor();
  let last = 0;
  for (let i = 0; i < 21; i++) {
    last = (await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('رد'), ip: '9', buckets, now: 1_000 })).status;
  }
  check(last === 429 && calls.length === 20, '21st request in the window -> 429 without an upstream call');
  const after = await handleChat(body, { env: { OPENROUTER_API_KEY: TEST_KEY }, fetchImpl: okFetch('رد'), ip: '9', buckets, now: 1_000 + 11 * 60 * 1000 });
  check(after.status === 200, 'window resets after 10 minutes');

  // logs never contain the key or the message
  console.warn = originalWarn;
  const logText = warnings.join('\n');
  check(!logText.includes(TEST_KEY) && !logText.includes('أولويتي') && !logText.includes(CANARY.phone), 'logs contain neither the key nor message text');
}

// 8. Source-level guarantees.
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '.local'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else if (/\.(ts|tsx|json|md|txt|env|yml|yaml|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}
function sources() {
  const server = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const chat = fs.readFileSync(path.join(ROOT, 'src/components/ConsultantChat.tsx'), 'utf8');
  const report = fs.readFileSync(path.join(ROOT, 'src/pages/Report.tsx'), 'utf8');
  const handler = fs.readFileSync(path.join(ROOT, 'server/chatHandler.ts'), 'utf8');
  check(server.includes('"/api/v1/chat"') && server.includes('handleChat('), 'server exposes /api/v1/chat through handleChat');
  check(handler.includes('process.env') === false && handler.includes('deps.env.OPENROUTER_API_KEY'), 'handler reads the key only from injected env (OPENROUTER_API_KEY)');
  check(!report.includes('ConsultantChat') && !report.includes('buildChatContext'), 'the public report does not mount chat or prepare a chat context');
  check(chat.includes('shouldOfferContact(messages)') && chat.includes('data-testid="chat-contact-cta"'), 'chat shows the contact button from the 3rd reply');
  check(chat.includes("CHAT_ENDPOINT = '/_bik-api/v1/chat'") && server.includes('req.url = `/api${req.url.slice("/_bik-api".length)}`') && !chat.includes('companyName') && !chat.includes('userName') && !/phone/i.test(chat), 'chat component handles no name, company or phone');
  check(chat.includes("platformCopy['chat.badge']") && platformCopy['chat.badge'] === 'مساعد آلي يقرأ نتيجتك', 'chat renders the approved automated-assistant badge');
  check(chat.includes("platformCopy['chat.privacy']") && platformCopy['chat.privacy'] === 'تُرسل المحادثة إلى خادم BIK ثم مزودها: سجل الرسائل والقطاع وحالة المحاور ونوع بدايتك (تحليل أو أزمة) وإشارات محدودة عن النتيجة والتوصية. لا تُرفق إجابات التشخيص أو بيانات الهوية المحفوظة؛ ويُنقّح نص الرسائل آلياً، لذا تجنّب كتابة بيانات شخصية.', 'chat renders the exact locked privacy paragraph');
  const policy = fs.readFileSync(path.join(ROOT, 'src/services/chatPolicy.ts'), 'utf8');
  const systemSource = policy.slice(policy.indexOf('export function buildChatSystemPrompt'), policy.indexOf('/**\n * Output guard.'));
  // Owner authorization: Mission 7-C adds the eight approved persona lines, changes
  // the specified visitor-words phrase, and changes only the call duration to 15.
  check(createHash('sha256').update(systemSource).digest('hex') === '647b818155a256320fb1722db79527a635c523da240b10362dd16c184e88f427',
    '7-C: buildChatSystemPrompt source matches the expressly authorized persona revision');
  const personaSource = approvedPersona.map(line => `    '${line}',\n`).join('') + "    '',\n";
  check(systemSource.includes(personaSource), '7-C: source contains exactly the approved persona insertion');
  const legacySystemSource = systemSource.replace(personaSource, '')
    .replace('المكالمة المجانية 15 دقيقة', 'المكالمة المجانية ١٥ دقيقة');
  check(createHash('sha256').update(legacySystemSource).digest('hex') === 'b765090a126b8c6301251fadb3bedb2156b4796d412aaff208145d2fa6eecc20',
    '7-C: removing only the authorized insertion and digit correction restores the byte-identical legacy prompt');
  const priceLiterals = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'server')), path.join(ROOT, 'server.ts')]
    .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter(file => !file.endsWith(path.join('src', 'config', 'appConfig.ts')))
    .filter(file => /(?<![\d.])(272|499)(?![\d.])/.test(fs.readFileSync(file, 'utf8')));
  check(priceLiterals.length === 0, `prices 272/499 are defined only in appConfig${priceLiterals.length ? ': ' + priceLiterals.join(', ') : ''}`);
  const server2 = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  check(!server2.includes('GoogleGenAI') && !server2.includes('gemini-'), 'server.ts has no Gemini client or model ids');
  check(server2.includes('app.post("/api/consult", (_req, res) => res.status(410)') && server2.includes('app.post("/api/proposal", (_req, res) => res.status(410)'), 'legacy /api/consult and /api/proposal return 410');
  check(!fs.existsSync(path.join(ROOT, 'server/index.ts')) && !fs.existsSync(path.join(ROOT, 'src/components/error-boundary.tsx')) && !fs.existsSync(path.join(ROOT, 'src/components/InteractivePartnersMap.tsx')), 'unused duplicates are deleted');
  const release = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/release.json'), 'utf8'));
  check(release.storageMode === 'session_only' && !JSON.stringify(release).includes('ef7e4ab2') && !JSON.stringify(release).includes('managed_database'), 'release.json is not stale');
  const artifactToml = fs.readFileSync(path.join(ROOT, '.replit-artifact/artifact.toml'), 'utf8');
  check(!artifactToml.includes('serve = "static"') && artifactToml.includes('[services.production.run]') && artifactToml.includes('"run", "start"'), 'Replit production service runs the Express server (not static-only), so /api/v1/chat exists after deploy');
  check(artifactToml.includes('path = "/_bik-api/v1/health"') && artifactToml.includes('"/_bik-api"') && server2.includes('"/api/v1/health"'), 'Replit health check reaches the BIK server through its isolated API prefix');
  const leaked = walk(ROOT).filter(file => /sk-or-v1-[A-Za-z0-9]{8,}/.test(fs.readFileSync(file, 'utf8')));
  check(leaked.length === 0, `no OpenRouter key literal anywhere in the project${leaked.length ? ': ' + leaked.join(', ') : ''}`);
}

// Component event harness: run the real compiled component and invoke its rendered handlers.
// It records hooks locally and replaces network/visual dependencies; no browser or service is needed.
async function componentInteractions() {
  const compiled = await build({
    entryPoints: [path.join(ROOT, 'src/components/ConsultantChat.tsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'transform',
    external: ['react', 'react-router-dom', 'lucide-react'], logLevel: 'silent'
  });
  type Element = { type: unknown; props: Record<string, any> };
  function harness(chatContext: ReturnType<typeof buildChatContext>) {
    const state: Array<{ value: any }> = [];
    let cursor = 0;
    const calls: Array<{ url: string; body: any }> = [];
    const react = {
      createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
        return { type, props: { ...props, children } };
      },
      useState(initial: unknown) {
        const index = cursor++;
        state[index] ||= { value: typeof initial === 'function' ? initial() : initial };
        return [state[index].value, (next: any) => { state[index].value = typeof next === 'function' ? next(state[index].value) : next; }];
      },
      useRef(initial: unknown) {
        const index = cursor++;
        state[index] ||= { value: { current: initial } };
        return state[index].value;
      }
    };
    const module = { exports: {} as any };
    runInNewContext(compiled.outputFiles[0].text, {
      module, exports: module.exports,
      require(name: string) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return {
          jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
          jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props })
        };
        if (name === 'react-router-dom') return { Link: 'link-stub' };
        if (name === 'lucide-react') return { MessageCircle: 'message-icon', Send: 'send-icon', ShieldCheck: 'shield-icon' };
        throw new Error(`Unexpected component dependency: ${name}`);
      },
      fetch: async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ text: 'رد اختبار' }) };
      }
    });
    const render = () => { cursor = 0; return module.exports.default({ context: chatContext }) as Element; };
    return { render, calls };
  }
  function elements(root: unknown, predicate: (node: Element) => boolean): Element[] {
    if (Array.isArray(root)) return root.flatMap(child => elements(child, predicate));
    if (!root || typeof root !== 'object' || !('props' in root)) return [];
    const node = root as Element;
    return [...(predicate(node) ? [node] : []), ...elements(node.props.children, predicate)];
  }
  const byTestId = (root: Element, id: string) => elements(root, node => node.props['data-testid'] === id);
  for (const candidate of [context, { ...context, axes: [] }]) {
    const questions = suggestedChatQuestions(candidate);
    for (const [index, question] of questions.entries()) {
      const test = harness(buildChatContext({
        sector: candidate.sector, startMode: 'crisis',
        axisDetails: Object.fromEntries(candidate.axes.map(axis => [axis.label, { status: axis.status }]))
      }));
      let tree = test.render();
      const starters = byTestId(tree, 'chat-starters');
      const buttons = elements(starters, node => node.type === 'button');
      check(buttons.length === 3, `component renders three ${candidate.axes.length ? 'axis' : 'generic'} suggestions`);
      buttons[index].props.onClick();
      check(test.calls.length === 1 && test.calls[0].body.messages[0].text === question,
        `suggestion ${index + 1} sends its displayed text immediately through the request path`);
      tree = test.render();
      check(byTestId(tree, 'chat-starters').length === 0, 'suggestions disappear immediately after the first user message');
      check(test.calls[0].body.context.mode === 'crisis' && !JSON.stringify(test.calls[0].body).includes('CANARY'),
        'component request retains mode and no personal fields');
    }
  }
  const test = harness(buildChatContext({ sector: 'تجزئة', startMode: 'analysis', ...CANARY } as any));
  let tree = test.render();
  const input = byTestId(tree, 'chat-input')[0];
  check(input.props.rows >= 3 && byTestId(tree, 'chat-messages')[0].props.className.includes('min-h-[14rem]'),
    'component provides three input rows and a 14rem messages region');
  input.props.onChange({ target: { value: `اسمي نور الاختبار ورقمي ${CANARY.phone} ما الأولوية؟` } });
  tree = test.render();
  elements(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const request = JSON.stringify(test.calls[0].body);
  check(!request.includes(CANARY.phone) && !request.includes('نور الاختبار') && request.includes('[محذوف]'),
    'typed input uses the same sanitizer before the component sends its request');
  check(byTestId(test.render(), 'chat-starters').length === 0, 'typed first message also hides suggestions');
}


run().then(async () => {
  await guardConfigOverrides();
  await componentInteractions();
  sources();
  console.log(`\nCHAT: ${pass} PASSED, ${fail} FAILED`);
  process.exit(fail ? 1 : 0);
});
