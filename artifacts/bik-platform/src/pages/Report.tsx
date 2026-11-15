import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserRound } from 'lucide-react';
import { formatPlatformCopy } from '../copy/platformCopy';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { buildWhatsAppReportParts } from '../services/reportTextDelivery';
import { readLatestAnalysisRecovery } from '../services/analysisRecovery';
import { readTransferProgress, isTransferDone } from '../services/reportTransferState';
import { resolveReportGate } from '../services/reportGate';

// مدخلات بوابة التقرير تُقرأ من موافقة هذه الجلسة ومن سجل النقل فقط.
// سجل الاسترداد في localStorage لا يُسأل عن أي موافقة: استرداده يُعيد التقرير
// إلى الذاكرة، أما فتح البوابة فقرارها لعلامة الإتمام أو موافقة الجلسة الحية (F3).
function collectGateInputs(input: { sessionId?: string; report: unknown; dossier: string }) {
  let sessionConsent = false;
  try {
    sessionConsent = input.sessionId
      ? sessionStorage.getItem(`bik-sharing-consent:${input.sessionId}`) === 'true'
      : false;
  } catch {
    sessionConsent = false;
  }
  let allPartsSent = false;
  let doneMarkVerified = false;
  try {
    const parts = buildWhatsAppReportParts(input.dossier, input.sessionId);
    const progress = readTransferProgress(localStorage, input.sessionId, parts);
    allPartsSent = parts.length > 0
      && progress.currentIndex === parts.length
      && progress.parts.every(part => part.status === 'sent');
    doneMarkVerified = allPartsSent && isTransferDone(localStorage, input.sessionId, parts);
  } catch {
    allPartsSent = false;
    doneMarkVerified = false;
  }
  const reportData = input.report as { dual_layer?: unknown } | null | undefined;
  return {
    hasReport: Boolean(reportData?.dual_layer),
    sessionConsent,
    allPartsSent,
    doneMarkVerified
  };
}
import { reviewCopy } from '../services/dialect';
import { ReportPreview } from '../components/report/ReportPreview';
import { ReportDetails } from '../components/report/ReportDetails';
import ConsultantChat from '../components/ConsultantChat';
import { buildChatContext } from '../services/chatPolicy';
import OfferCards from '../components/OfferCards';
import CostOfProblem from '../components/CostOfProblem';
import { lossSustainsExecutive, recommendOffer } from '../services/offerRecommendation';
import { buildOfferOutcomes } from '../services/offerOutcomes';

export default function Report() {
  const navigate = useNavigate();
  const { sessionId, report, axisScores, axisDetails, sectorL1, sectorL2, companyName, startMode } = useDiagnosticStore();
  const firstCriticalAxis = Object.entries(axisDetails || {}).find(([, detail]) => detail?.status === 'نقطة حرجة')?.[0];
  const dossier = report?.dual_layer?.consultantDossier?.full_dossier_text || '';
  // سطر الخسارة في بطاقات العروض: المصرَّح به من أرقام العميل وحده، أو المشتق من أرقامه
  // المصرَّح بها في التشخيص العميق، من ميزان القرار، بلا أي رقم مُختلَق.
  const monthlyWaste = useMemo(() => {
    const model = report?.dual_layer?.clientReport?.financial_impact?.declaredValueModel;
    if (!model) return null;
    // المصرَّح به مباشرة من صاحب النشاط يُعرض كما هو؛ والمشتق من أرقامه في التشخيص العميق
    // يُستعمل فقط حين لا يوجد إعلان مباشر. لا رقم ثالث ولا رقم مُختلَق.
    const declared = model.monthlyReducibleWaste;
    const amount = declared != null && Number.isFinite(declared) && declared > 0
      ? declared
      : model.computedMonthlyWaste;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
    return { amount, currency: model.currency };
  }, [report]);
  const recommendation = useMemo(
    () => recommendOffer({ overallComputed: report?.dual_layer?.clientReport?.health_score_computed, axisDetails, lossSustainsExecutive: lossSustainsExecutive(monthlyWaste), startMode }),
    [report, axisDetails, monthlyWaste, startMode]
  );
  const outcomes = useMemo(() => buildOfferOutcomes(axisDetails), [axisDetails]);
  const chatContext = useMemo(
    () => buildChatContext({
      startMode,
      sector: sectorL2 || sectorL1,
      overallComputed: report?.dual_layer?.clientReport?.health_score_computed,
      lossSustainsExecutive: recommendation.rule === 'real_loss_covers_it',
      axisDetails
    }),
    [report, axisDetails, sectorL1, sectorL2, recommendation.rule, startMode]
  );
  const partCount = useMemo(() => buildWhatsAppReportParts(dossier, sessionId).length, [dossier, sessionId]);

  // F2 (round-5): قرار البوابة يُحلّ متزامناً في مُهيّئ الحالة، قبل أي تأثير أو عرض.
  // لا تمرّ شاشة التقرير أمام الزائر قبل أن يُفحص إثبات النهاية أو موافقة الجلسة.
  const [gate, setGate] = useState(() => resolveReportGate(collectGateInputs({ sessionId, report, dossier })));

  useEffect(() => {
    if (!report) {
      const snapshot = readLatestAnalysisRecovery(localStorage);
      if (snapshot) {
        useDiagnosticStore.setState({
          sessionId: snapshot.sessionId,
          report: snapshot.report,
          axisScores: snapshot.axisScores,
          axisDetails: snapshot.axisDetails,
          sectorL1: snapshot.sectorL1,
          sectorL2: snapshot.sectorL2
        });
        console.info('[bik-transfer]', { event: 'analysis_recovered' });
        // وصل التقرير عبر الاسترداد: البوابة تُعاد على الجلسة المستعادة نفسها.
        setGate(resolveReportGate(collectGateInputs({
          sessionId: snapshot.sessionId,
          report: snapshot.report,
          dossier: (snapshot.report as any)?.dual_layer?.consultantDossier?.full_dossier_text || ''
        })));
        return;
      }
    }
    if (!gate.open && gate.redirect) {
      const target = gate.redirect === 'lead-gate'
        ? '/lead-gate'
        : gate.redirect === 'report-transfer'
          ? '/report-transfer'
          : '/';
      navigate(target, { replace: true });
    }
  }, [report, sessionId, dossier, partCount, gate, navigate]);

  if (!gate.open) {
    return <main className="min-h-[100dvh] grid place-items-center bg-[#F4F1E9]" dir="rtl"><p role="status">يجري التحقق من بوابة التقرير…</p></main>;
  }

  if (!report?.dual_layer) return <main className="min-h-[100dvh] grid place-items-center bg-[#F4F1E9]" dir="rtl"><p role="status">تجري استعادة التقرير…</p></main>;

  return <main className="min-h-[100dvh] bg-[#F4F1E9] text-[#0F172A] pb-16" dir="rtl" lang="ar">
    <header className="border-b border-[#0F172A]/10 bg-[#FBFAF6]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <Link to="/" className="font-display text-xl font-bold">BIK <span className="text-[#C9A961]">/</span> التقرير</Link>
        <Link to="/consultant" className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#26354E]" data-testid="header-consultant-link"><UserRound size={16} /> تعرّف على المستشار</Link>
      </div>
    </header>
    <div className="page-enter mx-auto max-w-5xl space-y-5 px-4 py-8 md:px-8 md:py-12">
      <div>
        <p className="text-xs font-bold tracking-[.16em] text-[#8B7135]">تم فتح التقرير بعد إقرارك بكل الأجزاء</p>
        <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">{companyName?.trim() ? `تشخيص ${companyName.trim()}` : 'تشخيص شركتك'}: أين تختنق أرباحك، ولماذا، وماذا يكلّفك تجاهل ذلك</h1>
      </div>
      {!!report.dual_layer.clientReport.review?.length && <section className="rounded-[1.7rem] border border-[#C9A961]/30 bg-[#FBFAF6] p-6 md:p-8" data-testid="review-report-section">
        <h2 className="font-display text-2xl font-bold">{reviewCopy('fusha').sectionTitle}</h2>
        {report.dual_layer.clientReport.review.map(section => <div key={section.page} className="mt-5">
          <h3 className="font-bold">{section.label}</h3>
          <p className="mt-2 whitespace-pre-wrap break-words leading-8">{section.text}</p>
        </div>)}
      </section>}
      {startMode === 'crisis' && firstCriticalAxis && <p className="rounded-2xl border border-[#C9A961]/40 bg-[#FBFAF6] px-5 py-4 font-bold leading-7" data-testid="crisis-lead">{formatPlatformCopy('result.crisisLead', { axis: firstCriticalAxis })}</p>}
      <ReportPreview clientReport={report.dual_layer.clientReport} />
      <ReportDetails clientReport={report.dual_layer.clientReport} report={report} axisScores={axisScores} axisDetails={axisDetails} />
      <div className="text-center">
        <Link to="/consultant" className="inline-flex items-center gap-2 text-sm font-bold text-[#526B7B] hover:text-[#0F172A]" data-testid="before-offers-consultant-link">قبل أن تختار عرضاً: من الذي سيقوده؟ تعرّف على أ/ أحمد <ArrowLeft size={15} /></Link>
      </div>
      <OfferCards recommended={{ key: recommendation.key, reason: recommendation.reason }} outcomes={outcomes} monthlyWaste={monthlyWaste} />
      <CostOfProblem />
      <section className="rounded-[1.7rem] bg-[#0F172A] p-6 text-[#FBFAF6] md:flex md:items-center md:justify-between md:gap-8 md:p-8" data-testid="consultant-cta">
        <div>
          <p className="text-xs font-bold text-[#DCC78D]">قبل أن تقرر</p>
          <h2 className="mt-1 font-display text-2xl font-bold">تعرّف على أ/ أحمد رمضان</h2>
          <p className="mt-2 text-sm leading-7 text-white/75">خبرته، مجالات عمله، وكيف يعمل مع أصحاب الأعمال.</p>
        </div>
        <Link to="/consultant" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A961] px-6 py-4 font-bold text-[#0F172A] hover:bg-[#DCC78D] md:mt-0 md:w-auto md:shrink-0"><UserRound size={18} /> تعرّف على المستشار</Link>
      </section>
      <ConsultantChat context={chatContext} />
      <p className="text-center text-xs leading-7 text-[#68717A]">التقرير قراءة أولية مبنية على إفصاحات الجلسة. لا يحل محل تدقيق الحسابات أو التحقق الميداني، ولا يضمن نتيجة مستقبلية.</p>
    </div>
  </main>;
}
