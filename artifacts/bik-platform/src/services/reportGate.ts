/**
 * Fix F2/F3 (round-5): بوابة التقرير تُحلَّ مرة واحدة، قبل أن يلمس أي أثر شاشة الزائر.
 *
 * العقد:
 *  - لا تقرير على الإطلاق → يُعاد الزائر إلى الصفحة الرئيسية.
 *  - لا موافقة في هذه الجلسة ولم يكتمل الإرسال بعلامة الإتمام → بوابة الليد.
 *  - الموافقة وحدها لا تفتح التقرير: من وافق ولم يُكمل النقل يعود إلى صفحة النقل.
 *  - علامة الإتمام (بصمة مطابقة لنص التقرير) مع كل الأجزاء المُرسلة تفتح التقرير
 *    حتى بعد محو الموافقة عند الاكتمال، فهي إثبات النهاية الوحيد الباقي.
 *  - كل حالة «أُرسل كل شيء» بلا علامة إتمام تُعامل كإفلاك مُزيَّف: بوابة الليد.
 *  - القرار متزامن بحتة (دالة نقية من مدخلات محسوبة)، فلا تُعرض شاشة التقرير
 *    قبل فحص البوابة مهما كانت حالة localStorage أو ترتيب التأثيرات.
 */

export interface ReportGateInputs {
  hasReport: boolean;
  /** موافقة هذه الجلسة فقط (sessionStorage)، ولا تُقرأ أبداً من سجل استرداد قديم. */
  sessionConsent: boolean;
  /** كل الأجزاء وصلت حالة «أُرسل» في سجل النقل بعد تطبيع readTransferProgress. */
  allPartsSent: boolean;
  /** علامة الإتمام موجودة وبصمتها مطابقة لنص التقرير الحالي. */
  doneMarkVerified: boolean;
}

export type ReportGateRedirect = 'lead-gate' | 'report-transfer' | 'home' | null;

export interface ReportGateResult {
  open: boolean;
  redirect: ReportGateRedirect;
}

export function resolveReportGate(inputs: ReportGateInputs): ReportGateResult {
  if (!inputs.hasReport) {
    return { open: false, redirect: 'home' };
  }

  // إثبات النهاية (علامة الإتمام المطابقة) يفتح التقرير في العرض الحيّ.
  if (inputs.doneMarkVerified) {
    return { open: true, redirect: null };
  }

  // موافقة هذه الجلسة تكفي فقط مع اكتمال النقل فعلاً؛ وإلا فالزائر يعود إلى النقل.
  if (inputs.sessionConsent) {
    return inputs.allPartsSent
      ? { open: true, redirect: null }
      : { open: false, redirect: 'report-transfer' };
  }

  // أي حالة أخرى — ومنها «كل الأجزاء أُرسلت» بلا علامة إتمام — تعني بوابة الليد.
  return { open: false, redirect: 'lead-gate' };
}
