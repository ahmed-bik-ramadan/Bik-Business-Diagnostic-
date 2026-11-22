import React, { useId } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

const questions = {
  welcome: [
    ['ما هذه المنصة؟', 'أداة عربية تقرأ حال شركتك في ست محاور وتخرج بقراءة أولية مكتوبة.'],
    ['هل هي مجانية؟', 'نعم، القراءة الأولية مجانية.'],
    ['هل تحتفظ المنصة بإجاباتي؟', 'لا. تبقى في المتصفح أثناء الجلسة فقط، وما تُرسله يبقى في محادثة واتساب بينك وبين أحمد.'],
    ['من يقرأ إجاباتي؟', 'أحمد فقط، وحين ترسلها أنت عبر واتساب.'],
    ['هل هي استشارة مهنية؟', 'لا. هي قراءة أولية تساعدك على تحديد ما يستحق النقاش.'],
  ],
  report: [
    ['ما الفرق بين العروض الثلاثة؟', 'الأول أسبوع استشاري مركز، والثاني شهر نقترح فيه الحلول وتنفذها أنت، والثالث شهر تنفيذي ننفذ فيه الحل مع فريقنا.'],
    ['هل أدفع الآن؟', 'لا. تبدأ بالمكالمة المجانية، ثم تقرر.'],
    ['كم المقدم؟', '35% من قيمة العرض، وهو جزء من الأتعاب لا فوقها.'],
    ['ماذا لو لم أرضَ؟', 'يُرد المبلغ إذا كان تقييمك أقل من 85% أو لم يتم العمل، مع خصم رسم إداري فقط.'],
    ['هل الأرقام في التقرير مضمونة؟', 'لا. هي تقديرات استرشادية من أرقامك أنت.'],
  ],
  consultant: [
    ['من أحمد رمضان؟', 'مستشار تطوير أعمال، في المبيعات منذ 2003 وفي تطوير الأعمال منذ 2017.'],
    ['كيف أتواصل؟', 'عبر واتساب من أي صفحة.'],
    ['هل يُكشف سر شركتي لغيري؟', 'لا. لا نكشف أسرار عميل لعميل آخر.'],
    ['ما الجهة المتعاقدة؟', 'BIK Business Solutions.'],
  ],
} as const;

export default function Faq({ group }: { group: keyof typeof questions }) {
  const titleId = useId();

  return (
    <section dir="rtl" aria-labelledby={titleId}
      className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 text-[#0F172A] md:p-8">
      <h2 id={titleId} className="font-display text-2xl font-bold">الأسئلة الشائعة</h2>
      <Accordion type="single" collapsible dir="rtl" className="mt-3">
        {questions[group].map(([question, answer]) => (
          <AccordionItem key={question} value={question} className="border-[#0F172A]/10 last:border-b-0">
            <AccordionTrigger className="min-h-12 gap-3 rounded-lg px-2 text-right text-base font-bold leading-7 focus-visible:outline-2 focus-visible:outline-[#92763D]">
              {question}
            </AccordionTrigger>
            <AccordionContent className="px-2 leading-7 text-[#26354E]">
              <p>{answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
