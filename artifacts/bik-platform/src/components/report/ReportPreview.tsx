import React from 'react';
import type { ClientExecutiveReport } from '../../types/dualLayer';
import { declaredSectorRows, formatOnePointSensitivity } from '../../services/blindSpotCalculator';

interface Props { clientReport: ClientExecutiveReport; }

const statusLabels: Record<string, string> = {
  Observed: 'إشارة من إجاباتك',
  Hypothesis: 'تفسير محتمل يحتاج إلى تحقق',
  Validated: 'استنتاج تدعمه الإجابات',
  'Insufficient Data': 'بيانات غير كافية'
};

export function ReportPreview({ clientReport: report }: Props) {
  const valueModel = report.financial_impact?.declaredValueModel;
  const declaredRows = declaredSectorRows(report.financial_impact?.sector_blind_spots);
  const currency = report.financial_impact?.currency;
  return <div className="space-y-4">
    <section data-testid="preview-summary" className="overflow-hidden rounded-[1.7rem] bg-[#0F172A] p-6 text-[#FBFAF6] md:p-8">
      <p className="text-xs font-bold tracking-wide text-[#DCC78D]">الخلاصة التنفيذية</p>
      <h2 className="mt-2 font-display text-2xl font-bold md:text-3xl">قراءة نشاطك كما ظهر من الإجابات</h2>
      <p className="mt-4 leading-8 text-[#F4F1E9]">{report.executive_diagnosis.headline}</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/20 px-3 py-1.5">{report.health_score_computed === false || !Number.isFinite(Number(report.health_score)) ? `المؤشر غير محسوب · ${report.health_label}` : `المؤشر ${report.health_score}/100 · ${report.health_label}`}</span>
        <span className="rounded-full border border-white/20 px-3 py-1.5">التغطية {report.coverage}%</span>
        <span className="rounded-full border border-white/20 px-3 py-1.5">الثقة {report.confidence}</span>
      </div>
      <p className="mt-4 text-xs leading-6 text-white/65">قراءة إرشادية لإجاباتك، وليست تدقيقاً مالياً أو توقعاً لنتائج مستقبلية.</p>
    </section>

    <section data-testid="preview-signals" className="rounded-2xl border border-[#0F172A]/10 bg-[#FBFAF6] p-5 md:p-7">
      <p className="text-xs font-bold text-[#92763D]">ما ظهر في الإجابات</p>
      <h2 className="mt-1 font-display text-xl font-bold">إشارات مصنّفة حسب أساسها</h2>
      <div className="mt-4 space-y-3">
        {(report.what_we_discovered || []).slice(0, 3).map((finding, index) => <article key={`${finding.title}-${index}`} className="rounded-xl border-r-2 border-[#C9A961] bg-[#F5F2EA] p-4">
          <p className="text-xs font-bold text-[#8B7135]">{statusLabels[finding.status] || finding.status}</p>
          <h3 className="mt-1 font-bold">{finding.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[#68717A]">{finding.explanation}</p>
          {finding.evidence_reference && <p className="mt-2 text-xs leading-6 text-[#526B7B]">الأساس: {finding.evidence_reference}</p>}
        </article>)}
        {!report.what_we_discovered?.length && <p className="text-sm leading-7 text-[#68717A]">لا تتوافر إشارات كافية لعرض استنتاج محدد.</p>}
      </div>
    </section>

    <section data-testid="preview-priority" className="rounded-2xl border border-[#0F172A]/10 bg-[#FBFAF6] p-5 md:p-7">
      <p className="text-xs font-bold text-[#92763D]">الخطوة التالية</p>
      <h2 className="mt-1 font-display text-xl font-bold">أولوية قابلة للمراجعة</h2>
      {(report.top_priorities || []).slice(0, 1).map(priority => <div key={priority.rank} className="mt-3">
        <h3 className="font-bold">{priority.title}</h3><p className="mt-2 text-sm leading-7 text-[#68717A]">{priority.why_it_matters}</p>
        <p className="mt-2 text-sm leading-7"><strong>خطوة أولى:</strong> {priority.first_action}</p>
      </div>)}
      {!report.top_priorities?.length && <p className="mt-3 text-sm leading-7 text-[#68717A]">استكمال البيانات التي قد تغيّر القرار قبل اعتماد خطة تنفيذ.</p>}
      {report.sector_sensitivities?.map(spot => (
        <p key={spot.id} className="mt-2 text-sm leading-7 text-[#68717A]">
          {formatOnePointSensitivity(spot.name, spot.monthlyAmount, currency)}
        </p>
      ))}
    </section>

    <section data-testid="preview-financial" className="rounded-2xl border border-[#C9A961]/35 bg-[#F6F0DF] p-5 md:p-7">
      <p className="text-xs font-bold text-[#8B7135]">ميزان القرار</p>
      <h2 className="mt-1 font-display text-xl font-bold">ما تستعيده بقرار واحد</h2>
      {valueModel?.isComputable ? <>
        <p className="mt-3 text-sm leading-7 text-[#5D5542]">بحسب مدخلاتك أنت وافتراضات النموذج المعلنة: قرار واحد محسوم يعيد إليك ما يقارب {valueModel.grossImpactLow}–{valueModel.grossImpactHigh} {valueModel.currency} خلال {valueModel.evaluationDays} يوماً — وتبدأ الاستعادة حين تُحسم نقطة الاختناق.</p>
        <p className="mt-2 text-xs leading-6 text-[#70664F]">وبالمقابل: كل يوم انتظار يؤجّل هذه الاستعادة على حال. هذا تقدير مشروط بمدخلاتك وليس وعداً مالياً؛ وهو ما يجعل قرارك عندها حساباً لا انفعالاً.</p>
      </> : <>
        <p className="mt-3 text-sm leading-7 text-[#5D5542]">لا يُحسب هذا الميزان بأمانة من البيانات الحالية، ولن يُختلق رقم لا يقوم على أرض صلبة. ما ينقص التحقق: {valueModel?.gaps.join('، ') || 'معلومات مالية إضافية للتحقق'}.</p>
        <p className="mt-2 text-xs leading-6 text-[#70664F]">استكمال هذا النقص هو أول عمل مشترك مع أ/ أحمد، ومكالمتكما المجانية تبدأ من عنده.</p>
      </>}
      {declaredRows.length > 0 && <div className="mt-4 space-y-2 rounded-xl border border-[#146B4F]/25 bg-[#F1F3EC] p-4" data-testid="preview-blind-spots">
        <p className="text-xs font-bold text-[#146B4F]">من أرقامك المصرَّح بها في التشخيص العميق: ما يتركه كل شهر بين يديك</p>
        {declaredRows.map(spot => <p key={spot.name} className="text-sm leading-7 text-[#44584C]">{spot.name}: قرابة {spot.monthly_amount.toLocaleString('ar-EG')} {report.financial_impact?.currency} شهرياً</p>)}
        <p className="text-xs leading-6 text-[#70664F]">أرقام مشتقة من إجاباتك أنت بمعادلات محاسبية معلنة، ليست وعداً ولا تدقيقاً.</p>
      </div>}
    </section>
  </div>;
}
