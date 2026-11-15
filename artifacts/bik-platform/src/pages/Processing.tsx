import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { generateDiagnosticReport } from '../services/diagnose';
import { processingReviewRedirect } from '../services/reviewContent';
import { computeDeterministicScore } from '../services/deterministicScoring';

const Processing: React.FC = () => {
  const navigate = useNavigate();
  const store = useDiagnosticStore();
  const { setField } = store;
  const [error, setError] = useState<Error | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  const runAnalysis = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      if (typeof store.markUnansweredQuestions === 'function') {
        store.markUnansweredQuestions();
      }

      const report = await generateDiagnosticReport(store);
      if (!report || !Number.isFinite(report.health_score)) {
        throw new Error('لا تتوافر نتيجة تشخيص صالحة للعرض.');
      }
      const scores = computeDeterministicScore(
        Object.fromEntries(Object.entries(store.universalAnswers || {}).filter(([id]) => id !== 'u30')),
        store.intakeAnswers
      );
      setField('report', report);
      setField('instantScore', scores.overallComputed === false ? null : scores.overall);
      setField('axisScores', scores.axisScores);
      setField('axisDetails', scores.axisDetails);
      setField('overallConfidence', scores.overallConfidence);
      setField('overallCoverage', scores.overallCoverage);
      setField('dataGaps', scores.dataGaps);
      setIsGenerating(false);
      navigate('/lead-gate', { replace: true });
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error('حدث خطأ غير متوقع أثناء إعداد النتيجة.'));
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const redirect = processingReviewRedirect(store);
    if (redirect) { navigate(redirect, { replace: true }); return; }
    runAnalysis();
    // Clean up on unmount
    return () => {
      // We can't clear intervals here directly unless we store them in refs,
      // but runAnalysis cleans them up on success or catch.
    };
  }, []);

  return (
    <div className="min-h-screen bg-navy flex flex-col items-center justify-center p-6 rtl font-arabic relative overflow-hidden">
      
      {/* Background static decoration */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 via-navy to-navy" />

      <motion.div
        animate={isGenerating ? { scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] } : {}}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="mb-12"
      >
        <span className="text-luxury-accent font-bold text-6xl tracking-wider font-display">BIK</span>
      </motion.div>

      <div className="w-full max-w-md relative z-10">
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div
              key="loading-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-white text-center mb-8">
                <LoaderCircle className="mx-auto mb-5 animate-spin text-luxury-accent" size={34} aria-hidden="true" />
                <p className="text-xl md:text-2xl font-medium font-display">جارٍ حساب القراءة من إجاباتك</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">يعالج محرك BIK داخل المتصفح الإجابات المتاحة لتوليد التقرير؛ ولا تُرسل هذه الإجابات إلى خادم BIK أو نموذج خارجي.</p>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                <div className="bg-luxury-accent h-full w-full animate-pulse" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="error-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-slate-900 rounded-2xl border border-luxury-accent/30 p-6 md:p-8 text-center shadow-xl"
            >
              <div className="bg-luxury-accent/10 text-luxury-accent w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-luxury-accent/20">
                <AlertCircle size={32} />
              </div>

              <h2 className="text-xl font-bold text-white mb-3 font-display">تعذّر إكمال التحليل</h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-6">
                تعذّر إكمال التحليل. حاول مرة أخرى، أو تواصل مع المستشار مباشرة.
              </p>

              <div className="space-y-3">
                <button
                  onClick={runAnalysis}
                  disabled={isGenerating}
                  className="w-full bg-luxury-accent hover:bg-luxury-accent-hover text-white font-bold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={18} />
                  <span>حاول مرة أخرى</span>
                </button>

              </div>

              {error && <p role="alert" className="mt-5 text-sm text-red-300 leading-7">{error.message}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Processing;
