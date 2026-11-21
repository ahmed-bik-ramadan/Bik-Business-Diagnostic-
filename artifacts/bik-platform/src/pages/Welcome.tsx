import React from 'react';
import { ArrowLeft, CheckCircle2, Compass, LockKeyhole, Sparkles, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { platformCopy } from '../copy/platformCopy';
import { useDiagnosticStore, type StartMode } from '../store/diagnosticStore';
import { startSession } from '../services/api';
import { clearBikStorage } from '../services/analysisRecovery';
import { buildWhatsAppReportParts } from '../services/reportTextDelivery';
import { readTransferProgress } from '../services/reportTransferState';

function resumeTarget(state: ReturnType<typeof useDiagnosticStore.getState>): string | null {
  try {
    if (state.report?.dual_layer) {
      const dossier = state.report.dual_layer.consultantDossier?.full_dossier_text || '';
      const parts = buildWhatsAppReportParts(dossier, state.sessionId);
      const progress = readTransferProgress(sessionStorage, state.sessionId, parts);
      if (parts.length > 0 && progress.currentIndex === parts.length) return '/report';
      if (sessionStorage.getItem(`bik-sharing-consent:${state.sessionId}`) === 'true') return '/report-transfer';
      return '/lead-gate';
    }
  } catch {
    return state.report ? '/lead-gate' : null;
  }
  const answered = Object.keys(state.universalAnswers || {}).length + Object.keys(state.sectorAnswers || {}).length;
  return answered > 0 ? '/questionnaire' : null;
}

export default function Welcome() {
  const navigate = useNavigate();
  const store = useDiagnosticStore();
  const resume = resumeTarget(store);

  const resetSession = () => {
    try {
      store.reset();
    } finally {
      clearBikStorage('localStorage');
      clearBikStorage('sessionStorage');
    }
  };

  const handleStart = (mode: StartMode) => {
    resetSession();
    store.setField('startMode', mode);
    startSession().then((sessionData) => {
      if (sessionData?.sessionId) useDiagnosticStore.getState().setField('sessionId', sessionData.sessionId);
    }).catch(() => undefined);
    navigate('/sector-select');
  };

  return (
    <main className="min-h-screen bg-[#F4F1E9] text-[#0F172A] rtl font-arabic overflow-hidden">
      <header className="max-w-7xl mx-auto px-5 md:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center font-black tracking-wider">BIK</div>
          <div><div className="font-bold tracking-wide text-[#0F172A]">BIK</div><div className="text-[11px] text-slate-500">تشخيص الأعمال ووضوح القرار</div></div>
        </div>
        <button onClick={() => navigate('/consultant')} className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-[#0F172A] hover:text-[#C9A961]">تعرّف على المستشار</button>
      </header>

      <section className="max-w-7xl mx-auto px-5 md:px-10 pt-8 md:pt-16 pb-20 grid lg:grid-cols-[1.15fr_.85fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-xs font-bold text-[#0F172A] shadow-sm mb-7">
            <Sparkles size={14} /> تشخيص عملي قبل اتخاذ القرار
          </div>
          <p className="text-sm font-bold text-[#C9A961] mb-3">بإشراف أ/ أحمد رمضان — مستشار تطوير وحلول الأعمال</p>
          <h1 className="text-4xl md:text-6xl font-black leading-[1.18] tracking-tight max-w-3xl text-[#0F172A]">قبل أن تصرف أموالك لزيادة المبيعات… <span className="text-[#C9A961]">اعرف أين تختنق أرباحك.</span></h1>
          <p className="mt-7 text-lg md:text-xl text-slate-600 leading-loose max-w-2xl">BIK هي عينك الثالثة؛ ترى ما يغيب عنك وسط انشغالك اليومي: أين تختنق أرباح شركتك، ولماذا، وماذا يكلّفك تجاهل ذلك. ويمكنك إرسال التقرير إلى أ/ أحمد رمضان عبر واتساب لمناقشته في المكالمة.</p>
          {resume && <button onClick={() => navigate(resume)} className="mt-9 w-full sm:w-auto rounded-2xl border-2 border-[#C9A961] bg-white px-7 py-4 font-bold text-[#0F172A] hover:bg-[#F6F0DF]" data-testid="resume-session">تابع جلستك من حيث توقفت</button>}
          <button type="button" className="mt-4 block min-h-11 text-sm font-bold underline" onClick={() => { resetSession(); window.location.reload(); }}>ابدأ من جديد</button>
          <div className={resume ? 'mt-4' : 'mt-9'}>
            <h2 className="mb-3 text-xl font-bold">{platformCopy['start.title']}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" data-testid="start-analysis" onClick={() => handleStart('analysis')} className="group min-h-14 rounded-2xl bg-[#0F172A] px-5 py-4 text-right text-white shadow-lg shadow-slate-900/15 transition-colors hover:bg-[#1E293B]">
                <span className="flex items-center justify-between gap-3 text-lg font-bold">{platformCopy['start.analysis.title']} <ArrowLeft size={20} className="shrink-0" /></span>
                <span className="mt-2 block text-sm font-normal leading-7 text-white/80">{platformCopy['start.analysis.body']}</span>
              </button>
              <button type="button" data-testid="start-crisis" onClick={() => handleStart('crisis')} className="group min-h-14 rounded-2xl border-2 border-[#C9A961] bg-white px-5 py-4 text-right text-[#0F172A] shadow-sm transition-colors hover:bg-[#F6F0DF]">
                <span className="flex items-center justify-between gap-3 text-lg font-bold">{platformCopy['start.crisis.title']} <ArrowLeft size={20} className="shrink-0" /></span>
                <span className="mt-2 block text-sm font-normal leading-7 text-slate-600">{platformCopy['start.crisis.body']}</span>
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">{platformCopy['start.note']}</p>
            <span className="mt-3 block text-xs text-slate-500 leading-relaxed">معاينة لأولوياتك، والتقرير الكامل يُجهّز لك نصياً عبر واتساب.</span>
          </div>
        </div>

        <div className="relative">
          <div className="relative bg-[#0F172A] rounded-[2rem] p-6 md:p-8 text-white shadow-2xl overflow-hidden">
            <div className="absolute -left-16 -top-16 w-48 h-48 border border-[#C9A961]/40 rounded-full" />
            <div className="absolute -left-5 -top-5 w-28 h-28 border border-[#C9A961]/30 rounded-full" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between"><span className="text-xs text-slate-300">كيف يبدأ التشخيص؟</span><span className="text-[#C9A961] text-xs font-bold">BIK / 01</span></div>
              <div className="space-y-4">
                <div className="bg-white/10 rounded-2xl p-4 flex gap-3"><Compass className="text-[#C9A961] shrink-0" size={22} /><div><div className="font-bold mb-1">فهم نشاطك</div><div className="text-xs text-slate-300 leading-relaxed">القطاع، المرحلة، نموذج الإيراد والسوق.</div></div></div>
                <div className="bg-white/10 rounded-2xl p-4 flex gap-3"><Target className="text-[#C9A961] shrink-0" size={22} /><div><div className="font-bold mb-1">قراءة الإشارات</div><div className="text-xs text-slate-300 leading-relaxed">إجاباتك، الفجوات، وما يحتاج إلى تحقق قبل القرار.</div></div></div>
                <div className="bg-white/10 rounded-2xl p-4 flex gap-3"><Sparkles className="text-[#C9A961] shrink-0" size={22} /><div><div className="font-bold mb-1">الحسم مع أ/ أحمد</div><div className="text-xs text-slate-300 leading-relaxed">15 دقيقة مجانية لمناقشة نتيجتك وتحديد الخطوة الأولى المناسبة.</div></div></div>
              </div>
              <div className="border-t border-white/10 pt-5 text-xs text-slate-400 leading-relaxed">النتيجة إرشادية مبنية على إجاباتك، وليست تدقيقاً مالياً أو وعداً بنتائج مستقبلية.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white/60">
        <div className="max-w-7xl mx-auto px-5 md:px-10 py-8 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <p className="text-sm text-slate-600">تبدأ بمعاينة مفيدة، ثم تقرر إن كنت تريد تجهيز التقرير التفصيلي لمحادثتك مع أ/ أحمد.</p>
          <span className="flex items-center gap-2 text-xs font-bold text-[#C9A961]"><LockKeyhole size={14} /> تُعالج إجابات التشخيص في متصفحك ولا تُرسل إلى خادم BIK لتوليد التقرير.</span>
          <span className="flex items-center gap-2 text-xs font-bold text-[#C9A961]"><CheckCircle2 size={14} /> نربط كل استنتاج بالإجابات التي بُني عليها.</span>
          <span className="w-full text-xs text-slate-500">النتائج إرشادية تُقرأ على ضوء أرقامك، ولا تُعدّ وعداً بنتيجة.</span>
        </div>
      </section>
    </main>
  );
}
