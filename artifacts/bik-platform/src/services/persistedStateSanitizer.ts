import { sanitizeReviewState } from './reviewState';

/**
 * Fix F4 (round-5): تطبيع كل ما يعود من التخزين المحلي قبل أن يلمس المتجر.
 *
 * التخزين المحلي أرضٌ معادية: سجل قديم تالٍ، أو نسخة من إصدار سابق بمخطط مختلف،
 * أو بيانات عبث بها زائر فضولي. العقد هنا صارم: قائمة بيضاء فقط، وكل حقل لا يجتاز
 * فحص نوعه يُسقط نهائياً (يُحذف من الكائن، لا يُترك بقيمة فارغة تخفي العطل).
 * المتجر يستدعيها على كل استرجاع، فلا يصل أي حقل غير متحقق منه إلى رحلة التشخيص.
 */

const STRING_FIELDS = [
  'sessionId',
  'userName',
  'companyName',
  'whatsapp',
  'sectorL1',
  'sectorL2',
  'currentQuestionId'
] as const;

const ANSWER_MAP_FIELDS = ['answers', 'intakeAnswers', 'universalAnswers', 'sectorAnswers'] as const;

const STEPS = ['welcome', 'sector', 'intake', 'universal', 'sector-q', 'processing', 'gate', 'report'] as const;

const DEPTHS = ['quick', 'deep'] as const;
const START_MODES = ['analysis', 'crisis'] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** يقبل إما مغلف التخزين { state, version } أو كائن الحالة نفسه، ويعيد الحالة المطيَّعة. */
export function sanitizeDiagnosticPersisted(input: unknown): Record<string, unknown> {
  const raw = input && typeof input === 'object' && isPlainObject((input as any).state)
    ? (input as { state: Record<string, unknown> }).state
    : isPlainObject(input)
      ? input
      : {};

  const safe: Record<string, unknown> = {};

  for (const field of STRING_FIELDS) {
    if (typeof raw[field] === 'string') safe[field] = raw[field];
  }

  if (typeof raw.startMode === 'string' && (START_MODES as readonly string[]).includes(raw.startMode)) {
    safe.startMode = raw.startMode;
  }

  if (typeof raw.diagnosticDepth === 'string' && (DEPTHS as readonly string[]).includes(raw.diagnosticDepth)) {
    safe.diagnosticDepth = raw.diagnosticDepth;
  }

  if (typeof raw.currentStep === 'string' && (STEPS as readonly string[]).includes(raw.currentStep)) {
    safe.currentStep = raw.currentStep;
  }

  for (const field of ANSWER_MAP_FIELDS) {
    if (isPlainObject(raw[field])) safe[field] = raw[field];
  }

  if (Array.isArray(raw.questionHistory)) {
    safe.questionHistory = raw.questionHistory.filter(isPlainObject);
  }

  if (Array.isArray(raw.dataGaps)) {
    safe.dataGaps = raw.dataGaps.filter(isPlainObject);
  }

  if (Array.isArray(raw.conversationHistory)) {
    safe.conversationHistory = raw.conversationHistory.filter(isPlainObject);
  }

  if (typeof raw.universalProgress === 'number' && Number.isFinite(raw.universalProgress)) {
    safe.universalProgress = raw.universalProgress;
  }
  if (typeof raw.sectorProgress === 'number' && Number.isFinite(raw.sectorProgress)) {
    safe.sectorProgress = raw.sectorProgress;
  }
  if (raw.instantScore === null || (typeof raw.instantScore === 'number' && Number.isFinite(raw.instantScore))) {
    safe.instantScore = raw.instantScore;
  }
  if (raw.axisScores === null || isPlainObject(raw.axisScores)) {
    safe.axisScores = raw.axisScores;
  }
  if (raw.axisDetails === null || isPlainObject(raw.axisDetails)) {
    safe.axisDetails = raw.axisDetails;
  }
  if (raw.report === null || isPlainObject(raw.report)) {
    safe.report = raw.report;
  }
  if (raw.proposal === null || typeof raw.proposal === 'string') {
    safe.proposal = raw.proposal;
  }
  if (raw.overallConfidence === null || (typeof raw.overallConfidence === 'string'
    && ['عالي', 'متوسط', 'منخفض'].includes(raw.overallConfidence))) {
    safe.overallConfidence = raw.overallConfidence;
  }
  if (raw.overallCoverage === null || (typeof raw.overallCoverage === 'number' && Number.isFinite(raw.overallCoverage))) {
    safe.overallCoverage = raw.overallCoverage;
  }
  if (typeof raw.leadSaveWarning === 'boolean') {
    safe.leadSaveWarning = raw.leadSaveWarning;
  }

  safe.review = sanitizeReviewState(raw.review);
  return safe;
}
