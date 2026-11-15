import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Coins, ArrowRight, Check } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { trackEvent } from '../services/supabase';

const DiagnosticDepth: React.FC = () => {
  const navigate = useNavigate();
  const { sessionId, setField, diagnosticDepth } = useDiagnosticStore();

  useEffect(() => {
    trackEvent(sessionId, 'page_view', { page: 'diagnostic_depth' }).catch(console.error);
    window.scrollTo(0, 0);
  }, [sessionId]);

  const handleSelectDepth = (depth: 'quick' | 'deep') => {
    setField('diagnosticDepth', depth);
    trackEvent(sessionId, 'diagnostic_depth_selected', { depth }).catch(console.error);
    
    setTimeout(() => {
      navigate('/company-intake');
    }, 200);
  };

  return (
    <div className="min-h-screen bg-cream-bg flex flex-col p-4 md:p-8 rtl font-arabic pb-20">
      
      {/* Progress Indicator */}
      <div className="max-w-4xl mx-auto w-full mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-[#64748B]">الخطوة التمهيدية</span>
          <span className="text-sm font-bold text-text-dark">30%</span>
        </div>
        <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden flex flex-row-reverse">
          <div className="bg-luxury-accent h-full transition-all duration-500 ease-out w-[30%]"></div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-center">
        
        {/* Back navigation */}
        <button 
          onClick={() => navigate('/sector-select')}
          className="self-start flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors mb-6 text-sm font-medium cursor-pointer"
        >
          <ArrowRight size={16} />
          <span>الرجوع إلى اختيار القطاع</span>
        </button>

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-text-dark mb-3 font-display">اختر عمق التشخيص</h1>
          <p className="text-[#64748B] text-lg max-w-lg mx-auto">
            حدد مستوى التفاصيل والأدوات التي تريد استخدامها لفحص أداء شركتك
          </p>
        </div>

        {/* Depth Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
          
          {/* CARD 1 — Quick Diagnostic */}
          <motion.div
            whileHover={{ y: -4 }}
            className={`bg-white rounded-2xl p-6 md:p-8 border-2 cursor-pointer flex flex-col justify-between transition-all duration-300 shadow-sm relative overflow-hidden
              ${diagnosticDepth === 'quick' ? 'border-luxury-accent ring-1 ring-luxury-accent' : 'border-slate-200 hover:border-slate-300'}`}
            onClick={() => handleSelectDepth('quick')}
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="bg-slate-100 p-3 rounded-xl text-slate-700">
                  <Zap size={28} className="text-luxury-accent fill-luxury-accent" />
                </div>
                {diagnosticDepth === 'quick' && (
                  <span className="bg-luxury-accent/10 text-luxury-accent text-xs font-bold px-2.5 py-1 rounded-lg border border-luxury-accent/25 flex items-center gap-1">
                    <Check size={12} /> مختار حالياً
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-bold text-text-dark mb-2 font-display">تشخيص سريع</h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                قراءة أولية خلال عدة دقائق، دون حاجة إلى أرقام مالية دقيقة
              </p>

              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  <span>أسئلة عامة وقطاعية بحسب نشاطك وأهلية بياناتك</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  <span>نتيجة فورية على 100 نقطة</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  <span>تحليل SWOT مستند إلى إجاباتك</span>
                </li>
              </ul>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelectDepth('quick');
              }}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-center transition-colors text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
            >
              ابدأ التشخيص السريع
            </button>
          </motion.div>

          {/* CARD 2 — Deep Financial Diagnostic */}
          <motion.div
            whileHover={{ y: -4 }}
            className={`bg-white rounded-2xl p-6 md:p-8 border-2 cursor-pointer flex flex-col justify-between transition-all duration-300 shadow-md relative overflow-hidden
              ${diagnosticDepth === 'deep' ? 'border-luxury-accent ring-1 ring-luxury-accent' : 'border-[#E2E8F0] hover:border-luxury-accent/50'}`}
            onClick={() => handleSelectDepth('deep')}
          >
            <div>
              <div className="flex items-center justify-between mb-6 mt-2 md:mt-0">
                <div className="bg-luxury-accent/10 p-3 rounded-xl text-luxury-accent">
                  <Coins size={28} className="text-luxury-accent fill-luxury-accent" />
                </div>
                {diagnosticDepth === 'deep' && (
                  <span className="bg-luxury-accent/15 text-luxury-accent text-xs font-bold px-2.5 py-1 rounded-lg border border-luxury-accent/30 flex items-center gap-1">
                    <Check size={12} /> مختار حالياً
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-bold text-text-dark mb-2 flex items-center gap-2 font-display">
                <span>تشخيص مالي عميق</span>
              </h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                8-10 دقائق — يراجع المدخلات المالية والنطاقات المتاحة بعملتك
              </p>

              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2 text-sm text-slate-700 font-medium">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-luxury-accent"></div>
                  <span>كل ما في التشخيص السريع</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  <span>أسئلة مالية دقيقة إضافية (5-8 أسئلة برقم فعلي)</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                  <span>تقرير يوضح ما تدعمه بياناتك وما يحتاج إلى تحقق مالي إضافي</span>
                </li>
              </ul>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelectDepth('deep');
              }}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-center transition-colors text-sm bg-luxury-accent hover:bg-luxury-accent-hover text-white shadow-sm cursor-pointer"
            >
              ابدأ التشخيص المالي العميق
            </button>
          </motion.div>

        </div>

      </div>
    </div>
  );
};

export default DiagnosticDepth;
