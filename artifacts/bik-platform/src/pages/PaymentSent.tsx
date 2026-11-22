import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BIK_OFFERS, buildConsultantWhatsAppUrl } from '../config/appConfig';
import { isPaymentOfferKey } from '../config/paymentConfig';

export default function PaymentSent() {
  const [params] = useSearchParams();
  const offerKey = params.get('offer');
  const offerName = isPaymentOfferKey(offerKey) ? ` ${BIK_OFFERS[offerKey].name}` : '';
  const whatsapp = buildConsultantWhatsAppUrl({
    customMessage: `أرسلت مقدم عرض${offerName} وأرفقت الإيصال.`,
  }).url;

  return (
    <main className="min-h-screen bg-[#F4F1E9] px-4 py-12 text-[#0F172A] md:py-20" dir="rtl">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#C9A961]/35 bg-white p-5 md:p-8">
        <h1 className="font-display text-2xl font-bold leading-relaxed md:text-3xl">شكراً لك.</h1>
        <p className="mt-5 leading-8 text-[#26354E]">أرسل إيصال الدفع إلى أحمد عبر واتساب ليؤكد استلامه ويحدد موعد البدء.</p>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#0F172A] px-4 py-2 font-bold text-white hover:bg-[#26354E]">
          أرسل الإيصال
        </a>
      </div>
    </main>
  );
}
