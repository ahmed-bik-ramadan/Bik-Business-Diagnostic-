import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { generateDiagnosticReport } from '../services/diagnose';
import { processingReviewRedirect } from '../services/reviewContent';
import { computeDeterministicScore } from '../services/deterministicScoring';

const MINIMUM_MS = 6000;
const PROGRESS_INTERVAL_MS = 50;
const DONE_TRANSITION_MS = 200;
const STAGES = [
  'قراءة إجاباتك',
  'حساب المحاور الستة',
  'ربط الأعراض بالأولويات',
  'تجهيز المعاينة'
];

type ProcessingState =
  | { status: 'loading'; progress: number }
  | { status: 'error'; message: string }
  | { status: 'done' };

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<ProcessingState>({ status: 'loading', progress: 0 });
  const { status } = state;

  useEffect(() => {
    if (status === 'done') {
      const timer = setTimeout(() => navigate('/lead-gate', { replace: true }), DONE_TRANSITION_MS);
      return () => clearTimeout(timer);
    }
    if (status !== 'loading') return;

    const store = useDiagnosticStore.getState();
    const redirect = processingReviewRedirect(store);
    if (redirect) {
      navigate(redirect, { replace: true });
      return;
    }

    let active = true;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    let progressLimit = 24;
    const progressTimer = setInterval(() => {
      const progress = Math.min(progressLimit, Math.floor((performance.now() - startedAt) / MINIMUM_MS * 100));
      setState(previous => previous.status === 'loading' && previous.progress !== progress
        ? { status: 'loading', progress } : previous);
    }, PROGRESS_INTERVAL_MS);

    async function runAnalysis() {
      try {
        store.markUnansweredQuestions?.();
        const current = useDiagnosticStore.getState();
        progressLimit = 49;
        const scores = computeDeterministicScore(
          Object.fromEntries(Object.entries(current.universalAnswers || {}).filter(([id]) => id !== 'u30')),
          current.intakeAnswers
        );
        progressLimit = 74;
        const report = await generateDiagnosticReport(current);
        if (!active) return;
        if (!report || !Number.isFinite(report.health_score)) {
          throw new Error('لا تتوافر نتيجة تشخيص صالحة للعرض.');
        }
        progressLimit = 99;

        const remaining = MINIMUM_MS - (performance.now() - startedAt);
        if (remaining > 0) await new Promise<void>(resolve => { finishTimer = setTimeout(resolve, remaining); });
        if (!active) return;

        const { setField } = current;
        setField('report', report);
        setField('instantScore', scores.overallComputed === false ? null : scores.overall);
        setField('axisScores', scores.axisScores);
        setField('axisDetails', scores.axisDetails);
        setField('overallConfidence', scores.overallConfidence);
        setField('overallCoverage', scores.overallCoverage);
        setField('dataGaps', scores.dataGaps);
        setState({ status: 'done' });
      } catch (err) {
        if (active) setState({ status: 'error', message: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء إعداد النتيجة.' });
      }
    }

    void runAnalysis();
    return () => {
      active = false;
      clearInterval(progressTimer);
      clearTimeout(finishTimer);
    };
  }, [status, navigate]);

  const progress = state.status === 'done' ? 100 : state.status === 'loading' ? state.progress : 0;
  const currentStage = Math.floor(progress / (100 / STAGES.length));

  return (
    <div className="min-h-screen bg-navy flex flex-col items-center justify-center p-6 rtl font-arabic relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 via-navy to-navy" />
      <div className="mb-12">
        <span className="text-[#C9A961] font-bold text-6xl tracking-wider font-display">BIK</span>
      </div>

      <div className="w-full max-w-md relative z-10">
        {state.status === 'error' ? (
          <div data-testid="processing-error" className="bg-slate-900 rounded-2xl border border-[#C9A961]/30 p-6 md:p-8 text-center shadow-xl">
            <div className="bg-[#C9A961]/10 text-[#C9A961] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#C9A961]/20">
              <AlertCircle size={32} aria-hidden="true" />
            </div>

            <h2 className="text-xl font-bold text-white mb-3 font-display">تعذّر إكمال التحليل</h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              تعذّر إكمال التحليل. حاول مرة أخرى، أو تواصل مع المستشار مباشرة.
            </p>

            <button
              type="button"
              onClick={() => setState({ status: 'loading', progress: 0 })}
              className="w-full bg-[#C9A961] hover:bg-[#E1C27B] text-[#0F172A] font-bold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <RefreshCw size={18} aria-hidden="true" />
              <span>حاول مرة أخرى</span>
            </button>

            {state.message && <p role="alert" className="mt-5 text-sm text-red-300 leading-7">{state.message}</p>}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-white text-center mb-8">
              <p id="processing-title" className="text-xl md:text-2xl font-medium font-display">جارٍ حساب القراءة من إجاباتك</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">يعالج محرك BIK داخل المتصفح الإجابات المتاحة لتوليد التقرير؛ ولا تُرسل هذه الإجابات إلى خادم BIK أو نموذج خارجي.</p>
            </div>
            <ol className="mb-6 space-y-3 text-right">
              {STAGES.map((stage, index) => (
                <li key={stage} aria-current={index === currentStage ? 'step' : undefined}
                  className={`flex items-center gap-3 ${index === currentStage ? 'text-[#C9A961] font-bold' : 'text-slate-300'}`}>
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-[#C9A961]/50" aria-hidden="true">
                    {index < currentStage && <Check size={16} className="text-[#C9A961]" />}
                  </span>
                  {stage}
                </li>
              ))}
            </ol>
            <div role="progressbar" aria-labelledby="processing-title" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
              className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
              <div className="bg-[#C9A961] h-full motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-linear" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Processing;
