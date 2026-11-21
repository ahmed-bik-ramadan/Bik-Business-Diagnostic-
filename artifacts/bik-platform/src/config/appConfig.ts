/**
 * BIK V1 Application Configuration
 *
 * Centralized public contact information and application metadata.
 * Note: These values are strictly public contact details, NOT secrets or API keys.
 * No environment variables, tokens, or server-side WhatsApp APIs are required.
 */

export interface AppConfig {
  /**
   * Verified public WhatsApp contact number for consultant Ahmed Ramadan.
   * Format: International digits without '+' or spaces (e.g., '201066966515').
   * If left empty (''), the WhatsApp CTA gracefully prompts the user or disables without crashing.
   */
  consultantWhatsApp: string;
  consultantName: string;
  consultantTitle: string;
  platformName: string;
  version: string;
}

export const APP_CONFIG: AppConfig = {
  // Verified public consultant WhatsApp contact from existing BIK repository
  // To update or replace, edit this public value directly:
  consultantWhatsApp: '201066966515',
  consultantName: 'أحمد رمضان',
  consultantTitle: 'مستشار تطوير وحلول الأعمال',
  platformName: 'BIK Business Diagnostic Platform',
  version: '1.0.0-v1-public'
};

export const BIK_CONSULTANT_PUBLIC_WHATSAPP = APP_CONFIG.consultantWhatsApp;

/** Single source for the two approved prices (USD). Everything else derives from these. */
export const FOCUSED_WEEK_USD = 272;
export const MONTHLY_RETAINER_USD = 499;
export const EXECUTIVE_PROJECT_USD = 5000;
/** Owner-supplied indicative rates. Review manually before publishing and after material changes. */
export const FX_RATES_PER_USD = { USD: 1, SAR: 3.75, AED: 3.6725, QAR: 3.64, KWD: 0.307, EGP: 53 } as const;
export const FX_AS_OF = '2026-11-14';
/** تُقرأ العملة من هنا وحدها حتى لا يرتبط أي نص بعملة ثابتة. */
export const CURRENCY_LABEL = 'دولاراً';

/** وحدات سعرية صغيرة مشتقة من الأسعار المعتمدة وحدها (تقسيم السعر: partitioned pricing). */
export const RETAINER_PER_DAY_USD = Math.ceil(MONTHLY_RETAINER_USD / 30);
export const FOCUSED_WEEK_PER_DAY_USD = Math.ceil(FOCUSED_WEEK_USD / 7);
/** عتبة «الدفع لن يضغط على سيولته»: هدر شهري مصرَّح به يغطي قيمة المشروع التنفيذي مرتين فأكثر. */
export const EXECUTIVE_LOSS_THRESHOLD_USD = EXECUTIVE_PROJECT_USD * 2;
export const OFFER_GAP_LINE = 'الفارق بين هذه البطاقات ليس فرق سعر فقط: إنه حجم القرار الذي تريد أن يقود عنك. المشكلة تستمر بكلفتها الشهرية حتى تُعالج.';
export const BIK_REFUND_POLICY = 'يُرد المبلغ إذا كان تقييمك لاستشارتنا أو عملنا أقل من 85%، أو إذا لم يتم العمل. يُخصم رسم إداري فقط، ولا يُخصم أي مبلغ مقابل العمل.';

/** الأسعار المشتقة تُعرض بأرقام هندية (١٧) في كل مكان يظهر فيها للعميل. */
const toArabicIndic = (value: number) => String(value).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

export const BIK_OFFERS = {
  executiveProject: { freeCallMinutes: 40, name: 'التعاقد الاستشاري التنفيذي للمشروع', price: `${EXECUTIVE_PROJECT_USD} ${CURRENCY_LABEL} شهرياً`, priceFigure: `${toArabicIndic(EXECUTIVE_PROJECT_USD)} شهرياً`, scope: 'مشروع أزمتك نفسه في يد من يقوده عنك: الأزمة القائمة، الأزمة الكامنة، أو الصفقة الكبرى أمام جهة أخرى.',
    includes: [
      'أكثر من 550 ساعة عمل تنفيذي خلال الشهر',
      'هدف عائد عشرة أضعاف الأتعاب، يُقاس من مستنداتك المالية قبل العمل وبعده، ويشمل التدفق النقدي أو الإيراد أو خفض التكلفة أو الإنتاجية بحسب نشاطك.',
      'هو هدف نعمل عليه لا ضمان نتيجة.'
    ] },
  monthlyRetainer: { freeCallMinutes: 15, name: 'المستشار في منصبك — تعاقد شهري', price: `${MONTHLY_RETAINER_USD} ${CURRENCY_LABEL} شهرياً`, priceFigure: `${toArabicIndic(MONTHLY_RETAINER_USD)} شهرياً`, perDayNote: `أقل من ${toArabicIndic(RETAINER_PER_DAY_USD)} ${CURRENCY_LABEL} في اليوم`, scope: 'لا ينتظر أن تسأله: يفكر مكانك في القرار الذي تؤجله، ويتابع مسؤولي التنفيذ عنك.',
    includes: [
      'نطاق وإيقاع عمل مكتوبان حسب حالة كل شركة.',
      'دون سقف لعدد المكالمات: يتواصل المستشار مع مسؤولي الأقسام المعنية بالتنفيذ، ويشرف عليهم ويتابع عملهم.',
      'يُحضّر لك قراراتك الكبرى: يدرس البدائل، يقارن الأرقام، ويقترح الخيار الجريء المنطقي.'
    ] },
  focusedWeek: { freeCallMinutes: 15, name: 'أسبوع استشاري مُركَّز', price: `${FOCUSED_WEEK_USD} ${CURRENCY_LABEL}`, priceFigure: toArabicIndic(FOCUSED_WEEK_USD), scope: 'أسبوع واحد يُحسم فيه قرار واحد كنت تؤجله: نتحقق من الأدلة معاً، ثم ننتهي بقرار محسوم لا بملاحظات معلقة.',
    includes: [
      'ثلاث جلسات عميقة مع أ/ أحمد، مدة كل منها من 45 إلى 180 دقيقة بحسب التشخيص، والأخيرة تُختتم بقرار.',
      'داخل مصر: يأتيك في مقر شركتك ويرى العمل بعينه قبل أن يعلّق عليه.',
      'تخرج الأسبوع بثلاثة: قرار محسوم، وتشخيص للخلل الجذري، وعرض قيمة جاهز لنقاشه مع فريقك.'
    ] }
} as const;

export const BIK_EXECUTIVE_REPORT_WHATSAPP_MESSAGE = 'مرحباً، أكملت تشخيص شركتي عبر BIK وأرغب في مناقشة التقرير التنفيذي وتحديد أهم الأولويات.';
export const BIK_GENERAL_CONTACT_WHATSAPP_MESSAGE = 'مرحباً أستاذ أحمد، تعرفت على خدماتك عبر BIK وأرغب في مناقشة احتياجات نشاطي والخطوة المناسبة.';
export const BIK_CONSULTANT_REPORT_HANDOFF_MESSAGE = 'مرحباً، أكملت تشخيص شركتي عبر BIK وأرغب في مناقشة التقرير التنفيذي وتحديد أهم الأولويات.';
export const BIK_FREE_CALL_MESSAGE = 'مرحباً أستاذ أحمد، أرغب في حجز موعد مكالمتي المجانية (15 دقيقة) عبر BIK، وأحتاج أن أرسل لك التقرير قبل الموعد لقراءته مسبقاً.';

export interface SessionHandoffSummary {
  userName?: string;
  companyName?: string;
  country?: string;
  city?: string;
  sector?: string;
  sectorL1?: string;
  sectorL2?: string;
  score?: number;
  healthScore?: number;
  healthLabel?: string;
  coverage?: number;
  confidence?: string;
  strongestFinding?: string;
  rootCause?: string;
  topPriority?: string;
  businessConsequence?: string;
  financialStatus?: string;
}

/**
 * Constructs the canonical WhatsApp executive message from real diagnostic session data.
 * Formatted for maximum clarity to consultant Ahmed Ramadan without leaking raw financial
 * ledgers or private QA option codes into the URL.
 * Strictly adheres to truth in data: missing fields are omitted rather than fabricated.
 */
export function buildWhatsAppExecutiveMessage(data: SessionHandoffSummary): string {
  const sections: string[] = ['BIK — تشخيص شركة'];

  // 1. Identity & Location
  const identityLines: string[] = [];
  if (data.userName?.trim()) {
    identityLines.push(`اسم العميل: ${data.userName.trim()}`);
  }
  if (data.companyName?.trim()) {
    identityLines.push(`الشركة: ${data.companyName.trim()}`);
  }
  const locationParts = [data.country?.trim(), data.city?.trim()].filter(
    (s): s is string => Boolean(s && s !== 'غير محدد')
  );
  if (locationParts.length > 0) {
    identityLines.push(`الموقع: ${locationParts.join(' / ')}`);
  }
  const sectorText = data.sectorL1?.trim() || data.sector?.trim();
  if (sectorText) {
    identityLines.push(`القطاع: ${sectorText}`);
  }
  if (data.sectorL2?.trim()) {
    identityLines.push(`نوع النشاط: ${data.sectorL2.trim()}`);
  }
  if (identityLines.length > 0) {
    sections.push(identityLines.join('\n'));
  }

  // 2. Diagnostic Metrics
  const metricLines: string[] = [];
  const scoreVal = typeof data.healthScore === 'number' ? data.healthScore : data.score;
  // NaN is a number to typeof: only a finite score is a score. An uncomputed score prints nothing.
  if (typeof scoreVal === 'number' && Number.isFinite(scoreVal)) {
    metricLines.push(`مؤشر التشخيص: ${scoreVal}/100`);
  }
  if (typeof data.coverage === 'number' && Number.isFinite(data.coverage)) {
    metricLines.push(`التغطية: ${data.coverage}%`);
  }
  if (data.confidence?.trim()) {
    metricLines.push(`الثقة: ${data.confidence.trim()}`);
  }
  if (metricLines.length > 0) {
    sections.push(metricLines.join('\n'));
  }

  // 3. Core Findings & Root Cause (Aha Moment)
  if (data.strongestFinding?.trim()) {
    sections.push(`أبرز ما كشفه التشخيص:\n${data.strongestFinding.trim()}`);
  }
  if (data.rootCause?.trim()) {
    sections.push(`الأصل الجذري:\n${data.rootCause.trim()}`);
  }

  // 4. Primary Next Action & Impact
  if (data.topPriority?.trim()) {
    sections.push(`الأولوية الأولى:\n${data.topPriority.trim()}`);
  }
  if (data.businessConsequence?.trim()) {
    sections.push(`الأثر:\n${data.businessConsequence.trim()}`);
  }

  // 5. Financial Status (Safe, high-level status only; no raw numbers)
  if (data.financialStatus?.trim()) {
    sections.push(`البيانات المالية:\n${data.financialStatus.trim()}`);
  }

  // 6. Action Closing
  sections.push('أرغب في مناقشة نتائج التشخيص مع أ/ أحمد.');

  return sections.join('\n\n');
}

/**
 * Builds a standard public wa.me URL for executive WhatsApp consultation.
 * Follows the strict V1 privacy contract:
 * - NO financial data in the URL
 * - NO private diagnostic answers in the URL
 * - Clean standard wa.me direct client link
 */
export function buildConsultantWhatsAppUrl(options?: {
  companyName?: string;
  score?: number;
  sessionRef?: string;
  topic?: string;
  customMessage?: string;
  isExecutiveReportCTA?: boolean;
  isReportDeliveryCTA?: boolean;
  sessionHandoff?: SessionHandoffSummary;
}): { url: string; isConfigured: boolean; displayNotice?: string; messageText?: string } {
  const rawNumber = (APP_CONFIG.consultantWhatsApp || '').trim().replace(/[^0-9]/g, '');

  if (!rawNumber) {
    return {
      url: '',
      isConfigured: false,
      displayNotice: 'رقم واتساب المستشار غير مهيأ حالياً. يرجى المحاولة لاحقاً.'
    };
  }

  let message = BIK_GENERAL_CONTACT_WHATSAPP_MESSAGE;

  if (options?.customMessage) {
    message = options.customMessage;
  } else if (options?.sessionHandoff) {
    message = buildWhatsAppExecutiveMessage(options.sessionHandoff);
    if (options?.sessionRef) {
      const cleanRef = options.sessionRef.slice(0, 8);
      message += `\n\n[مرجع الجلسة: ${cleanRef}]`;
    }
  } else if (options?.isExecutiveReportCTA || options?.isReportDeliveryCTA) {
    message = BIK_EXECUTIVE_REPORT_WHATSAPP_MESSAGE;
  } else if (options?.companyName) {
    message = `مرحباً أستاذ أحمد، أكملت تشخيص شركة (${options.companyName}) عبر منصة BIK وأرغب في مناقشة التقرير التنفيذي وحجز استشارة استراتيجية.`;
    if (options?.topic) {
      message += ` الموضوع: ${options.topic}.`;
    }
    if (options?.sessionRef) {
      const cleanRef = options.sessionRef.slice(0, 8);
      message += ` [مرجع الجلسة: ${cleanRef}]`;
    }
  } else {
    if (options?.topic) {
      message += ` الموضوع: ${options.topic}.`;
    }
    if (options?.sessionRef) {
      const cleanRef = options.sessionRef.slice(0, 8);
      message += ` [مرجع الجلسة: ${cleanRef}]`;
    }
  }

  return {
    url: `https://wa.me/${rawNumber}?text=${encodeURIComponent(message)}`,
    isConfigured: true,
    messageText: message
  };
}
