import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { trackEvent, saveProgress } from '../services/supabase';
import { currencyForCountry } from '../services/valueModule/currency';
import { dialectForCountry } from '../services/dialect';
import { intakeCopy } from '../copy/intakeCopy';

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

  const copy = intakeCopy(dialectForCountry(form.country));
  const noModel = copy.option('planning.model.none');
  const unknownDifference = copy.option('market.difference.unknown');

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
        if (value === noModel.value) {
          return { ...prev, [field]: [value] };
        } else if (current.includes(noModel.value)) {
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
    setField('universalAnswers', {
      ...useDiagnosticStore.getState().universalAnswers,
      u35: currencyForCountry(form.country),
    });
    
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
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">{copy.text('history.heading')}</h2>
                <p className="text-xs font-bold text-[#146B4F]">{copy.text('history.whyHeading')}</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">{copy.text('history.why')}</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('history.companyAge')} <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {copy.options('companyAge').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => updateForm('companyAge', value)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.companyAge === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('history.founderExperience')} <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {copy.options('founderExperience').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => updateForm('founderExperience', value)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.founderExperience === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('history.businessMotivation')} <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {copy.options('businessMotivation').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => toggleMultiSelect('businessMotivation', value)}
                        className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors cursor-pointer ${form.businessMotivation.includes(value) ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
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
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">{copy.text('planning.heading')}</h2>
                <p className="text-xs font-bold text-[#146B4F]">{copy.text('planning.whyHeading')}</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">{copy.text('planning.why')}</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('planning.modelsApplied')} <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {copy.options('modelsApplied').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => toggleMultiSelect('modelsApplied', value)}
                        className={`text-right p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.modelsApplied.includes(value) ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                    <button 
                      type="button"
                      onClick={() => toggleMultiSelect('modelsApplied', noModel.value)}
                      className={`text-right p-3 rounded-xl border-2 text-sm font-medium transition-colors md:col-span-2 cursor-pointer ${form.modelsApplied.includes(noModel.value) ? 'border-slate-400 bg-slate-50 text-slate-700 font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {noModel.label}
                    </button>
                  </div>
                </div>

                {form.modelsApplied.length > 0 && !form.modelsApplied.includes(noModel.value) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-2">
                    <label className="block text-sm font-medium text-text-dark mb-4">{copy.text('planning.modelSuccessRate')} <span className="text-luxury-accent font-bold mx-1">{form.modelSuccessRate}%</span></label>
                    <input 
                      type="range" min="0" max="100" step="5"
                      value={form.modelSuccessRate}
                      onChange={(e) => updateForm('modelSuccessRate', parseInt(e.target.value))}
                      className="w-full accent-luxury-accent cursor-pointer"
                      dir="rtl"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1 px-1">
                      <span>{copy.text('planning.successRateMin')}</span>
                      <span>{copy.text('planning.successRateMax')}</span>
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
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">{copy.text('finance.heading')}</h2>
                <p className="text-xs font-bold text-[#146B4F]">{copy.text('finance.whyHeading')}</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">{copy.text('finance.why')}</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('finance.breakEven')} <span className="text-red-500">*</span></label>
                  <div className="flex gap-3">
                    {copy.options('breakEven').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => { updateForm('breakEven', value); if(value==='لا بعد') updateForm('breakEvenTime', ''); }}
                        className={`flex-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.breakEven === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.breakEven === 'نعم' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
                    <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('finance.breakEvenTime')} <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                       {copy.options('breakEvenTime').map(({ value, label }) => (
                        <button 
                          type="button"
                          key={value} onClick={() => updateForm('breakEvenTime', value)}
                          className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.breakEvenTime === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('finance.roi')} <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {copy.options('roi').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => updateForm('roi', value)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.roi === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('finance.hasDebt')} <span className="text-red-500">*</span></label>
                  <div className="flex gap-3">
                    {copy.options('hasDebt').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => { updateForm('hasDebt', value); if(value==='لا'){ updateForm('debtDuration',''); updateForm('debtMonthlyPct',0); } }}
                        className={`flex-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.hasDebt === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.hasDebt === 'نعم' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('finance.debtDuration')} <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                         {copy.options('debtDuration').map(({ value, label }) => (
                          <button 
                            type="button"
                            key={value} onClick={() => updateForm('debtDuration', value)}
                            className={`p-2 rounded-xl border-2 text-sm transition-colors cursor-pointer ${form.debtDuration === value ? 'border-luxury-accent bg-white text-luxury-accent font-bold' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-dark mb-2">{copy.text('finance.debtMonthlyPct')} <span className="text-luxury-accent font-bold">{form.debtMonthlyPct}%</span></label>
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
                  <label className="block text-sm font-medium text-text-dark mb-4">{copy.text('finance.fixedCostsPct')} <span className="text-luxury-accent font-bold mx-1">{form.fixedCostsPct}%</span></label>
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
                <h2 className="text-xl font-bold text-text-dark mb-2 border-b pb-2 font-display">{copy.text('market.heading')}</h2>
                <p className="text-xs font-bold text-[#146B4F]">{copy.text('market.whyHeading')}</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">{copy.text('market.why')}</p>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-3">{copy.text('market.competitors')}</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="text" placeholder={copy.text('market.competitor.first')} value={form.comp1} onChange={(e) => updateForm('comp1', e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none text-text-dark" />
                    <input type="text" placeholder={copy.text('market.competitor.second')} value={form.comp2} onChange={(e) => updateForm('comp2', e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none text-text-dark" />
                    <input type="text" placeholder={copy.text('market.competitor.third')} value={form.comp3} onChange={(e) => updateForm('comp3', e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-luxury-accent focus:outline-none text-text-dark" />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-text-dark mb-3">{copy.text('market.differentiators')} <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {copy.options('differentiators').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => toggleMultiSelect('differentiators', value)}
                        className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors cursor-pointer ${form.differentiators.includes(value) ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                    <button 
                      type="button"
                      onClick={() => toggleMultiSelect('differentiators', unknownDifference.value)}
                      className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors cursor-pointer ${form.differentiators.includes(unknownDifference.value) ? 'border-slate-400 bg-slate-50 text-slate-700 font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {unknownDifference.label}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-dark mb-3">{copy.text('market.geographicScope')} <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {copy.options('geographicScope').map(({ value, label }) => (
                      <button 
                        type="button"
                        key={value} onClick={() => updateForm('geographicScope', value)}
                        className={`p-2 rounded-xl border-2 text-sm text-center font-medium transition-colors flex items-center justify-center cursor-pointer ${form.geographicScope === value ? 'border-luxury-accent bg-luxury-accent/5 text-luxury-accent font-bold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {label}
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
              {copy.text('form.submit')}
            </button>
            {!isSectionEValid && (
              <p className="text-center text-sm text-slate-500 mt-3 font-medium">{copy.text('form.incomplete')}</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default CompanyIntake;
