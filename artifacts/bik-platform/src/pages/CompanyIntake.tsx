import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { trackEvent, saveProgress } from '../services/supabase';

const CompanyIntake: React.FC = () => {
  const navigate = useNavigate();
  const { sessionId, companyName, setField } = useDiagnosticStore();

  const [form, setForm] = useState({
    firstName: '',
    companyName: companyName || '',
    country: '',
    city: '',
    companyAge: '',
    founderExperience: '',
    businessMotivation: [] as string[],
    modelsApplied: [] as string[],
    modelSuccessRate: 50,
    breakEven: '',
    breakEvenTime: '',
    roi: '',
    hasDebt: '',
    debtDuration: '',
    debtMonthlyPct: 0,
    fixedCostsPct: 0,
    comp1: '',
    comp2: '',
    comp3: '',
    differentiators: [] as string[],
    geographicScope: ''
  });

  useEffect(() => {
    trackEvent(sessionId, 'page_view', { page: 'company_intake' }).catch(console.error);
    window.scrollTo(0, 0);
  }, [sessionId]);

  const updateForm = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleMultiSelect = (field: 'businessMotivation' | 'modelsApplied' | 'differentiators', value: string) => {
    setForm(prev => {
      const current = prev[field];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter(v => v !== value) };
      }
      
      // Handle exclusive options like "لم أطبق أياً من الأعلى"
      if (field === 'modelsApplied') {
        if (value === 'لم أطبق أياً من الأعلى') {
          return { ...prev, [field]: [value] };
        } else if (current.includes('لم أطبق أياً من الأعلى')) {
          return { ...prev, [field]: [value] };
        }
      }
      
      return { ...prev, [field]: [...current, value] };
    });
  };

  // Validation logic for reveals
  const isSectionAValid = form.firstName.trim() !== '' && form.companyName.trim() !== '' && form.country !== '' && form.city.trim() !== '';
  const isSectionBValid = isSectionAValid && form.companyAge !== '' && form.founderExperience !== '' && form.businessMotivation.length > 0;
  const isSectionCValid = isSectionBValid && form.modelsApplied.length > 0;
  const isSectionDValid = isSectionCValid && 
    form.breakEven !== '' && (form.breakEven !== 'نعم' || form.breakEvenTime !== '') &&
    form.roi !== '' &&
    form.hasDebt !== '' && (form.hasDebt !== 'نعم' || form.debtDuration !== '');
  const isSectionEValid = isSectionDValid && form.differentiators.length > 0 && form.geographicScope !== '';

  const handleSubmit = async () => {
    if (!isSectionEValid) return;

    setField('userName', form.firstName);
    setField('companyName', form.companyName);
    setField('intakeAnswers', form);
    
    // Attempt saving to backend
    try {
      await saveProgress(sessionId, { intake_answers: form });
    } catch (e) {
      console.error(e); // Proceed even if it fails
    }

    trackEvent(sessionId, 'intake_completed', {}).catch(console.error);
    navigate('/questionnaire');
  };

  return (
    <div className="min-h-screen bg-cream-bg pb-24 rtl font-arabic">
      
      {/* Progress Indicator */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 p-4">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-[#64748B]">الخطوة 2 من 5</span>
            <span className="text-sm font-bold text-text-dark">40%</span>
          </div>
          <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden flex flex-row-reverse">
            <div className="bg-luxury-accent h-full transition-all duration-500 ease-out w-[40%]"></div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full p-4 md:p-6 mt-4">
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-text-dark font-display">بيانات شركتك الأساسية</h1>
            <div className="bg-luxury-accent/5 text-luxury-accent px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 border border-luxury-accent/20">
              <Clock size={14} />
              <span>3 دقائق</span>
            </div>
          </div>
          <p className="text-[#64748B]">هذه المعلومات تُخصِّص التشخيص لواقعك تحديداً</p>
        </div>

        <div className="space-y-8">

          {/* SECTION A — Identity */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">القسم 1: الهوية الأساسية</h2>
            <p className="text-xs font-bold text-[#146B4F]">لماذا نسأل</p>
            <p className="text-sm leading-7 text-slate-500 mb-5">بيانات هذا القسم تصف لمن نتحدث، وتساعد على أن يُقرأ تقريرك بعين نشاطك أنت، لا بعين نشاط عام.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-dark mb-1">اسمك الأول <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={form.firstName} 
                  onChange={(e) => updateForm('firstName', e.target.value)}
                  placeholder="اسمك" 
                  className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none transition-colors text-text-dark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-dark mb-1">اسم شركتك أو نشاطك <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={form.companyName} 
                  onChange={(e) => updateForm('companyName', e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none transition-colors text-text-dark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-dark mb-1">الدولة <span className="text-red-500">*</span></label>
                <select 
                  value={form.country} 
                  onChange={(e) => updateForm('country', e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none transition-colors bg-white text-text-dark"
                >
                  <option value="">اختر الدولة…</option>
                  {['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'الأردن', 'المغرب', 'تونس', 'ليبيا', 'أخرى'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-dark mb-1">المدينة <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={form.city} 
                  onChange={(e) => updateForm('city', e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none transition-colors text-text-dark"
                />
              </div>
            </div>
          </section>

          {/* SECTION B — History */}
          <AnimatePresence>
            {isSectionAValid && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
              >
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">القسم 2: التاريخ والخبرة</h2>
                <p className="text-xs font-bold text-[#146B4F]">لماذا نسأل</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">طريق شركتك حتى اليوم يفسّر ما تواجهه الآن: التحولات وسنوات الخبرة تخبرنا أين مكمن القوة الذي يُبنى عليه القرار.</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">عمر الشركة <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['أقل من سنة', '1-3 سنوات', '3-7 سنوات', 'أكثر من 7 سنوات'].map((v, optionIndex) => (
                      <button 
                        type="button"
                        key={v} onClick={() => updateForm('companyAge', v)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.companyAge === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {["أقل من سنة", "سنة إلى أقل من 3 سنوات", "3 إلى أقل من 7 سنوات", "7 سنوات فأكثر"][optionIndex]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">خبرتك في المجال <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['أقل من 3', '3-7', '7-15', 'أكثر من 15 سنة'].map((v, optionIndex) => (
                      <button 
                        type="button"
                        key={v} onClick={() => updateForm('founderExperience', v)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.founderExperience === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {["أقل من 3 سنوات", "3 إلى أقل من 7 سنوات", "7 إلى أقل من 15 سنة", "15 سنة فأكثر"][optionIndex]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-dark mb-2">ما الذي دفعك لاختيار هذا النشاط؟ (اختر ما ينطبق) <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {['خبرة سابقة', 'رؤية سوقية', 'ميراث عائلي', 'فرصة ظهرت', 'شغف شخصي', 'أخرى'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => toggleMultiSelect('businessMotivation', v)}
                        className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors cursor-pointer ${form.businessMotivation.includes(v) ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* SECTION C — Business Models */}
          <AnimatePresence>
            {isSectionBValid && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
              >
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">القسم 3: التخطيط الأولي</h2>
                <p className="text-xs font-bold text-[#146B4F]">لماذا نسأل</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">ما خططت له قبل البدء، ومدى تطابقه مع الواقع، يساعداننا على قراءة أرقامك بما يناسب شركتك.</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">هل طبقت أياً من هذه قبل البدء؟ <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {['أبحاث سوقية', 'نموذج عمل Business Model Canvas', 'خطة عمل Business Plan', 'استراتيجية تسويقية', 'تحليل منافسين', 'دراسة جدوى مالية'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => toggleMultiSelect('modelsApplied', v)}
                        className={`text-right p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.modelsApplied.includes(v) ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                    <button 
                      type="button"
                      onClick={() => toggleMultiSelect('modelsApplied', 'لم أطبق أياً من الأعلى')}
                      className={`text-right p-3 rounded-xl border-2 text-sm font-medium transition-colors md:col-span-2 cursor-pointer ${form.modelsApplied.includes('لم أطبق أياً من الأعلى') ? 'border-slate-400 bg-slate-50 text-slate-700 font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      لم أطبق أياً من الأعلى
                    </button>
                  </div>
                </div>

                {form.modelsApplied.length > 0 && !form.modelsApplied.includes('لم أطبق أياً من الأعلى') && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-2">
                    <label className="block text-sm font-medium text-text-dark mb-4">نسبة تطابق الواقع مع ما خططت له: <span className="text-luxury-accent font-bold mx-1">{form.modelSuccessRate}%</span></label>
                    <input 
                      type="range" min="0" max="100" step="5"
                      value={form.modelSuccessRate}
                      onChange={(e) => updateForm('modelSuccessRate', parseInt(e.target.value))}
                      className="w-full accent-luxury-accent cursor-pointer"
                      dir="rtl"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1 px-1">
                      <span>0% (مختلف تماماً)</span>
                      <span>100% (تطابق تام)</span>
                    </div>
                  </motion.div>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          {/* SECTION D — Financial Health */}
          <AnimatePresence>
            {isSectionCValid && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
              >
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">القسم 4: الصحة المالية</h2>
                <p className="text-xs font-bold text-[#146B4F]">لماذا نسأل</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">تساعد بيانات هذا القسم على قراءة الوضع المالي من إجاباتك. تُعالج في المتصفح ولا يتلقاها خادم BIK لتوليد التقرير؛ وما يصل إلى المستشار هو ما ترسله أنت عبر واتساب.</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">هل حققت نقطة التعادل (Break Even)؟ <span className="text-red-500">*</span></label>
                  <div className="flex gap-3">
                    {['نعم', 'لا بعد'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => { updateForm('breakEven', v); if(v==='لا بعد') updateForm('breakEvenTime', ''); }}
                        className={`flex-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.breakEven === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {form.breakEven === 'نعم' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
                    <label className="block text-sm font-medium text-text-dark mb-2">كم استغرق ذلك؟ <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                       {['أقل من 6 أشهر', '6-12 شهراً', '1-2 سنة', 'أكثر من سنتين'].map((v, optionIndex) => (
                        <button 
                          type="button"
                          key={v} onClick={() => updateForm('breakEvenTime', v)}
                          className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.breakEvenTime === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        >
                          {["أقل من 6 أشهر", "6 أشهر إلى أقل من سنة", "سنة إلى سنتين", "أكثر من سنتين"][optionIndex]}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">معدل العائد على الاستثمار (ROI) منذ التأسيس <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {['خسارة حتى الآن', '0-10%', '10-30%', '30-100%', 'أكثر من 100%', 'لا أحسبه'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => updateForm('roi', v)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.roi === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-dark mb-2">هل لدى شركتك قروض أو التزامات خارجية؟ <span className="text-red-500">*</span></label>
                  <div className="flex gap-3">
                    {['لا', 'نعم'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => { updateForm('hasDebt', v); if(v==='لا'){ updateForm('debtDuration',''); updateForm('debtMonthlyPct',0); } }}
                        className={`flex-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.hasDebt === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {form.hasDebt === 'نعم' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-dark mb-2">إجمالي الديون كعدد أشهر من إيراداتك <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                         {['أقل من 3', '3-6', '6-12', 'أكثر من 12'].map((v, optionIndex) => (
                          <button 
                            type="button"
                            key={v} onClick={() => updateForm('debtDuration', v)}
                            className={`p-2 rounded-xl border-2 text-sm transition-colors cursor-pointer ${form.debtDuration === v ? 'border-luxury-accent bg-white text-luxury-accent font-bold' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                          >
                            {["أقل من 3", "3 إلى أقل من 6", "6 إلى أقل من 12", "12 فأكثر"][optionIndex]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-dark mb-2">الأقساط الشهرية كنسبة من إيراداتك: <span className="text-luxury-accent font-bold">{form.debtMonthlyPct}%</span></label>
                      <input 
                        type="range" min="0" max="60" step="5"
                        value={form.debtMonthlyPct}
                        onChange={(e) => updateForm('debtMonthlyPct', parseInt(e.target.value))}
                        className="w-full accent-luxury-accent cursor-pointer"
                        dir="rtl"
                      />
                    </div>
                  </motion.div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-dark mb-4">إجمالي تكاليفك الثابتة الشهرية كنسبة من إيراداتك: <span className="text-luxury-accent font-bold mx-1">{form.fixedCostsPct}%</span></label>
                  <input 
                    type="range" min="0" max="100" step="5"
                    value={form.fixedCostsPct}
                    onChange={(e) => updateForm('fixedCostsPct', parseInt(e.target.value))}
                    className="w-full accent-luxury-accent cursor-pointer"
                    dir="rtl"
                  />
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* SECTION E — Competition */}
          <AnimatePresence>
            {isSectionDValid && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
              >
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">القسم 5: التنافسية والسوق</h2>
                <p className="text-xs font-bold text-[#146B4F]">لماذا نسأل</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">السوق الذي تتنافس فيه يحدد ما يُعدّ انتصاراً: هنا يُضبط ميزان المقارنة قبل أن تُقرأ أرقامك.</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-3">من أقوى منافسيك؟ (اختياري)</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="text" placeholder="المنافس الأول" value={form.comp1} onChange={(e) => updateForm('comp1', e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none text-text-dark" />
                    <input type="text" placeholder="المنافس الثاني" value={form.comp2} onChange={(e) => updateForm('comp2', e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none text-text-dark" />
                    <input type="text" placeholder="المنافس الثالث" value={form.comp3} onChange={(e) => updateForm('comp3', e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none text-text-dark" />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-3">ما الذي يميزك عنهم؟ <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {['السعر الأقل', 'الجودة الأعلى', 'السرعة', 'الموقع الجغرافي', 'العلاقة الشخصية', 'التخصص الدقيق', 'ما بعد البيع'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => toggleMultiSelect('differentiators', v)}
                        className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors cursor-pointer ${form.differentiators.includes(v) ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                    <button 
                      type="button"
                      onClick={() => toggleMultiSelect('differentiators', 'لا أعرف بالضبط')}
                      className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors cursor-pointer ${form.differentiators.includes('لا أعرف بالضبط') ? 'border-slate-400 bg-slate-50 text-slate-700 font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      لا أعرف بالضبط
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-dark mb-3">النطاق الجغرافي لعملك <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {['محلي مدينة واحدة', 'إقليمي عدة مدن', 'وطني', 'خليجي أو أفريقي', 'دولي'].map(v => (
                      <button 
                        type="button"
                        key={v} onClick={() => updateForm('geographicScope', v)}
                        className={`p-2 rounded-xl border-2 text-sm text-center font-medium transition-colors flex items-center justify-center cursor-pointer ${form.geographicScope === v ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

              </motion.section>
            )}
          </AnimatePresence>

          <div className="pt-4">
            <button 
              type="button"
              onClick={handleSubmit}
              disabled={!isSectionEValid}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all shadow-md
                ${isSectionEValid ? 'bg-luxury-accent text-white hover:bg-luxury-accent-hover cursor-pointer hover:shadow-lg' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}
              `}
            >
              ابدأ التشخيص الكامل
            </button>
            {!isSectionEValid && (
              <p className="text-center text-sm text-slate-500 mt-3 font-medium">أكمل جميع الحقول المطلوبة للمتابعة</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default CompanyIntake;
