import {
  DIAGNOSTIC_DIMENSIONS,
  QUESTION_METRIC_LABELS,
  type AxisDetail,
  type FindingEvidence,
} from '../services/deterministicScoring';
import type { Dialect } from '../services/dialect';

export const PATHWAY_AXIS_NAMES = {
  AX1: 'بنية الشركة وهويتها',
  AX2: 'الصحة المالية',
  AX3: 'العملاء والمبيعات',
  AX4: 'الفريق والعمليات',
  AX5: 'الموقع التنافسي',
  AX6: 'الرؤية والنمو',
} as const;

export type PathwayAxis = keyof typeof PATHWAY_AXIS_NAMES;
export type LibraryDialect = 'egypt' | 'saudi' | 'emirati' | 'gulf_generic' | 'msa_neutral';
type PathwayCopy = { headline: string; meaning: string; action: string };

export interface SlimPathway {
  id: string;
  axis: PathwayAxis;
  title: string;
  service_name: string;
  dialects: Partial<Record<LibraryDialect, string>> & { msa_neutral: string };
  platform_copy: Partial<Record<LibraryDialect, Partial<PathwayCopy>>> & { msa_neutral: PathwayCopy };
}

export interface PathwayCardContent extends PathwayCopy {
  id: string;
  axis: PathwayAxis;
  ownerPhrase: string;
  serviceName: string;
}

export interface PathwayGroup {
  axis: PathwayAxis;
  title: string;
  pathways: PathwayCardContent[];
}

interface PathwayScoreResult {
  axisDetails?: Record<string, Pick<AxisDetail, 'score' | 'status'>> | null;
  topWeaknesses?: readonly Pick<FindingEvidence, 'sourceQuestionId'>[] | null;
}

const dialectMap = {
  egyptian: 'egypt',
  egypt: 'egypt',
  saudi: 'saudi',
  emirati: 'emirati',
  gulf: 'gulf_generic',
  gulf_generic: 'gulf_generic',
  fusha: 'msa_neutral',
  msa_neutral: 'msa_neutral',
} as const satisfies Record<Dialect | LibraryDialect, LibraryDialect>;

const axes = Object.keys(PATHWAY_AXIS_NAMES) as PathwayAxis[];
const stopWords = new Set([
  'إلى', 'الى', 'على', 'التي', 'الذي', 'الذين', 'هذا', 'هذه', 'ذلك', 'تلك', 'هناك',
  'بين', 'بعد', 'قبل', 'عند', 'حتى', 'عبر', 'لدى', 'غير', 'كيف', 'متى', 'أين',
  'أيضا', 'لكن', 'كان', 'كانت', 'إنها', 'أنها', 'وهو', 'وهي',
]);

async function loadSlimPathways(): Promise<readonly SlimPathway[]> {
  const { default: pathways } = await import('./pathways.slim.json', { with: { type: 'json' } });
  return pathways as readonly SlimPathway[];
}

export function localizePathway(pathway: SlimPathway, dialect: unknown): PathwayCardContent {
  const key = typeof dialect === 'string' && Object.hasOwn(dialectMap, dialect)
    ? dialectMap[dialect as keyof typeof dialectMap]
    : 'msa_neutral';
  const copy = pathway.platform_copy[key];
  const fallback = pathway.platform_copy.msa_neutral;
  const ownerPhrase = pathway.dialects[key];
  return {
    id: pathway.id,
    axis: pathway.axis,
    serviceName: pathway.service_name,
    ownerPhrase: ownerPhrase?.trim() ? ownerPhrase : pathway.dialects.msa_neutral,
    headline: copy?.headline?.trim() ? copy.headline : fallback.headline,
    meaning: copy?.meaning?.trim() ? copy.meaning : fallback.meaning,
    action: copy?.action?.trim() ? copy.action : fallback.action,
  };
}

function arabicTokens(text: string): Set<string> {
  const words = text.normalize('NFC').replace(/[\p{M}\u0640]/gu, '').match(/\p{L}+/gu) ?? [];
  return new Set(words
    .filter(word => /^\p{Script=Arabic}+$/u.test(word) && !stopWords.has(word))
    .map(word => word.replace(/^ال/u, ''))
    .filter(word => word.length >= 3 && !stopWords.has(word)));
}

const compareById = (a: SlimPathway, b: SlimPathway) => a.id.localeCompare(b.id, 'en');

export async function selectForReport(scoreResult: PathwayScoreResult | null | undefined, dialect: unknown) {
  const weakest = axes.flatMap(axis => {
    const detail = scoreResult?.axisDetails?.[PATHWAY_AXIS_NAMES[axis]];
    if (!detail || !Number.isFinite(detail.score) || (detail.status !== 'يحتاج تحسين' && detail.status !== 'نقطة حرجة')) return [];
    return [{ axis, score: detail.score }];
  }).sort((a, b) => a.score - b.score).slice(0, 2);

  const weakIds = new Set(scoreResult?.topWeaknesses?.map(item => item.sourceQuestionId));
  const matches = weakest.map(({ axis }) => {
    const labels = DIAGNOSTIC_DIMENSIONS[PATHWAY_AXIS_NAMES[axis]]
      .filter(id => weakIds.has(id))
      .map(id => QUESTION_METRIC_LABELS[id]);
    return { axis, tokens: arabicTokens(labels.join(' ')) };
  }).filter(match => match.tokens.size > 0);
  if (matches.length === 0) return [];

  const pathways = await loadSlimPathways();
  return matches.flatMap(({ axis, tokens }) => pathways
    .filter(pathway => pathway.axis === axis)
    .map(pathway => ({
      pathway,
      shared: [...arabicTokens(`${pathway.title} ${pathway.dialects.msa_neutral}`)].filter(word => tokens.has(word)).length,
    }))
    .filter(candidate => candidate.shared >= 1)
    .sort((a, b) => b.shared - a.shared || compareById(a.pathway, b.pathway))
    .slice(0, 2)
    .map(({ pathway }) => localizePathway(pathway, dialect)));
}

export async function listForConsultant(dialect: unknown): Promise<PathwayGroup[]> {
  const sorted = [...await loadSlimPathways()].sort(compareById);
  return axes.map(axis => ({
    axis,
    title: PATHWAY_AXIS_NAMES[axis],
    pathways: sorted.filter(pathway => pathway.axis === axis).map(pathway => localizePathway(pathway, dialect)),
  }));
}
