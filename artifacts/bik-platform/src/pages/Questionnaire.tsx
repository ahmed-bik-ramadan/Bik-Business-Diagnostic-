import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Clock } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { universalQuestions } from '../data/universalQuestions';
import { sectorQuestions } from '../data/sectorQuestions';
import { DEEP_TIER_QUESTIONS } from '../data/sectorFinancialTaxonomy';
import { deltaQuestions } from '../data/deltaQuestions';
import { toastMessages } from '../data/toastMessages';
import { dialectForCountry, questionnaireCopy, DIALECT_COUNTRY_OPTIONS, DIALECT_NAMES, readStoredCountry, writeStoredCountry } from '../services/dialect';
import { saveProgress, trackEvent } from '../services/supabase';
import { getNextAdaptiveQuestion } from '../services/adaptiveDiagnosticEngine';
import { normalizeMultiChoice, validateQuestionAnswer } from '../services/questionAnswerValidation';
import { emptyReviewState } from '../services/reviewState';
import type { QuestionDefinition, NextQuestionResult } from '../types/adaptiveDiagnostic';

// Reusing the UniversalQuestion type
import type { UniversalQuestion } from '../data/universalQuestions';

const Questionnaire: React.FC = () => {
  const navigate = useNavigate();
  const { 
    sessionId, 
    sectorL1, 
    sectorL2, 
    userName, 
    universalAnswers, 
    sectorAnswers,
    diagnosticDepth,
    setField,
    recordQuestionShown,
    recordQuestionAnswered,
    markUnansweredQuestions,
    undoLastAnswer
  } = useDiagnosticStore();

  const [toast, setToast] = useState<{ text: string, id: number } | null>(null);
  const [country, setCountryState] = useState<string>(() => readStoredCountry(sessionStorage));
  const dialect = dialectForCountry(country);
  const copy = questionnaireCopy(dialect);
  const selectCountry = (next: string) => { setCountryState(next); writeStoredCountry(sessionStorage, next); };
  const [currentValue, setCurrentValue] = useState<any>(null);
  const [answeredCount, setAnsweredCount] = useState<number>(0);
  const [adaptiveStep, setAdaptiveStep] = useState<NextQuestionResult | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(1);
  const lastRecordedQuestionIdRef = useRef<string | null>(null);
  const singleSelectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once the client has answered something in THIS visit. A complete session found on arrival
  // (he came back from a later page) is reopened for editing instead of being pushed forward again.
  const answeredThisVisitRef = useRef(false);

  // Combine answers
  const combinedAnswers = React.useMemo(() => {
    return { ...universalAnswers, ...sectorAnswers };
  }, [universalAnswers, sectorAnswers]);

  // Compute current adaptive question whenever combinedAnswers or depth changes
  useEffect(() => {
    const nextStep = getNextAdaptiveQuestion({
      sessionId,
      sectorL1,
      sectorL2,
      diagnosticDepth: diagnosticDepth as any,
      answers: combinedAnswers
    });

    setAdaptiveStep(nextStep);
    setAnsweredCount(Object.keys(combinedAnswers).length);

    if ((nextStep.isComplete || !nextStep.question) && !answeredThisVisitRef.current) {
      // Arrived on a finished questionnaire (back navigation): reopen the last question for editing.
      lastRecordedQuestionIdRef.current = null;
      undoLastAnswer();
      return;
    }

    if (nextStep.isComplete || !nextStep.question) {
      // Mark any shown questions that remained unanswered before finalizing
      markUnansweredQuestions();

      // Save locally, then review the visitor’s reading before processing.
      trackEvent(sessionId, 'diagnostic_completed', { answeredCount: Object.keys(combinedAnswers).length, depth: diagnosticDepth }).catch(() => undefined);
      saveProgress(sessionId, {
        universal_answers: universalAnswers,
        sector_answers: sectorAnswers,
        completion_pct: 100
      }).catch((e) => console.error("Final non-blocking saveProgress error:", e));

      sessionStorage.removeItem('bik_universal_answers');
      sessionStorage.removeItem('bik_sector_answers');
      sessionStorage.removeItem('bik_questionnaire_current_index');

      setField('review', { ...emptyReviewState(), questionnaireComplete: true });
      navigate('/review/1');
    }
  }, [combinedAnswers, sectorL1, sectorL2, diagnosticDepth, sessionId, navigate, markUnansweredQuestions, undoLastAnswer]);

  const question = adaptiveStep?.question;
  const diagnosticMessage = adaptiveStep?.diagnosticMessage;
  const progressPct = adaptiveStep?.progress?.overallCoverage || Math.min(100, Math.round((answeredCount / 35) * 100));

  // Canonical session ledger: record question when it becomes active/shown
  useEffect(() => {
    if (question && question.id && question.id !== lastRecordedQuestionIdRef.current) {
      lastRecordedQuestionIdRef.current = question.id;
      recordQuestionShown({
        id: question.id,
        question: (question as any).question || (question as any).label || (question as any).text || question.id,
        dimension: question.dimension,
        diagnosticRole: question.diagnosticRole
      });
      trackEvent(sessionId, 'question_shown', { position: answeredCount + 1, depth: diagnosticDepth }).catch(() => undefined);
    }
  }, [question, recordQuestionShown]);

  // Restore answers from sessionStorage on mount as a recovery safety net
  useEffect(() => {
    const storedUniversal = sessionStorage.getItem('bik_universal_answers');
    const storedSector = sessionStorage.getItem('bik_sector_answers');

    if (storedUniversal) {
      try {
        const parsed = JSON.parse(storedUniversal);
        setField('universalAnswers', parsed);
        setField('universalProgress', Math.round((Object.keys(parsed).length / universalQuestions.length) * 100));
      } catch (e) {
        console.error("Failed to parse stored universal answers", e);
      }
    }

    if (storedSector) {
      try {
        const parsed = JSON.parse(storedSector);
        setField('sectorAnswers', parsed);
        setField('sectorProgress', Math.round((Object.keys(parsed).length / 15) * 100));
      } catch (e) {
        console.error("Failed to parse stored sector answers", e);
      }
    }
  }, [setField]);

  // Back (browser/phone button or the on-screen button) goes to the previous question.
  // Nothing is lost: answers live in the session store, and the first question leads back to the intake.
  const goPrevious = () => {
    if (isAdvancing) return;
    if (singleSelectTimerRef.current) clearTimeout(singleSelectTimerRef.current);
    answeredThisVisitRef.current = true;
    lastRecordedQuestionIdRef.current = null;
    setTransitionDirection(-1);
    if (undoLastAnswer() === null) navigate('/company-intake', { replace: true });
  };
  const goPreviousRef = useRef(goPrevious);
  goPreviousRef.current = goPrevious;

  useEffect(() => {
    // One guard entry on top of the questionnaire so the system back gesture is handled here.
    window.history.pushState({ isBlocking: true }, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState({ isBlocking: true }, '', window.location.href);
      goPreviousRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    trackEvent(sessionId, 'page_view', { page: 'questionnaire' }).catch(console.error);
    window.scrollTo(0, 0);
  }, [sessionId]);

  useEffect(() => {
    // Reset currentValue when question changes
    if (question) {
      setIsAdvancing(false);
      if (question.type === 'slider') {
        setCurrentValue(question.min || 0);
      } else if (question.type === 'multi_choice') {
        setCurrentValue([]);
      } else {
        setCurrentValue('');
      }
    }
  }, [question]);

  useEffect(() => () => {
    if (singleSelectTimerRef.current) clearTimeout(singleSelectTimerRef.current);
  }, []);

  const showToast = (key: string) => {
    const msg = toastMessages[key];
    if (msg) {
      const id = Date.now();
      setToast({ text: msg.text, id });
      setTimeout(() => {
        setToast(current => current?.id === id ? null : current);
      }, 3000);
    }
  };

  const handleNext = async (answer: any) => {
    if (!question) return;

    const validation = validateQuestionAnswer(question, answer);
    if (!validation.valid) {
      const id = Date.now();
      const message = validation.reason === 'invalid_option'
        ? 'اختر إجابة من الخيارات الظاهرة للمتابعة.'
        : validation.reason === 'invalid_number' || validation.reason === 'out_of_range'
          ? 'أدخل رقماً صالحاً داخل النطاق الموضح.'
          : validation.reason === 'conflicting_options'
            ? 'اختر «لم أجرب شيئاً» وحدها، أو اختر ما ينطبق دون جمع الخيارين.'
            : 'اكتب إجابة مفهومة أو اختر «لا أعرف» للمتابعة دون تخمين.';
      setToast({ text: message, id });
      setIsAdvancing(false);
      return;
    }

    // Resolve human-readable answerText for canonical ledger
    let answerText = '';
    const labelledUnknown = answer === 'unknown'
      ? question.options?.find((o: any) => String(o.value) === 'unknown')
      : undefined;
    if (labelledUnknown) {
      // A choice question that offers its own "unknown" option keeps that option's wording.
      answerText = labelledUnknown.label;
    } else if (answer === 'unknown') {
      answerText = 'لا أملك هذا الرقم بدقة حالياً (تخطي)';
    } else if (question.type === 'single_choice' || (question as any).type === 'single') {
      const opt = question.options?.find((o: any) => String(o.value) === String(answer));
      answerText = opt ? opt.label : String(answer);
    } else if (question.type === 'multi_choice' || (question as any).type === 'multi') {
      if (Array.isArray(answer)) {
        const labels = answer.map((val: any) => {
          const opt = question.options?.find((o: any) => String(o.value) === String(val));
          return opt ? opt.label : String(val);
        });
        answerText = labels.join('، ');
      } else {
        answerText = String(answer);
      }
    } else if (question.type === 'slider' || (question as any).type === 'percentage') {
      answerText = `${answer}${question.unit ? ' ' + question.unit : ''}`;
    } else if (question.type === 'number') {
      const opt = question.options?.find((o: any) => String(o.value) === String(answer));
      if (opt) {
        answerText = opt.label;
      } else {
        answerText = `${answer}${question.unit ? ' ' + question.unit : ''}`;
      }
    } else {
      answerText = String(answer ?? '');
    }

    answeredThisVisitRef.current = true;
    // Record in canonical questionHistory ledger
    recordQuestionAnswered(question.id, answer, answerText);
    trackEvent(sessionId, 'answer_saved', { position: answeredCount + 1, answerType: question.type }).catch(() => undefined);

    const isUniversal = question.id.startsWith('u');
    if (isUniversal) {
      const newAnswers = { ...universalAnswers, [question.id]: answer };
      setField('universalAnswers', newAnswers);
      
      // Save to sessionStorage immediately after entry
      sessionStorage.setItem('bik_universal_answers', JSON.stringify(newAnswers));

      if (Object.keys(newAnswers).length >= 25) {
        try {
          const { computeInstantScore } = await import('../services/deterministicScoring');
          const scoreResult = computeInstantScore(newAnswers);
          setField('instantScore', scoreResult.overallComputed === false ? null : scoreResult.overall);
          setField('axisScores', scoreResult.axisScores);
          setField('axisDetails', scoreResult.axisDetails);
          setField('overallConfidence', scoreResult.overallConfidence);
          setField('overallCoverage', scoreResult.overallCoverage);
          setField('dataGaps', scoreResult.dataGaps);
        } catch (e) {
          console.error("Error computing deterministic score:", e);
        }
      }
    } else {
      const newAnswers = { ...sectorAnswers, [question.id]: answer };
      setField('sectorAnswers', newAnswers);

      // Save to sessionStorage immediately after entry
      sessionStorage.setItem('bik_sector_answers', JSON.stringify(newAnswers));
    }

    if (question.toastKey) {
      showToast(question.toastKey);
    }

    // Save to supabase every 5 questions non-blocking
    if ((answeredCount + 1) % 5 === 0) {
      saveProgress(sessionId, {
        universal_answers: isUniversal ? { ...universalAnswers, [question.id]: answer } : universalAnswers,
        sector_answers: isUniversal ? sectorAnswers : { ...sectorAnswers, [question.id]: answer }
      }).catch((e) => {
        console.error("Non-blocking saveProgress error:", e);
      });
    }
  };

  const handleSingleSelect = (val: string) => {
    if (isAdvancing) return;
    setCurrentValue(val);
    setTransitionDirection(1);
    setIsAdvancing(true);
    singleSelectTimerRef.current = setTimeout(() => {
      handleNext(val);
    }, 240);
  };

  const submitAnswer = async (answer: any) => {
    if (isAdvancing) return;
    setTransitionDirection(1);
    setIsAdvancing(true);
    await handleNext(answer);
  };

  const toggleMultiSelect = (val: string) => {
    if (isAdvancing) return;
    setCurrentValue((prev: string[]) => normalizeMultiChoice(val, prev));
  };

  if (!question) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 rtl font-arabic relative overflow-hidden">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-0 left-0 right-0 z-[9999] p-4 flex justify-center pointer-events-none"
          >
            <div className="bg-white text-text-dark text-sm md:text-base px-6 py-4 rounded-xl shadow-lg max-w-2xl w-full text-center font-medium border-b-4 border-luxury-accent">
              {toast.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar / Progress */}
      <div className="questionnaire-topbar bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 p-4">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-[#64748B]">{copy.stageLabel} <span className="text-luxury-accent">01</span></span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500" title={copy.chipHint}>
                <span>{copy.chipLabel}</span>
                <select
                  value={country}
                  onChange={(e) => selectCountry(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 focus:border-luxury-accent focus:outline-none"
                  data-testid="dialect-country-select"
                  aria-label="اختر بلدك لنخاطبك بأسلوبه"
                >
                  <option value="">اختر بلدك…</option>
                  {DIALECT_COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="rounded-md bg-[#F6F0DF] px-2 py-0.5 font-bold text-[#8B7135]">{DIALECT_NAMES[dialect]}</span>
              </label>
              <span className="text-sm font-bold text-luxury-accent">{progressPct}% {copy.completedSuffix}</span>
            </div>
          </div>
          <div className="w-full bg-[#E2E8F0] h-2.5 rounded-full overflow-hidden flex flex-row-reverse" aria-label={`التقدم ${progressPct}%`} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div 
              className="questionnaire-progress-fill bg-luxury-accent h-full rounded-full"
              style={{ width: `${progressPct}%` }}
            ></div>
          </div>
          
          <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm text-slate-600 font-medium">
              البُعد: <span className="text-slate-900">{question.dimension}</span>
            </div>

            {diagnosticMessage && (
              <div className="bg-amber-50 text-amber-900 border border-amber-200/60 px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>{diagnosticMessage}</span>
              </div>
            )}

            <div className="flex items-center gap-1 text-slate-500 text-sm">
              <Clock size={14} />
              <span>{copy.remaining(Math.max(1, Math.ceil((35 - answeredCount) * (8 / 42))))}</span>
            </div>
          </div>

        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto w-full p-4 mt-8 flex flex-col items-center">
        <div className="w-full max-w-[600px] flex items-center justify-between mb-4 px-1 text-xs text-slate-500">
          <button type="button" onClick={goPrevious} disabled={isAdvancing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" data-testid="previous-question"><ArrowRight size={14} /> {copy.previous}</button>
          <span>{answeredCount + 1} {copy.questionOf}</span>
        </div>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            initial={{ opacity: 0, x: transitionDirection * -42, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: transitionDirection * 42, scale: 0.985 }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
            className="questionnaire-card w-full max-w-[600px] bg-white rounded-3xl shadow-[0_18px_55px_rgba(15,38,61,0.08)] border border-slate-200/80 p-6 md:p-8"
          >
            <span className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">
              السؤال {answeredCount + 1}
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-text-dark mb-8 leading-relaxed tracking-[-0.01em]">
              {question.question}
            </h2>

            <div className="h-px bg-slate-100 mb-6" />

            <div className="space-y-4">
              
              {/* SINGLE CHOICE */}
              {question.type === 'single_choice' && question.options?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSingleSelect(opt.value)}
                  disabled={isAdvancing}
                  className={`w-full text-right p-4 rounded-xl border-2 transition-colors flex justify-between items-center
                    ${currentValue === opt.value 
                      ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent' 
                      : 'border-slate-200 text-slate-700 hover:border-luxury-accent/30'
                    }
                  `}
                >
                  <span className="font-medium text-lg">{opt.label}</span>
                  {currentValue === opt.value && (
                    <div className="w-5 h-5 rounded-full bg-luxury-accent flex items-center justify-center text-white">
                      ✓
                    </div>
                  )}
                </button>
              ))}

              {/* MULTI CHOICE */}
              {question.type === 'multi_choice' && (
                <>
                  <div className="space-y-3 mb-6">
                    {question.options?.map((opt) => {
                      const isSelected = Array.isArray(currentValue) && currentValue.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => toggleMultiSelect(opt.value)}
                          disabled={isAdvancing}
                          className={`w-full text-right p-4 rounded-xl border-2 transition-colors flex items-center gap-3
                            ${isSelected ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent' : 'border-slate-200 text-slate-700 hover:border-luxury-accent/30'}`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center border-2 ${isSelected ? 'border-luxury-accent bg-luxury-accent text-white' : 'border-slate-300'}`}>
                            {isSelected && '✓'}
                          </div>
                          <span className="font-medium text-lg">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {Array.isArray(currentValue) && currentValue.length > 0 && (
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => submitAnswer(currentValue)}
                      disabled={isAdvancing}
                      className="w-full bg-luxury-accent text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-luxury-accent-hover transition-colors cursor-pointer"
                    >
                      <span>متابعة</span>
                      <ArrowLeft size={18} />
                    </motion.button>
                  )}
                </>
              )}

              {/* SLIDER */}
              {question.type === 'slider' && (
                <div className="py-6">
                  <div className="text-center mb-8">
                    <span className="text-4xl font-bold text-luxury-accent">
                      {currentValue !== null ? currentValue : (question.min || 0)}
                    </span>
                    {question.unit && <span className="text-slate-500 mr-2 text-lg">{question.unit}</span>}
                  </div>
                  <input
                    type="range"
                    min={question.min}
                    max={question.max}
                    step={question.step}
                    value={currentValue !== null ? currentValue : (question.min || 0)}
                    onChange={(e) => setCurrentValue(parseInt(e.target.value))}
                    className="w-full accent-luxury-accent h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    dir="rtl"
                  />
                  <div className="flex justify-between text-sm text-slate-500 mt-4 px-1">
                    <span>{question.min}</span>
                    <span>{question.max}</span>
                  </div>
                  
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => submitAnswer(currentValue !== null ? currentValue : (question.min || 0))}
                    disabled={isAdvancing}
                    className="w-full mt-10 bg-luxury-accent text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-luxury-accent-hover transition-colors cursor-pointer"
                  >
                    <span>متابعة</span>
                    <ArrowLeft size={18} />
                  </motion.button>
                </div>
              )}

              {/* NUMBER */}
              {question.type === 'number' && (
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="number"
                      min={question.min ?? 0}
                      max={question.max}
                      step={question.step ?? 1}
                      value={typeof currentValue === 'number' || (typeof currentValue === 'string' && !isNaN(Number(currentValue)) && currentValue !== '') ? currentValue : ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                        setCurrentValue(val);
                      }}
                      placeholder={question.placeholder || "أدخل القيمة الرقمية…"}
                      className="w-full border-2 border-slate-200 rounded-xl p-4 text-xl font-bold text-slate-900 focus:border-luxury-accent focus:outline-none pl-16 text-left dir-ltr"
                      dir="ltr"
                    />
                    {question.unit && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-sm font-semibold">
                        {question.unit}
                      </div>
                    )}
                  </div>

                  {/* Preset Options (e.g. for u06 net margin fallback) */}
                  {question.options && question.options.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-slate-500 mb-2">أو اختر نطاقاً تقديرياً:</p>
                      <div className="grid grid-cols-1 gap-2">
                        {question.options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleSingleSelect(opt.value)}
                            className={`w-full text-right p-3 rounded-xl border text-sm transition-colors flex justify-between items-center ${
                              currentValue === opt.value
                                ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold'
                                : 'border-slate-200 text-slate-700 hover:border-luxury-accent/30'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {currentValue === opt.value && <span className="text-luxury-accent font-bold">✓</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submit number button */}
                  {typeof currentValue === 'number' && !isNaN(currentValue) && (
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => submitAnswer(currentValue)}
                      disabled={isAdvancing}
                      className="w-full bg-luxury-accent text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-luxury-accent-hover transition-colors cursor-pointer"
                    >
                      <span>تأكيد الرقم والمتابعة</span>
                      <ArrowLeft size={18} />
                    </motion.button>
                  )}

                  {/* Skip / Don't know button */}
                  <button
                    type="button"
                    onClick={() => submitAnswer('unknown')}
                    disabled={isAdvancing}
                    className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    لا أملك هذا الرقم بدقة حالياً (تخطي)
                  </button>
                </div>
              )}

              {/* TEXT */}
              {question.type === 'text' && (
                <div>
                  <textarea
                    value={currentValue || ''}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    placeholder={question.placeholder || "اكتب إجابتك هنا…"}
                    className="w-full border-2 border-slate-200 rounded-xl p-4 min-h-[150px] focus:border-luxury-accent focus:outline-none resize-none text-lg text-text-dark"
                  />
                  
                  <AnimatePresence>
                    {typeof currentValue === 'string' && currentValue.trim().length > 0 && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        onClick={() => submitAnswer(currentValue)}
                        disabled={isAdvancing}
                        className="w-full mt-6 bg-luxury-accent text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-luxury-accent-hover transition-colors cursor-pointer"
                      >
                        <span>متابعة</span>
                        <ArrowLeft size={18} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              )}

            </div>
          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  );
};

export default Questionnaire;
