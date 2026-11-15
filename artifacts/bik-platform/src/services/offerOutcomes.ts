/**
 * Fix: offer cards show what THIS client needs, derived only from his diagnosed axes.
 * Pure and deterministic. Every line is a piece of work the offer covers (never a promised result),
 * and every line is tied to an axis the platform actually evaluated.
 * No padding: if fewer than 5 axes need work, fewer lines are shown.
 */
export interface OfferOutcome {
  axis: string;
  kind: 'weak' | 'gap';
  /** What the consultant works on, in the client's case. */
  outcome: string;
  /** The platform's own finding behind it (from the client's answers), when one exists. */
  basis?: string;
}

interface AxisLike {
  status?: string;
  score?: number;
  evidence?: Array<{ signal?: string; findingDescription?: string }>;
}

export const MAX_OFFER_OUTCOMES = 5;

export const AXIS_OUTCOMES: Record<string, string> = {
  'بنية الشركة وهويتها': 'تثبيت هوية النشاط ونموذج عمله ووضوح من يخدم وبماذا يتميز',
  'الصحة المالية': 'تحديد مصدر الضغط المالي (الهامش أو السيولة أو التسعير) واعتماد قرار تصحيح مرتب',
  'العملاء والمبيعات': 'رسم مسار بيعي واضح من العميل المحتمل حتى الإغلاق وتحديد مواضع التسرب فيه',
  'الفريق والعمليات': 'توثيق الإجراءات وتوزيع المسؤوليات لتقليل اعتماد التشغيل على المؤسس',
  'الموقع التنافسي': 'مراجعة عرض القيمة وتمييز النشاط عن البدائل المتاحة للعميل',
  'الرؤية والنمو': 'تحويل هدف النمو إلى خطة بأولويات ومؤشرات متابعة'
};

const GAP_STATUS = 'بيانات غير كافية';
const SEVERITY: Record<string, number> = { 'نقطة حرجة': 0, 'يحتاج تحسين': 1 };

function firstNegativeBasis(detail: AxisLike): string | undefined {
  const text = (detail.evidence || []).find(item => item?.signal === 'negative' && item.findingDescription)?.findingDescription;
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

export function buildOfferOutcomes(axisDetails: Record<string, AxisLike> | null | undefined, max = MAX_OFFER_OUTCOMES): OfferOutcome[] {
  const entries = Object.entries(axisDetails || {});

  const weak = entries
    .filter(([, detail]) => detail?.status !== undefined && detail.status in SEVERITY)
    .sort(([, a], [, b]) => (SEVERITY[a.status as string] - SEVERITY[b.status as string]) || ((a.score ?? 0) - (b.score ?? 0)))
    .map(([axis, detail]): OfferOutcome => ({
      axis,
      kind: 'weak',
      outcome: AXIS_OUTCOMES[axis] || `معالجة ما ظهر في محور «${axis}»`,
      basis: firstNegativeBasis(detail)
    }));

  const gaps = entries
    .filter(([, detail]) => detail?.status === GAP_STATUS)
    .map(([axis]): OfferOutcome => ({
      axis,
      kind: 'gap',
      outcome: `استكمال بيانات محور «${axis}» بالتحقق من المصدر قبل الحكم عليه`
    }));

  return [...weak, ...gaps].slice(0, max);
}
