import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MessageCircle, X } from 'lucide-react';
import {
  BIK_EXECUTIVE_RETURN_TARGET, BIK_OFFERS, BIK_REFUND_POLICY, OFFER_GAP_LINE, buildConsultantWhatsAppUrl
} from '../config/appConfig';
import type { OfferKey } from '../services/offerRecommendation';
import type { OfferOutcome } from '../services/offerOutcomes';

interface OfferCardsProps {
  recommended?: { key: OfferKey; reason?: string };
  outcomes?: OfferOutcome[];
  monthlyWaste?: { amount: number; currency: string } | null;
}

interface OfferCardProps {
  offerKey: OfferKey;
  offer: (typeof BIK_OFFERS)[OfferKey];
  whatsappUrl: string;
  reason?: string;
  outcomes?: OfferOutcome[];
  monthlyLoss?: string | null;
}

export const OFFER_ORDER: readonly OfferKey[] = ['executiveProject', 'monthlyRetainer', 'focusedWeek'];

function lossLine(monthlyWaste: OfferCardsProps['monthlyWaste']): string | null {
  if (!monthlyWaste || !Number.isFinite(monthlyWaste.amount) || monthlyWaste.amount <= 0) return null;
  const amount = Math.round(monthlyWaste.amount).toLocaleString('en-US');
  return `المشكلة تستمر بكلفتها الشهرية حتى تُعالج: قرابة ${amount} ${monthlyWaste.currency} على أرقامك المصرّح بها، تقدير استرشادي.`;
}

export function OfferCard({ offerKey, offer, whatsappUrl, reason, outcomes, monthlyLoss }: OfferCardProps) {
  const executive = offerKey === 'executiveProject';
  const recommendation = reason?.trim();
  const surface = executive ? 'bg-[#0F172A] text-[#F6F3EC]' : 'bg-white text-[#0F172A]';
  const bodyText = executive ? 'text-slate-200' : 'text-[#26354E]';
  const accent = executive ? 'text-[#E1C27B]' : 'text-[#6B5620]';
  const buttonColors = executive
    ? 'bg-[#BBF7D0] text-[#0F172A] hover:bg-[#DCFCE7]'
    : 'bg-[#0F172A] text-white hover:bg-[#26354E]';
  const button = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92763D] ${buttonColors}`;
  const price = (
    <span className={`mt-2 block text-lg font-bold ${accent}`}>
      <bdi dir="ltr">{offer.price}</bdi>
      {'billingLabel' in offer && <span className="ms-1 text-sm">{offer.billingLabel}</span>}
    </span>
  );

  return (
    <div className="min-w-0">
      <Dialog.Root>
        <article data-offer={offerKey} data-recommended={recommendation ? 'true' : 'false'}
          className={`flex min-w-0 flex-col rounded-2xl p-5 ${surface} ${recommendation ? 'border-2 border-[#146B4F]' : 'border border-[#C9A961]/35'}`}>
          {recommendation && <span className="mb-3 inline-block self-start rounded-full bg-[#146B4F] px-3 py-1 text-xs font-bold text-[#F6F3EC]">الأنسب لوضعك</span>}
          <h3 className="font-bold">{offer.name}</h3>
          {price}
          <p className={`mt-3 truncate text-sm leading-7 ${bodyText}`} title={offer.scope}>{offer.scope}</p>
          <p data-testid="offer-free-call" className={`mt-2 text-sm font-bold leading-6 ${bodyText}`}>
            {`مكالمة تمهيدية مجانية مع أ/ أحمد: ${offer.freeCallMinutes} دقيقة`}
          </p>
          {recommendation && <p data-testid="offer-reason" className={`mt-3 text-sm leading-7 ${bodyText}`}>{recommendation}</p>}
          <Dialog.Trigger type="button" className={`mt-4 self-start ${button}`}>لماذا تناسبك هذه الخدمة</Dialog.Trigger>
        </article>

        <Dialog.Portal>
          <Dialog.Overlay data-testid="offer-dialog-backdrop" className="fixed inset-0 z-[100] bg-[#0F172A]/65" />
          <Dialog.Content role="dialog" aria-modal="true" dir="rtl" lang="ar"
            className={`fixed top-1/2 left-1/2 z-[101] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#C9A961]/35 p-5 font-arabic shadow-xl md:p-7 ${surface}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl font-bold">{offer.name}</Dialog.Title>
                {price}
              </div>
              <Dialog.Close className={`inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92763D] ${buttonColors}`} aria-label="إغلاق">
                <X size={20} aria-hidden="true" />
              </Dialog.Close>
            </div>
            {'perDayNote' in offer && offer.perDayNote && <p className={`mt-1 text-xs font-bold leading-6 ${accent}`}>{offer.perDayNote}</p>}
            <Dialog.Description className={`mt-4 text-sm leading-7 ${bodyText}`}>{offer.scope}</Dialog.Description>
            {monthlyLoss && <p data-testid="offer-loss" className="mt-3 rounded-xl bg-[#F6F0DF] p-3 text-sm leading-7 text-[#5D5542]">{monthlyLoss}</p>}
            <ul className={`mt-3 space-y-1.5 text-sm leading-7 ${bodyText}`} data-testid="offer-includes">
              {offer.includes.map(line => <li key={line} className="flex gap-2"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#C9A961]" aria-hidden="true" />{line}</li>)}
            </ul>
            {outcomes && outcomes.length > 0 && (
              <div className="mt-4 border-t border-[#C9A961]/35 pt-4" data-testid="offer-outcomes">
                <p className={`text-xs font-bold ${accent}`}>أبرز ما تحتاجه حالتك ({outcomes.length})</p>
                <ol className={`mt-2 space-y-2.5 text-sm leading-7 ${bodyText}`}>
                  {outcomes.map(item => (
                    <li key={item.axis} data-axis={item.axis} data-kind={item.kind} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9A961]" aria-hidden="true" />
                      <span>{item.outcome}{item.basis && <span className="mt-0.5 block text-xs leading-6">ما ظهر في تشخيصك: {item.basis}</span>}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {outcomes && outcomes.length === 0 && <p className={`mt-4 border-t border-[#C9A961]/35 pt-4 text-xs leading-6 ${bodyText}`} data-testid="offer-outcomes-empty">لم تظهر محاور تحتاج معالجة في إجاباتك. هذا العرض مناسب لاختبار قرار أو فرصة محددة.</p>}
            <p className={`mt-4 text-sm leading-7 ${bodyText}`}>{BIK_REFUND_POLICY}</p>
            {whatsappUrl
              ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={`mt-5 ${button}`}><MessageCircle size={17} aria-hidden="true" /> ناقش هذا العرض مع أ/ أحمد</a>
              : <p className={`mt-5 text-xs leading-6 ${bodyText}`}>رابط واتساب غير متاح حالياً.</p>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {executive && <p data-testid="offer-return-target" className="mt-3 px-1 text-sm leading-7 text-[#26354E]">{BIK_EXECUTIVE_RETURN_TARGET}</p>}
    </div>
  );
}

export default function OfferCards({ recommended, outcomes, monthlyWaste }: OfferCardsProps) {
  const monthlyLoss = lossLine(monthlyWaste);
  return (
    <section aria-label="العروض الاستشارية" className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 shadow-[0_18px_60px_rgba(15,23,42,.06)] md:p-8">
      <p className="text-xs font-bold text-[#92763D]">الخطوة التالية</p>
      <h2 className="mt-1 font-display text-2xl font-bold">ثلاثة عروض استشارية — ابدأ من حيث يناسبك</h2>
      <p className="mt-2 text-sm leading-7 text-[#26354E]">انظر في تقريرك إلى ميزان القرار، ثم انظر إلى الأسعار. القرار عندها حسابي لا عاطفي.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {OFFER_ORDER.map(key => {
          const offer = BIK_OFFERS[key];
          const url = buildConsultantWhatsAppUrl({
            customMessage: `مرحباً أستاذ أحمد، أكملت تشخيص BIK وأرغب في مناقشة «${offer.name}» (${offer.price}).`
          }).url;
          return <OfferCard key={key} offerKey={key} offer={offer} whatsappUrl={url}
            reason={recommended?.key === key ? recommended.reason : undefined} outcomes={outcomes} monthlyLoss={monthlyLoss} />;
        })}
      </div>
      <p className="mt-5 text-sm leading-7 text-[#26354E]" data-testid="offer-gap-line">{OFFER_GAP_LINE}</p>
      {recommended?.reason?.trim() && <p className="mt-2 text-xs leading-6 text-[#68717A]">التوصية محسوبة آلياً من نتيجة محاور التشخيص، وليست وعداً بنتيجة. الاختيار لك.</p>}
    </section>
  );
}
