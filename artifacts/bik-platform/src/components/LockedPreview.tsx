import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  /** Number of questions the client answered or skipped in this session. */
  questionCount: number;
  /** Number of diagnostic axes the platform evaluates. */
  axisCount: number;
}

const LOCKED_ITEMS = [
  'المؤشر العام وحالة كل محور من محاور شركتك',
  'أبرز الإشارات التي ظهرت من إجاباتك',
  'أولويتك الأولى للتحرك',
  'قراءة مالية مشروطة بالمدخلات التي أدخلتها'
];

/**
 * Shown before the client enters his details. It carries NO diagnostic content:
 * no score, status, headline or finding. Only counts and a list of what unlocks.
 */
export function LockedPreview({ questionCount, axisCount }: Props) {
  return <section data-testid="locked-preview" className="overflow-hidden rounded-[1.7rem] bg-[#0F172A] p-6 text-[#FBFAF6] md:p-8">
    <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A961]/50 px-3 py-1 text-xs font-bold text-[#DCC78D]"><Lock size={13} /> ملخص موجز · مقفل حتى إدخال بياناتك</span>
    <h2 className="mt-4 font-display text-2xl font-bold md:text-3xl">تشخيصك جاهز</h2>
    <p className="mt-3 leading-8 text-[#F4F1E9]">حللنا {questionCount} إجابة على {axisCount} محاور. النتيجة موجزة ومقفلة الآن، ويظهر التحليل الكامل لشركتك بعد إدخال بياناتك وإرسال التقرير إلى المستشار عبر واتساب.</p>
    <ul className="mt-5 space-y-2.5 text-sm">
      {LOCKED_ITEMS.map(item => <li key={item} className="flex items-center gap-2.5 text-white/85"><Lock size={14} className="shrink-0 text-[#C9A961]" /> {item}</li>)}
    </ul>
  </section>;
}
