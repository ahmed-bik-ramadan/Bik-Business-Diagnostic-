import React from 'react';
import { MessageCircle } from 'lucide-react';
import { BIK_OFFERS, BIK_REFUND_POLICY, BIK_FREE_CALL_MESSAGE, OFFER_GAP_LINE, buildConsultantWhatsAppUrl } from '../config/appConfig';
import type { OfferKey } from '../services/offerRecommendation';
import type { OfferOutcome } from '../services/offerOutcomes';

interface OfferCardsProps {
  /** Highlighted offer and the visible reason. Omit to show both cards neutrally. */
  recommended?: { key: OfferKey; reason: string };
  /** What this client needs, from his diagnosed axes. Shown inside both cards. Omit on neutral pages. */
  outcomes?: OfferOutcome[];
  /** المصرَّح به من أرقام العميل كما هو، من ميزان القرار. يُبنى عليه سطر الخسارة فقط حين يكون صحيحاً. */
  monthlyWaste?: { amount: number; currency: string } | null;
}

/** ترتيب الإرساء: الأعلى أولاً يجعل الوسط معقولاً والمدخل سهلاً. */
const ORDER: OfferKey[] = ['executiveProject', 'monthlyRetainer', 'focusedWeek'];

/** لون الأخضر الفاخر للبطاقة المرشّحة: عميق هادئ لا يصرخ، ولا يخلّ بالذهبي السائد. */
const GREEN_RECOMMENDED = { border: 'border-[#146B4F]', badge: 'bg-[#146B4F] text-[#F6F3EC]', cta: 'bg-[#146B4F] hover:bg-[#0D523C]' };

/** سطر الخسارة يُفتتح به كل عرض، مبني على رقم العميل المصرَّح به وحده — لا رقم يُختلق. */
function lossLine(monthlyWaste: OfferCardsProps['monthlyWaste']): string | null {
  if (!monthlyWaste || !Number.isFinite(monthlyWaste.amount) || monthlyWaste.amount <= 0) return null;
  const amount = Math.round(monthlyWaste.amount).toLocaleString('en-US');
  return `[[TEXT_NEEDED: offer_monthly_estimate]] تقدير استرشادي: ${amount} ${monthlyWaste.currency}`;
}

/** The only place offers are rendered. Names, prices and scope come only from BIK_OFFERS. */
export default function OfferCards({ recommended, outcomes, monthlyWaste }: OfferCardsProps) {
  const monthlyLoss = lossLine(monthlyWaste);
  return (
    <section aria-label="العروض الاستشارية" className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 shadow-[0_18px_60px_rgba(15,23,42,.06)] md:p-8">
      <p className="text-xs font-bold text-[#92763D]">الخطوة التالية</p>
      <h2 className="mt-1 font-display text-2xl font-bold">ثلاثة عروض استشارية — ابدأ من حيث يناسبك</h2>
      <p className="mt-2 text-sm leading-7 text-[#26354E]">انظر في تقريرك إلى ميزان القرار، ثم انظر إلى الأسعار. القرار عندها حسابي لا عاطفي.</p>
      <div className="mt-4 rounded-2xl border border-[#C9A961]/50 bg-white p-4">
        <strong className="block text-[#0F172A]">هدية لك: 15 دقيقة مع أ/ أحمد، على حسابنا</strong>
        <p className="mt-1 text-sm leading-7 text-[#26354E]">أقوى تساؤل يقلق شركتك، تناقشه معه وتخرج بتوصية واضحة تقيس عليها كل ما بعدها. وإن لم تكن خدماتنا ما تحتاجه، ستسمع ذلك بنفس الوضوح.</p>
        <p className="mt-2 text-sm leading-7 text-[#146B4F]">التقرير يبقى لديك في محادثة واتساب.</p>
        <a href={buildConsultantWhatsAppUrl({ customMessage: BIK_FREE_CALL_MESSAGE }).url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#146B4F] px-4 py-2.5 text-sm font-bold text-[#146B4F] hover:bg-[#146B4F] hover:text-white"><MessageCircle size={16} /> احجز دقائقك الـ15</a>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {ORDER.map((key) => {
          const offer = BIK_OFFERS[key];
          const isRecommended = recommended?.key === key;
          const url = buildConsultantWhatsAppUrl({
            customMessage: `مرحباً أستاذ أحمد، أكملت تشخيص BIK وأرغب في مناقشة «${offer.name}» (${offer.priceFigure}).`
          }).url;
          return (
            <div
              key={key}
              data-offer={key}
              data-recommended={isRecommended ? 'true' : 'false'}
              className={`flex flex-col rounded-2xl bg-white p-5 ${isRecommended ? `border-2 ${GREEN_RECOMMENDED.border}` : 'border border-[#0F172A]/10'}`}
            >
              {isRecommended && <span className={`mb-3 inline-block self-start rounded-full px-3 py-1 text-xs font-bold ${GREEN_RECOMMENDED.badge}`}>الأنسب لوضعك</span>}
              <strong className="block text-[#0F172A]">{offer.name}</strong>
              <span className="mt-2 block font-bold text-[#92763D]">{offer.priceFigure}</span>
              {'perDayNote' in offer && offer.perDayNote && <span className="mt-1 block text-xs font-bold leading-6 text-[#146B4F]">{offer.perDayNote}</span>}
              {monthlyLoss && <p className="mt-3 rounded-xl bg-[#F6F0DF] p-3 text-sm leading-7 text-[#5D5542]">{monthlyLoss}</p>}
              <p className="mt-3 text-sm leading-7 text-[#68717A]">{offer.scope}</p>
              <ul className="mt-3 space-y-1.5 text-sm leading-7 text-[#26354E]" data-testid="offer-includes">
                {offer.includes.map(line => <li key={line} className="flex gap-2"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#92763D]" aria-hidden="true" />{line}</li>)}
              </ul>
              {isRecommended && recommended && <p className="mt-3 text-sm leading-7 text-[#26354E]">{recommended.reason}</p>}
              {outcomes && outcomes.length > 0 && (
                <div className="mt-4 border-t border-[#0F172A]/10 pt-4" data-testid="offer-outcomes">
                  <p className="text-xs font-bold text-[#92763D]">أبرز ما تحتاجه حالتك ({outcomes.length})</p>
                  <ol className="mt-2 space-y-2.5 text-sm leading-7 text-[#26354E]">
                    {outcomes.map(item => (
                      <li key={item.axis} data-axis={item.axis} data-kind={item.kind} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9A961]" aria-hidden="true" />
                        <span>{item.outcome}{item.basis && <span className="mt-0.5 block text-xs leading-6 text-[#68717A]">ما ظهر في تشخيصك: {item.basis}</span>}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {outcomes && outcomes.length === 0 && <p className="mt-4 border-t border-[#0F172A]/10 pt-4 text-xs leading-6 text-[#68717A]" data-testid="offer-outcomes-empty">لم تظهر محاور تحتاج معالجة في إجاباتك. هذا العرض مناسب لاختبار قرار أو فرصة محددة.</p>}
              {url
                ? <a href={url} target="_blank" rel="noreferrer" className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white ${isRecommended ? GREEN_RECOMMENDED.cta : 'bg-[#0F172A] hover:bg-[#26354E]'}`}><MessageCircle size={17} /> ناقش هذا العرض مع أ/ أحمد</a>
                : <p className="mt-5 text-xs leading-6 text-[#68717A]">رابط واتساب غير متاح حالياً.</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-sm leading-7 text-[#26354E]" data-testid="offer-gap-line">{OFFER_GAP_LINE}</p>
      <p className="mt-3 text-sm leading-7">{BIK_REFUND_POLICY}</p>
      {recommended && <p className="mt-2 text-xs leading-6 text-[#68717A]">التوصية محسوبة آلياً من نتيجة محاور التشخيص، وليست وعداً بنتيجة. الاختيار لك.</p>}
    </section>
  );
}
