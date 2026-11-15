import React from 'react';
import type { ClientExecutiveReport, EvidenceBasedSwot } from '../../types/dualLayer';
import type { DiagnosticReport } from '../../types';
import type { AxisDetail } from '../../services/deterministicScoring';
import { DIAGNOSTIC_DIMENSIONS } from '../../services/deterministicScoring';
import { scrubInternalIds } from '../../services/internalIdScrub';

interface Props {
  clientReport: ClientExecutiveReport;
  report: DiagnosticReport;
  axisScores: Record<string, number> | null;
  axisDetails: Record<string, AxisDetail> | null;
}

const quadrants: Array<{ key: keyof EvidenceBasedSwot; title: string; tone: string }> = [
  { key: 'strengths', title: 'نقاط القوة', tone: 'border-emerald-700/30 bg-emerald-50' },
  { key: 'weaknesses', title: 'نقاط الضعف', tone: 'border-rose-700/25 bg-rose-50' },
  { key: 'opportunities', title: 'الفرص', tone: 'border-sky-700/25 bg-sky-50' },
  { key: 'threats', title: 'التهديدات', tone: 'border-amber-700/30 bg-amber-50' }
];

export function ReportDetails({ clientReport, report, axisScores, axisDetails }: Props) {
  const axes = Object.keys(DIAGNOSTIC_DIMENSIONS);
  const issues: Array<{ title: string; detail: string; status: string; evidence?: string }> = [
    ...(report.blind_spots || []).map(item => ({
      title: item.name,
      detail: item.description,
      status: `نقطة عمياء · ${item.impact_level}`,
      evidence: item.source_question
    })),
    ...(report.diagnostic_findings?.observed_weaknesses || []).map(item => ({
      title: item.dimension,
      detail: item.findingDescription,
      status: 'إشارة من إجاباتك',
      evidence: item.sourceQuestionId
    })),
    ...(report.diagnostic_findings?.hypotheses || []).map(item => ({
      title: item.dimension,
      detail: item.title,
      status: `تفسير محتمل · ثقة ${Math.round(item.confidence * 100)}%`,
      evidence: item.missingEvidence.join('، ')
    })),
    ...(report.diagnostic_findings?.validated_diagnoses || []).map(item => ({
      title: item.dimension,
      detail: item.title,
      status: `استنتاج تدعمه الإجابات · ثقة ${Math.round(item.confidence * 100)}%`,
      evidence: item.evidenceRefs.join('، ')
    })),
    ...(report.diagnostic_findings?.data_gaps || []).map(item => ({
      title: item.dimension,
      detail: item.impactOnDiagnosis,
      status: 'فجوة بيانات',
      evidence: item.missingQuestions.join('، ')
    })),
    ...(clientReport.data_gaps || []).map(item => ({
      title: item.metric_label,
      detail: item.impact_on_diagnosis,
      status: 'بيانات غير كافية',
      evidence: item.credibility_note
    })),
    ...(clientReport.what_we_discovered || []).map(item => ({
      title: item.title,
      detail: `${item.explanation} ${item.business_consequence}`.trim(),
      status: item.status === 'Observed' ? 'إشارة من إجاباتك'
        : item.status === 'Hypothesis' ? 'تفسير محتمل يحتاج إلى تحقق'
        : item.status === 'Validated' ? 'استنتاج تدعمه الإجابات'
        : 'بيانات غير كافية',
      evidence: scrubInternalIds(item.evidence_reference)
    }))
    // Internal codes never reach the screen: every evidence string is scrubbed before display.
  ].map(issue => ({ ...issue, evidence: issue.evidence ? scrubInternalIds(issue.evidence) : issue.evidence }))
    .filter(issue => !issue.evidence || issue.evidence.length > 0);

  return <div className="space-y-5">
    <section data-testid="results-six-axes" className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 md:p-7">
      <p className="text-xs font-bold text-[#92763D]">محاور التشخيص</p>
      <h2 className="mt-1 font-display text-xl font-bold">المحاور الستة وأهلية البيانات</h2>
      <p className="mt-2 text-sm leading-7 text-[#68717A]">المحور الذي لا يملك إجابات كافية يظهر كفجوة، لا كدرجة مؤكدة.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {axes.map(name => {
          const detail = axisDetails?.[name];
          const score = axisScores?.[name] ?? detail?.score;
          const eligible = Boolean(detail && detail.status !== 'بيانات غير كافية' && Number.isFinite(score));
          return <article key={name} className="rounded-xl border border-[#0F172A]/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold">{name}</h3>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${eligible ? 'bg-[#EAF2EC] text-[#355B42]' : 'bg-[#F6F0DF] text-[#806A37]'}`}>
                {eligible ? `${Math.round(score!)} / 100` : 'بيانات غير كافية'}
              </span>
            </div>
            <p className="mt-3 text-xs leading-6 text-[#68717A]">
              {eligible ? `${detail.status} · تغطية ${detail.coverage}% · ثقة ${detail.confidence}` : 'لا تعرض BIK درجة لهذا المحور دون مدخلات كافية.'}
            </p>
            {detail?.dataGaps?.length ? <p className="mt-2 text-xs leading-6 text-[#8B7135]">المطلوب: {detail.dataGaps.join('، ')}</p> : null}
          </article>;
        })}
      </div>
    </section>

    <section data-testid="results-swot" className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 md:p-7">
      <p className="text-xs font-bold text-[#92763D]">تحليل SWOT المدعوم بالأدلة</p>
      <h2 className="mt-1 font-display text-xl font-bold">الأربع خانات</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {quadrants.map(({ key, title, tone }) => {
          const items = clientReport.swot?.[key] || [];
          return <article key={key} className={`rounded-xl border p-4 ${tone}`}>
            <h3 className="font-bold">{title} <span className="text-xs font-normal">({items.length})</span></h3>
            {items.length ? <ul className="mt-3 space-y-3">
              {items.map((item, index) => <li key={`${item.text}-${index}`} className="text-sm leading-7">
                <p>{item.text}</p>
                <p className="mt-1 text-xs text-[#526B7B]">{item.classification === 'OBSERVED' ? 'ملاحظة من إجابة' : item.classification === 'CALCULATED' ? 'محسوب' : item.classification === 'DERIVED' ? 'استنتاج مشتق' : 'سياق قطاعي'}{item.evidence_label ? ` · ${scrubInternalIds(item.evidence_label)}` : ''}</p>
              </li>)}
            </ul> : <p className="mt-3 text-sm text-[#68717A]">لا توجد إشارة كافية في هذا الجانب.</p>}
          </article>;
        })}
      </div>
    </section>

    <section data-testid="results-issue-board" className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 md:p-7">
      <p className="text-xs font-bold text-[#92763D]">لوحة الإشارات والفجوات</p>
      <h2 className="mt-1 font-display text-xl font-bold">كل ما يستحق المراجعة</h2>
      <p className="mt-2 text-sm leading-7 text-[#68717A]">نعرض العناصر التي أنتجها محرك التشخيص دون الاقتصار على أعلى نقطة أو إخفاء البيانات الناقصة.</p>
      {issues.length ? <div className="mt-5 space-y-3">
        {issues.map((issue, index) => <article key={`${issue.title}-${index}`} className="rounded-xl border border-[#0F172A]/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">{issue.title || 'عنصر يحتاج مراجعة'}</h3>
            <span className="rounded-full bg-[#F6F0DF] px-2.5 py-1 text-[11px] font-bold text-[#806A37]">{issue.status}</span>
          </div>
          <p className="mt-2 text-sm leading-7 text-[#526B7B]">{issue.detail || 'لا تتوافر تفاصيل إضافية في هذه الجلسة.'}</p>
          {issue.evidence && <p className="mt-2 text-xs leading-6 text-[#68717A]">الأساس أو المعلومة الناقصة: {issue.evidence}</p>}
        </article>)}
      </div> : <p className="mt-4 rounded-xl bg-white p-4 text-sm leading-7 text-[#68717A]">لم تنتج الإجابات عناصر إضافية قابلة للتصنيف؛ راجع المحاور وفجوات البيانات أعلاه.</p>}
    </section>
  </div>;
}
