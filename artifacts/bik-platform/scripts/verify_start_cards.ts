import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { platformCopy, formatPlatformCopy } from '../src/copy/platformCopy';
import { sanitizeDiagnosticPersisted } from '../src/services/persistedStateSanitizer';
import { buildWhatsAppDossierText } from '../src/services/dualLayerReport';
import { computeSectorBlindSpots, legacySectorLossTotal } from '../src/services/blindSpotCalculator';
import { buildWhatsAppReportParts } from '../src/services/reportTextDelivery';

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }
  };
};
const session = memory();
const local = memory();
Object.assign(globalThis, { window: { sessionStorage: session, localStorage: local }, sessionStorage: session, localStorage: local });
const requests: Array<{ url: string; init: RequestInit }> = [];
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), init });
  return { ok: true, json: async () => ({ sessionId: 'test-session', ownershipToken: 'test-token', report: {} }) } as Response;
};
const { useDiagnosticStore: store } = await import('../src/store/diagnosticStore');
const api = await import('../src/services/api');
const recovery = await import('../src/services/analysisRecovery');
const transfer = await import('../src/services/reportTransferState');

// Execute the real component handlers with only the renderer and route side effects mocked.
// This keeps card clicks, cleanup, storage and the existing startSession request observable.
type Element = { type: unknown; props: Record<string, any> };
const elements = (node: any): Element[] => Array.isArray(node)
  ? node.flatMap(elements)
  : node && typeof node === 'object' && 'props' in node
    ? [node, ...elements(node.props.children)] : [];
const text = (node: any): string => Array.isArray(node) ? node.map(text).join('')
  : node && typeof node === 'object' && 'props' in node ? text(node.props.children)
  : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
let reloads = 0;
const routes: string[] = [];
const react = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: { ...props, children } }),
  useEffect: () => {},
  useMemo: (build: () => unknown) => build(),
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}]
};
const hookedStore = Object.assign(() => store.getState(), store);
function component(file: string, additions: Record<string, unknown> = {}) {
  const compiled = transformSync(readFileSync(file, 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'transform' }).code;
  const module = { exports: {} as any };
  const imports: Record<string, unknown> = {
    react: { __esModule: true, default: react, ...react },
    'lucide-react': new Proxy({}, { get: (_target, key) => String(key) }),
    'react-router-dom': { useNavigate: () => (route: string) => routes.push(route), Link: 'a' },
    '../copy/platformCopy': { platformCopy, formatPlatformCopy },
    '../store/diagnosticStore': { useDiagnosticStore: hookedStore },
    '../services/api': api,
    '../services/analysisRecovery': recovery,
    '../services/reportTextDelivery': { buildWhatsAppReportParts },
    '../services/reportTransferState': transfer,
    ...additions
  };
  runInNewContext(compiled, { module, exports: module.exports, require: (id: string) => {
    assert.ok(id in imports, `Unexpected component dependency: ${id}`);
    return imports[id];
  }, localStorage: local, sessionStorage: session, window: { location: { reload: () => { reloads++; } } }, console });
  return module.exports.default as () => Element;
}
const Welcome = component('src/pages/Welcome.tsx');
store.getState().reset();
assert.equal(store.getState().startMode, 'analysis', 'a fresh session defaults to analysis');
for (const mode of ['analysis', 'crisis'] as const) {
  session.setItem('bik_universal_answers', 'stale');
  session.setItem('bik_sector_answers', 'stale');
  session.setItem('bik_questionnaire_current_index', 'stale');
  session.setItem('bik_session_ownership_token', 'stale');
  store.getState().setField('startMode', mode === 'analysis' ? 'crisis' : 'analysis');
  const tree = Welcome();
  const cards = elements(tree).filter(node => ['start-analysis', 'start-crisis'].includes(node.props['data-testid']));
  assert.equal(cards.length, 2, 'both cards are rendered');
  for (const card of cards) assert.ok(card.type === 'button' && card.props.className.includes('min-h-14'), 'each whole card is a button at least 56px high');
  const card = cards.find(node => node.props['data-testid'] === `start-${mode}`)!;
  assert.ok(text(card).includes(platformCopy[`start.${mode}.title`]), 'the approved card title is rendered');
  assert.ok(text(card).includes(platformCopy[`start.${mode}.body`]), 'the approved card body is rendered');
  card.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.getState().startMode, mode, `clicking ${mode} sets that mode after cleanup`);
  assert.equal(routes.at(-1), '/sector-select', 'both cards keep the existing journey route');
  assert.deepEqual(['bik_universal_answers', 'bik_sector_answers', 'bik_questionnaire_current_index'].map(key => session.getItem(key)), [null, null, null], 'the existing stale-answer cleanup remains active');
  assert.equal(JSON.parse(session.getItem('bik-diagnostic-storage')!).state.startMode, mode, 'the chosen mode is persisted in sessionStorage');
}
assert.equal(requests.length, 2, 'each card invokes the existing session start once');
assert.ok(requests.every(request => request.url === '/_bik-api/v1/sessions/start' && request.init.method === 'POST' && request.init.body === undefined), 'the existing session-start requests carry no mode or new request body');
assert.ok([...local.data.values()].every(value => !value.includes('startMode')), 'the new state is not written to localStorage');
session.setItem('local_sessions', 'old report');
local.setItem('bik-old-session', 'old report');
session.setItem('bik-sharing-consent:old', 'true');
local.setItem('other-app', 'keep');
session.setItem('other-app', 'keep');
const restart = elements(Welcome()).find(node => node.type === 'button' && text(node) === 'ابدأ من جديد')!;
restart.props.onClick();
assert.equal(reloads, 1, 'restart discards component and module memory');
assert.deepEqual([...session.data], [['other-app', 'keep']]);
assert.deepEqual([...local.data], [['other-app', 'keep']]);
assert.equal(store.getState().userName, '');
assert.equal(store.getState().report, null);
store.getState().setField('universalAnswers', { u01: 'yes' });
const resumedTree = Welcome();
assert.ok(elements(resumedTree).some(node => node.props['data-testid'] === 'resume-session'), 'the existing resume button remains');
for (const mode of ['analysis', 'crisis'] as const) {
  const card = elements(resumedTree).find(node => node.props['data-testid'] === `start-${mode}`)!;
  assert.ok(text(card).includes(platformCopy[`start.${mode}.title`]), 'resumable sessions keep the same card labels');
}
for (const mode of ['analysis', 'crisis']) assert.equal(sanitizeDiagnosticPersisted({ startMode: mode }).startMode, mode, 'both allowed persisted modes survive');
for (const bad of [undefined, null, 1, {}, 'other']) assert.equal(sanitizeDiagnosticPersisted({ startMode: bad }).startMode, undefined, 'invalid persisted modes are dropped');
store.getState().reset();
assert.equal(store.getState().startMode, 'analysis', 'reset restores analysis');
assert.equal(JSON.parse(session.getItem('bik-diagnostic-storage')!).state.startMode, 'analysis', 'reset also updates the persisted mode');

const dossierInput = { sectorL1: 'retail', overallScore: null, blindSpots: [], qaRecord: [], priorities: [] };
const analysisDossier = buildWhatsAppDossierText({ ...dossierInput, startMode: 'analysis' } as any);
const crisisDossier = buildWhatsAppDossierText({ ...dossierInput, startMode: 'crisis' } as any);
assert.equal(crisisDossier, analysisDossier, 'mode does not alter any WhatsApp report text');
assert.deepEqual(buildWhatsAppReportParts(crisisDossier), buildWhatsAppReportParts(analysisDossier), 'mode does not alter WhatsApp message parts');
await api.generateDiagnosticReportApi({ ...store.getState(), startMode: 'crisis' });
assert.ok(!Object.hasOwn(JSON.parse(String(requests.at(-1)!.init.body)), 'startMode'), 'the existing diagnostic API payload excludes startMode');

// The lead is rendered once above the preview, using the session's original axis order.
const Report = component('src/pages/Report.tsx', {
  '../services/blindSpotCalculator': { legacySectorLossTotal },
  '../services/reportGate': { resolveReportGate: () => ({ open: true, redirect: null }) },
  '../services/dialect': { reviewCopy: () => ({}) },
  '../components/report/ReportPreview': { ReportPreview: 'report-preview' },
  '../components/report/ReportDetails': { ReportDetails: 'report-details' },
  '../components/ConsultantChat': { __esModule: true, default: 'chat' },
  '../services/chatPolicy': { buildChatContext: () => ({}) },
  '../components/OfferCards': { __esModule: true, default: 'offers' },
  // 5-E adds a local child below the offers; the start/lead contract still executes the real Report.
  '../components/CostOfProblem': { __esModule: true, default: 'cost-of-problem' },
  '../services/offerRecommendation': { lossSustainsExecutive: () => false, recommendOffer: () => ({ key: 'focusedWeek', reason: '', rule: 'specific_issue' }) },
  '../services/offerOutcomes': { buildOfferOutcomes: () => [] }
});
store.setState({ report: { dual_layer: { clientReport: {}, consultantDossier: {} } } as any });
const leadTexts = (mode: 'analysis' | 'crisis', axes: any) => {
  store.setState({ startMode: mode, axisDetails: axes });
  const nodes = elements(Report());
  const leads = nodes.filter(node => node.props['data-testid'] === 'crisis-lead');
  if (leads.length) assert.ok(nodes.indexOf(leads[0]) < nodes.findIndex(node => node.type === 'report-preview'), 'the crisis lead appears above ReportPreview');
  return leads.map(text);
};
const axes = { first: { status: 'نقطة حرجة' }, second: { status: 'نقطة حرجة' } };
assert.deepEqual(leadTexts('crisis', axes), [formatPlatformCopy('result.crisisLead', { axis: 'first' })], 'crisis renders one lead for the first critical axis');
assert.deepEqual(leadTexts('analysis', axes), [], 'analysis has no crisis lead');
assert.deepEqual(leadTexts('crisis', { first: { status: 'مستقر' } }), [], 'crisis without critical axes has no lead');
assert.deepEqual(leadTexts('crisis', null), [], 'missing axes have no lead');

// A pre-11D report can have a combined sector total saved in its current browser session.
const sector = computeSectorBlindSpots('healthcare', {hd01: 350, hd02: 400, h01: 20});
const sectorRows = sector.spots.map(spot => ({name: spot.name, monthly_amount: spot.monthlyAmount}));
function offerAmount(
  rows: typeof sectorRows, computedMonthlyWaste: number | null, monthlyReducibleWaste: number | null,
  sector_sensitivities?: typeof sector.sensitivities
) {
  const clientReport = { sector_sensitivities, financial_impact: {
    declaredValueModel: { currency: 'EGP', monthlyReducibleWaste, computedMonthlyWaste },
    sector_blind_spots: rows
  }};
  store.setState({ report: { dual_layer: { clientReport, consultantDossier: {} } } as any });
  return elements(Report()).find(node => node.type === 'offers')?.props.monthlyWaste?.amount;
}
const legacyRows = [...sectorRows, {name: sector.sensitivities[0].name, monthly_amount: 21000}];
assert.equal(offerAmount(legacyRows, 49000, null), 28000, 'legacy assumed losses cannot enter offer selection');
assert.equal(offerAmount(legacyRows.slice(1), 21000, null), undefined, 'a report with only an old assumed loss shows no offer loss');
assert.equal(offerAmount(sectorRows, 28000, null, sector.sensitivities), 28000, 'new reports pass only the declared loss total');
assert.equal(offerAmount([], null, null, sector.sensitivities), undefined, 'new sensitivities cannot enter offer selection');
assert.equal(offerAmount(legacyRows, 49000, 3000), 3000, 'explicitly declared waste takes priority over the sector total');

const protectedConsumers = ['src/pages/Questionnaire.tsx', 'src/services/adaptiveDiagnosticEngine.ts', 'src/services/deterministicScoring.ts', 'src/services/dualLayerReport.ts', 'src/services/reportTextDelivery.ts'];
for (const file of protectedConsumers) assert.ok(!readFileSync(file, 'utf8').includes('startMode'), `${file}: mode does not affect questions, scoring or WhatsApp`);
store.getState().reset();
console.log('START CARDS: PASS (real card clicks, cleanup, session storage, reset, lead order and payload isolation)');
