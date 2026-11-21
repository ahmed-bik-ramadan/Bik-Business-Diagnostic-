import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { LockedPreview } from '../components/LockedPreview';
import { DIAGNOSTIC_DIMENSIONS } from '../services/deterministicScoring';
import { buildDualLayerReport } from '../services/dualLayerReport';
import { buildWhatsAppReportParts } from '../services/reportTextDelivery';
import { isTransferDone } from '../services/reportTransferState';
import { NATIONAL_NUMBER_EXAMPLES, normalizePhoneNumber, sanitizeNationalInput, splitPhoneForForm } from '../services/phoneNormalization';

const countryCodes = [
  ['مصر', '+20'], ['السعودية', '+966'], ['الإمارات', '+971'], ['الكويت', '+965'],
  ['قطر', '+974'], ['البحرين', '+973'], ['الأردن', '+962'], ['المغرب', '+212'],
  ['تونس', '+216'], ['دولة أخرى', '+00']
];

function readSharingConsent(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(`bik-sharing-consent:${sessionId}`) === 'true';
  } catch {
    return false;
  }
}

export default function LeadGate() {
  const navigate = useNavigate();
  const { sessionId, report, userName, companyName, whatsapp, setField, questionHistory } = useDiagnosticStore();
  const initialPhone = splitPhoneForForm(whatsapp || '', countryCodes.map(([, dial]) => dial));
  const [name, setName] = useState(userName || '');
  const [business, setBusiness] = useState(companyName || '');
  const [code, setCode] = useState(initialPhone.dialCode);
  const [digits, setDigits] = useState(initialPhone.nationalNumber);
  const [hasExistingConsent, setHasExistingConsent] = useState(() => readSharingConsent(sessionId));
  const [consent, setConsent] = useState(() => readSharingConsent(sessionId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!report) navigate('/processing', { replace: true });
  }, [report, navigate]);

  if (!report?.dual_layer) {
    return <main className="min-h-[100dvh] grid place-items-center bg-[#F4F1E9] p-6" dir="rtl"><p role="status">تجري استعادة المعاينة التشخيصية…</p></main>;
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !business.trim()) return setError('أكمل الاسم واسم النشاط للمتابعة.');
    const fullWhatsapp = normalizePhoneNumber(code, digits);
    if (!fullWhatsapp) return setError(code === '+00'
      ? 'اختر رمز الدولة، أو أدخل الرقم الدولي كاملاً مع علامة +.'
      : 'أدخل رقم واتساب صحيحاً من 7 إلى 15 رقماً.');
    if (!consent) return setError('يلزم تأكيد موافقتك الصريحة قبل تجهيز مشاركة التقرير.');
    // بعد اكتمال الإرسال لا تُعاد الموافقة ولا تُكتب أي نسخ جديدة: علامة الاكتمال هي إثبات
    // النهاية، والتحليل الكامل يُفتح منها مباشرة، فلا تعود أي نسخة إلى التخزين بعد المحو.
    try {
      if (isTransferDone(sessionStorage, sessionId, buildWhatsAppReportParts(report.dual_layer?.consultantDossier?.full_dossier_text || '', sessionId))) {
        navigate('/report', { replace: true });
        return;
      }
    } catch { /* فحص احترازي: من تعذّره نكمل المسار الأصلي */ }
    const current = useDiagnosticStore.getState();
    const identityChanged = current.userName !== name.trim()
      || current.companyName !== business.trim()
      || current.whatsapp !== fullWhatsapp;
    try {
      sessionStorage.setItem(`bik-sharing-consent:${sessionId}`, 'true');
      if (identityChanged) {
        sessionStorage.removeItem(`bik-transfer-acks:${sessionId}`);
        sessionStorage.removeItem(`bik-report-unlocked:${sessionId}`);
      }
    } catch {
      setError('تعذر حفظ الموافقة في جلسة المتصفح. أعد المحاولة مع إتاحة تخزين الجلسة.');
      return;
    }
    setHasExistingConsent(true);
    let nextReport = report;
    if (identityChanged) {
      const { u30: _reflectiveOnly, ...scoredAnswers } = current.universalAnswers || {};
      const dualLayer = buildDualLayerReport({
        review: current.review,
        scoreResult: {
          overall: report.health_score,
          overallScore: report.health_score,
          overallCoverage: report.coverage ?? current.overallCoverage ?? 0,
          overallConfidence: report.confidence || current.overallConfidence || 'متوسط',
          axisScores: current.axisScores || {},
          axisDetails: current.axisDetails || {},
          topStrengths: report.evidence?.filter(item => item.signal === 'positive') || [],
          topWeaknesses: report.evidence?.filter(item => item.signal === 'negative') || [],
          dataGaps: current.dataGaps || [],
          financialImpact: report.financial_impact || { isComputable: false, metrics: {}, currency: 'EGP', scenarios: [] },
          diagnosticFindings: report.diagnostic_findings || {},
          engineMetadata: report.engine_metadata || {}
        } as any,
        companyData: { userName: name.trim(), companyName: business.trim(), sectorL1: current.sectorL1, sectorL2: current.sectorL2, whatsapp: fullWhatsapp },
        intakeAnswers: current.intakeAnswers || {},
        universalAnswers: scoredAnswers,
        sectorAnswers: current.sectorAnswers || {},
        baseReport: report,
        questionHistory: current.questionHistory,
        sessionId,
        diagnosticDepth: current.diagnosticDepth
      });
      nextReport = { ...report, dual_layer: dualLayer };
    }
    setField('report', nextReport);
    setField('userName', name.trim());
    setField('companyName', business.trim());
    setField('whatsapp', fullWhatsapp);
    navigate('/report-transfer');
  };

  return (
    <main className="min-h-[100dvh] bg-[#F4F1E9] text-[#0F172A] pb-16" dir="rtl" lang="ar">
      <header className="border-b border-[#0F172A]/10 bg-[#FBFAF6]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <span className="font-display text-xl font-bold tracking-wide">BIK <span className="text-[#C9A961]">/</span> قراءة أولية</span>
          <span className="text-xs text-[#68717A]">الخطوة الأخيرة قبل المشاركة الاختيارية</span>
        </div>
      </header>
      <div className="page-enter mx-auto max-w-5xl space-y-5 px-4 py-8 md:px-8 md:py-12">
        <button type="button" onClick={() => navigate('/questionnaire')} className="inline-flex items-center gap-2 text-sm font-bold text-[#526B7B] hover:text-[#0F172A]" data-testid="back-to-questionnaire"><ArrowRight size={16} /> رجوع لتعديل إجاباتي</button>
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.16em] text-[#8B7135]">معاينة قبل القرار</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">تشخيصك جاهز. بقيت خطوة واحدة لفتحه</h1>
          <p className="mt-3 leading-8 text-[#68717A]">ما رأيته حتى الآن هو غرفة الانتظار، والتقرير الكامل ينتظر خلف الباب: الأصل الجذري للمشكلة، وكلفة الوضع الحالي بحسب أرقامك، وأول خطوة تستحق أن تُدار. وهو تقرير لا يُستعار: يبقى لديك في محادثة واتساب، ترجع إليه كلما تحركت شركتك. وفي مكالمتكما، يقرأه أ/ أحمد قبل المكالمة، فيمضي وقتك كله في شركتك لا في التعارف.</p>
        </div>
        <LockedPreview
          questionCount={(questionHistory || []).filter(entry => entry.status === 'answered' || entry.status === 'skipped').length}
          axisCount={Object.keys(DIAGNOSTIC_DIMENSIONS).length}
        />
        <section className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 shadow-[0_18px_60px_rgba(15,23,42,.06)] md:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 shrink-0 text-[#92763D]" size={23} />
            <div>
              <h2 className="font-display text-2xl font-bold">خطوتك الأخيرة: بيانات تفتح الباب</h2>
              <p className="mt-2 text-sm leading-7 text-[#68717A]">هذه البيانات تبقى في متصفحك ولا يستقبلها خادم BIK؛ وتُضاف إلى رسالة واتساب التي ترسلها أنت إلى أ/ أحمد.</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-[#C9A961]/40 bg-[#F6F0DF] p-4">
            <p className="text-sm font-bold text-[#0F172A]">كيف تعمل الخطوة</p>
            <ol className="mt-2 space-y-2 text-sm leading-7 text-[#26354E]">
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#92763D]/15 text-[11px] font-bold text-[#6B5620]" aria-hidden="true">1</span>تُجهَّز أجزاء تقريرك، جاهزة للإرسال من جهازك أنت لا من هنا.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#92763D]/15 text-[11px] font-bold text-[#6B5620]" aria-hidden="true">2</span>تفتح واتساب وترسلها بنفسك إلى أ/ أحمد، جزءاً جزءاً.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#92763D]/15 text-[11px] font-bold text-[#6B5620]" aria-hidden="true">3</span>حين يكتمل الإرسال يُفتح لك التحليل الكامل على المنصة.</li>
            </ol>
          </div>
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold">الاسم
                <input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[#0F172A]/15 bg-white px-4 py-3 font-normal focus:border-[#C9A961]" />
              </label>
              <label className="block text-sm font-semibold">اسم الشركة أو النشاط
                <input required value={business} onChange={e => setBusiness(e.target.value)} className="mt-2 w-full rounded-xl border border-[#0F172A]/15 bg-white px-4 py-3 font-normal focus:border-[#C9A961]" />
              </label>
            </div>
            <label className="block text-sm font-semibold">رقم واتساب
              <span className="mt-2 flex gap-2">
                <select aria-label="رمز الدولة" value={code} onChange={e => { setCode(e.target.value); setDigits(current => sanitizeNationalInput(e.target.value, current)); }} className="max-w-[48%] rounded-xl border border-[#0F172A]/15 bg-white px-3 py-3 text-sm">
                  {countryCodes.map(([country, dial]) => <option key={dial} value={dial}>{country} ({dial})</option>)}
                </select>
                <input aria-label="رقم الهاتف" required inputMode="tel" autoComplete="tel-national" dir="ltr" value={digits}  onChange={e => setDigits(sanitizeNationalInput(code, e.target.value))} placeholder={NATIONAL_NUMBER_EXAMPLES[code] || '+4412345678'} className="min-w-0 flex-1 rounded-xl border border-[#0F172A]/15 bg-white px-4 py-3 text-left font-mono font-normal" />
              </span>
              <span className="mt-1.5 block text-xs font-normal text-[#68717A]">{code === '+00' ? 'اكتب الرقم الدولي كاملاً مع علامة +.' : 'اكتب الرقم بدون الصفر الأول.'}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#C9A961]/40 bg-[#F6F0DF] p-4 text-sm leading-7">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#0F172A]" />
              <span>أوافق صراحةً على تجهيز التقرير وإتاحة فتح أجزائه في واتساب كي أشاركها بنفسي مع المستشار. أفهم أن فتح واتساب لا يرسل الرسالة تلقائياً، وأن BIK لا يؤكد الإرسال أو الاستلام.</span>
            </label>
            {error && <p role="alert" className="text-sm font-semibold text-[#8A3F32]">{error}</p>}
              <button type="submit" disabled={!consent} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-4 font-bold text-white transition hover:bg-[#26354E] disabled:cursor-not-allowed disabled:opacity-50 md:w-auto">
              {hasExistingConsent ? 'متابعة الجزء الذي توقفت عنده' : 'متابعة إلى تجهيز التقرير'} <ArrowLeft size={18} />
            </button>
          </form>
          <p className="mt-5 flex items-center gap-2 border-t border-[#0F172A]/10 pt-4 text-xs leading-6 text-[#68717A]"><LockKeyhole size={14} /> تبقى إجاباتك في متصفحك أثناء الجلسة وتُمحى بإغلاق الصفحة، وما تُرسله يبقى في محادثة واتساب بينك وبين أحمد. لا تُرسل أرقام حسابات بنكية أو بيانات بطاقات.</p>
        </section>
      </div>
    </main>
  );
}
