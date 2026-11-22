import React, { useEffect, useRef } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { BIK_OFFERS, buildConsultantWhatsAppUrl } from '../config/appConfig';
import { isPaymentOfferKey, offerPaymentPrices, paymentConfig } from '../config/paymentConfig';
import { track } from '../services/track';

export default function OfferSummary() {
  const { offerKey } = useParams();
  const openedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isPaymentOfferKey(offerKey) && openedKey.current !== offerKey) {
      openedKey.current = offerKey;
      track('summary_opened', offerKey);
      window.scrollTo(0, 0);
    }
  }, [offerKey]);

  if (!isPaymentOfferKey(offerKey)) return <Navigate to="/" replace />;

  const offer = BIK_OFFERS[offerKey];
  const payment = paymentConfig[offerPaymentPrices[offerKey]];
  const whatsapp = buildConsultantWhatsAppUrl({
    customMessage: `مرحباً أستاذ أحمد، أرغب في مناقشة «${offer.name}» (${offer.price}) قبل دفع المقدم.`,
  }).url;

  return (
    <main className="min-h-screen bg-[#F4F1E9] px-4 py-12 text-[#0F172A] md:py-20" dir="rtl">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#C9A961]/35 bg-white p-5 md:p-8">
        <h1 className="font-display text-2xl font-bold leading-relaxed md:text-3xl">
          {offer.name} — <bdi dir="ltr">{offer.price}</bdi>
        </h1>
        <div className="mt-5 space-y-3 leading-8 text-[#26354E]">
          {payment
            ? <p>المقدم: <bdi dir="ltr">{'$' + payment.depositUsd.toFixed(2)}</bdi> (35% من قيمة العرض، جزء من الأتعاب لا فوقها)</p>
            : <p>نبدأ بمكالمة 40 دقيقة نتفق فيها على النطاق، ثم تصلك فاتورة بالمقدم.</p>}
          <p>ما يحدث بعد الدفع: تُرسل إيصال الدفع إلى أحمد عبر واتساب، ثم نحدد موعد البدء معك.</p>
          <p>الاسترداد: يُرد المبلغ إذا كان تقييمك أقل من 85% أو لم يتم العمل، مع خصم رسم إداري فقط.</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {payment?.url && (
            <a href={payment.url} target="_blank" rel="noopener noreferrer" onClick={() => track('pay_clicked', offerKey)}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#0F172A] px-4 py-2 font-bold text-white hover:bg-[#26354E]">
              ادفع المقدم
            </a>
          )}
          <a href={whatsapp} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl border border-[#0F172A] px-4 py-2 font-bold hover:bg-[#F4F1E9]">
            راسل أحمد أولاً
          </a>
        </div>
      </div>
    </main>
  );
}
