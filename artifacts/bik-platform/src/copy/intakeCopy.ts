import type { Dialect } from '../services/dialect';
import saudiIntake from './saudi_intake.json';

type IntakeEntry = { kind: 'heading' | 'label' | 'option' | 'hint' | 'button'; fusha: string; value?: string };

export const INTAKE_COPY_ENTRIES = {
  "history.heading": { kind: "heading", fusha: "القسم 2: التاريخ والخبرة" },
  "history.whyHeading": { kind: "heading", fusha: "لماذا نسأل" },
  "history.why": { kind: "hint", fusha: "طريق شركتك حتى اليوم يفسّر ما تواجهه الآن: التحولات وسنوات الخبرة تخبرنا أين مكمن القوة الذي يُبنى عليه القرار." },
  "history.companyAge": { kind: "label", fusha: "عمر الشركة" },
  "history.age.underYear": { kind: "option", fusha: "أقل من سنة", value: "أقل من سنة" },
  "history.age.oneToThree": { kind: "option", fusha: "سنة إلى أقل من 3 سنوات", value: "1-3 سنوات" },
  "history.age.threeToSeven": { kind: "option", fusha: "3 إلى أقل من 7 سنوات", value: "3-7 سنوات" },
  "history.age.sevenOrMore": { kind: "option", fusha: "7 سنوات فأكثر", value: "أكثر من 7 سنوات" },
  "history.founderExperience": { kind: "label", fusha: "خبرتك في المجال" },
  "history.experience.underThree": { kind: "option", fusha: "أقل من 3 سنوات", value: "أقل من 3" },
  "history.experience.threeToSeven": { kind: "option", fusha: "3 إلى أقل من 7 سنوات", value: "3-7" },
  "history.experience.sevenToFifteen": { kind: "option", fusha: "7 إلى أقل من 15 سنة", value: "7-15" },
  "history.experience.fifteenOrMore": { kind: "option", fusha: "15 سنة فأكثر", value: "أكثر من 15 سنة" },
  "history.businessMotivation": { kind: "label", fusha: "ما الذي دفعك لاختيار هذا النشاط؟ (اختر ما ينطبق)" },
  "history.motivation.experience": { kind: "option", fusha: "خبرة سابقة", value: "خبرة سابقة" },
  "history.motivation.market": { kind: "option", fusha: "رؤية سوقية", value: "رؤية سوقية" },
  "history.motivation.family": { kind: "option", fusha: "ميراث عائلي", value: "ميراث عائلي" },
  "history.motivation.opportunity": { kind: "option", fusha: "فرصة ظهرت", value: "فرصة ظهرت" },
  "history.motivation.passion": { kind: "option", fusha: "شغف شخصي", value: "شغف شخصي" },
  "history.motivation.other": { kind: "option", fusha: "أخرى", value: "أخرى" },
  "planning.heading": { kind: "heading", fusha: "القسم 3: التخطيط الأولي" },
  "planning.whyHeading": { kind: "heading", fusha: "لماذا نسأل" },
  "planning.why": { kind: "hint", fusha: "ما خططت له قبل البدء، ومدى تطابقه مع الواقع، يساعداننا على قراءة أرقامك بما يناسب شركتك." },
  "planning.modelsApplied": { kind: "label", fusha: "هل طبقت أياً من هذه قبل البدء؟" },
  "planning.model.marketResearch": { kind: "option", fusha: "أبحاث سوقية", value: "أبحاث سوقية" },
  "planning.model.canvas": { kind: "option", fusha: "نموذج عمل Business Model Canvas", value: "نموذج عمل Business Model Canvas" },
  "planning.model.businessPlan": { kind: "option", fusha: "خطة عمل Business Plan", value: "خطة عمل Business Plan" },
  "planning.model.marketing": { kind: "option", fusha: "استراتيجية تسويقية", value: "استراتيجية تسويقية" },
  "planning.model.competitors": { kind: "option", fusha: "تحليل منافسين", value: "تحليل منافسين" },
  "planning.model.feasibility": { kind: "option", fusha: "دراسة جدوى مالية", value: "دراسة جدوى مالية" },
  "planning.model.none": { kind: "option", fusha: "لم أطبق أياً من الأعلى", value: "لم أطبق أياً من الأعلى" },
  "planning.modelSuccessRate": { kind: "label", fusha: "نسبة تطابق الواقع مع ما خططت له:" },
  "planning.successRateMin": { kind: "hint", fusha: "0% (مختلف تماماً)" },
  "planning.successRateMax": { kind: "hint", fusha: "100% (تطابق تام)" },
  "finance.heading": { kind: "heading", fusha: "القسم 4: الصحة المالية" },
  "finance.whyHeading": { kind: "heading", fusha: "لماذا نسأل" },
  "finance.why": { kind: "hint", fusha: "تساعد بيانات هذا القسم على قراءة الوضع المالي من إجاباتك. تُعالج في المتصفح ولا يتلقاها خادم BIK لتوليد التقرير؛ وما يصل إلى المستشار هو ما ترسله أنت عبر واتساب." },
  "finance.breakEven": { kind: "label", fusha: "هل حققت نقطة التعادل (Break Even)؟" },
  "finance.breakEvenChoice.yes": { kind: "option", fusha: "نعم", value: "نعم" },
  "finance.breakEvenChoice.notYet": { kind: "option", fusha: "لا بعد", value: "لا بعد" },
  "finance.breakEvenTime": { kind: "label", fusha: "كم استغرق ذلك؟" },
  "finance.breakEvenPeriod.underSixMonths": { kind: "option", fusha: "أقل من 6 أشهر", value: "أقل من 6 أشهر" },
  "finance.breakEvenPeriod.sixToTwelveMonths": { kind: "option", fusha: "6 أشهر إلى أقل من سنة", value: "6-12 شهراً" },
  "finance.breakEvenPeriod.oneToTwoYears": { kind: "option", fusha: "سنة إلى سنتين", value: "1-2 سنة" },
  "finance.breakEvenPeriod.overTwoYears": { kind: "option", fusha: "أكثر من سنتين", value: "أكثر من سنتين" },
  "finance.roi": { kind: "label", fusha: "معدل العائد على الاستثمار (ROI) منذ التأسيس" },
  "finance.roiChoice.loss": { kind: "option", fusha: "خسارة حتى الآن", value: "خسارة حتى الآن" },
  "finance.roiChoice.zeroToTen": { kind: "option", fusha: "0-10%", value: "0-10%" },
  "finance.roiChoice.tenToThirty": { kind: "option", fusha: "10-30%", value: "10-30%" },
  "finance.roiChoice.thirtyToHundred": { kind: "option", fusha: "30-100%", value: "30-100%" },
  "finance.roiChoice.overHundred": { kind: "option", fusha: "أكثر من 100%", value: "أكثر من 100%" },
  "finance.roiChoice.unknown": { kind: "option", fusha: "لا أحسبه", value: "لا أحسبه" },
  "finance.hasDebt": { kind: "label", fusha: "هل لدى شركتك قروض أو التزامات خارجية؟" },
  "finance.debtChoice.no": { kind: "option", fusha: "لا", value: "لا" },
  "finance.debtChoice.yes": { kind: "option", fusha: "نعم", value: "نعم" },
  "finance.debtDuration": { kind: "label", fusha: "إجمالي الديون كعدد أشهر من إيراداتك" },
  "finance.debtPeriod.underThree": { kind: "option", fusha: "أقل من 3", value: "أقل من 3" },
  "finance.debtPeriod.threeToSix": { kind: "option", fusha: "3 إلى أقل من 6", value: "3-6" },
  "finance.debtPeriod.sixToTwelve": { kind: "option", fusha: "6 إلى أقل من 12", value: "6-12" },
  "finance.debtPeriod.twelveOrMore": { kind: "option", fusha: "12 فأكثر", value: "أكثر من 12" },
  "finance.debtMonthlyPct": { kind: "label", fusha: "الأقساط الشهرية كنسبة من إيراداتك:" },
  "finance.fixedCostsPct": { kind: "label", fusha: "إجمالي تكاليفك الثابتة الشهرية كنسبة من إيراداتك:" },
  "market.heading": { kind: "heading", fusha: "القسم 5: التنافسية والسوق" },
  "market.whyHeading": { kind: "heading", fusha: "لماذا نسأل" },
  "market.why": { kind: "hint", fusha: "السوق الذي تتنافس فيه يحدد ما يُعدّ انتصاراً: هنا يُضبط ميزان المقارنة قبل أن تُقرأ أرقامك." },
  "market.competitors": { kind: "label", fusha: "من أقوى منافسيك؟ (اختياري)" },
  "market.competitor.first": { kind: "hint", fusha: "المنافس الأول" },
  "market.competitor.second": { kind: "hint", fusha: "المنافس الثاني" },
  "market.competitor.third": { kind: "hint", fusha: "المنافس الثالث" },
  "market.differentiators": { kind: "label", fusha: "ما الذي يميزك عنهم؟" },
  "market.difference.price": { kind: "option", fusha: "السعر الأقل", value: "السعر الأقل" },
  "market.difference.quality": { kind: "option", fusha: "الجودة الأعلى", value: "الجودة الأعلى" },
  "market.difference.speed": { kind: "option", fusha: "السرعة", value: "السرعة" },
  "market.difference.location": { kind: "option", fusha: "الموقع الجغرافي", value: "الموقع الجغرافي" },
  "market.difference.relationship": { kind: "option", fusha: "العلاقة الشخصية", value: "العلاقة الشخصية" },
  "market.difference.speciality": { kind: "option", fusha: "التخصص الدقيق", value: "التخصص الدقيق" },
  "market.difference.afterSales": { kind: "option", fusha: "ما بعد البيع", value: "ما بعد البيع" },
  "market.difference.unknown": { kind: "option", fusha: "لا أعرف بالضبط", value: "لا أعرف بالضبط" },
  "market.geographicScope": { kind: "label", fusha: "النطاق الجغرافي لعملك" },
  "market.scope.local": { kind: "option", fusha: "محلي مدينة واحدة", value: "محلي مدينة واحدة" },
  "market.scope.regional": { kind: "option", fusha: "إقليمي عدة مدن", value: "إقليمي عدة مدن" },
  "market.scope.national": { kind: "option", fusha: "وطني", value: "وطني" },
  "market.scope.gulfOrAfrica": { kind: "option", fusha: "خليجي أو أفريقي", value: "خليجي أو أفريقي" },
  "market.scope.international": { kind: "option", fusha: "دولي", value: "دولي" },
  "form.submit": { kind: "button", fusha: "ابدأ التشخيص الكامل" },
  "form.incomplete": { kind: "hint", fusha: "أكمل جميع الحقول المطلوبة للمتابعة" },
} as const satisfies Record<string, IntakeEntry>;

type IntakeKey = keyof typeof INTAKE_COPY_ENTRIES;
type OptionKey = {
  [Key in IntakeKey]: 'value' extends keyof (typeof INTAKE_COPY_ENTRIES)[Key] ? Key : never
}[IntakeKey];

export const INTAKE_OPTION_GROUPS = {
  companyAge: [
    "history.age.underYear", "history.age.oneToThree", "history.age.threeToSeven", "history.age.sevenOrMore",
  ],
  founderExperience: [
    "history.experience.underThree", "history.experience.threeToSeven", "history.experience.sevenToFifteen", "history.experience.fifteenOrMore",
  ],
  businessMotivation: [
    "history.motivation.experience", "history.motivation.market", "history.motivation.family", "history.motivation.opportunity", "history.motivation.passion", "history.motivation.other",
  ],
  modelsApplied: [
    "planning.model.marketResearch", "planning.model.canvas", "planning.model.businessPlan", "planning.model.marketing", "planning.model.competitors", "planning.model.feasibility",
  ],
  breakEven: [
    "finance.breakEvenChoice.yes", "finance.breakEvenChoice.notYet",
  ],
  breakEvenTime: [
    "finance.breakEvenPeriod.underSixMonths", "finance.breakEvenPeriod.sixToTwelveMonths", "finance.breakEvenPeriod.oneToTwoYears", "finance.breakEvenPeriod.overTwoYears",
  ],
  roi: [
    "finance.roiChoice.loss", "finance.roiChoice.zeroToTen", "finance.roiChoice.tenToThirty", "finance.roiChoice.thirtyToHundred", "finance.roiChoice.overHundred", "finance.roiChoice.unknown",
  ],
  hasDebt: [
    "finance.debtChoice.no", "finance.debtChoice.yes",
  ],
  debtDuration: [
    "finance.debtPeriod.underThree", "finance.debtPeriod.threeToSix", "finance.debtPeriod.sixToTwelve", "finance.debtPeriod.twelveOrMore",
  ],
  differentiators: [
    "market.difference.price", "market.difference.quality", "market.difference.speed", "market.difference.location", "market.difference.relationship", "market.difference.speciality", "market.difference.afterSales",
  ],
  geographicScope: [
    "market.scope.local", "market.scope.regional", "market.scope.national", "market.scope.gulfOrAfrica", "market.scope.international",
  ],
} as const satisfies Record<string, readonly OptionKey[]>;

const overlays: Partial<Record<Dialect, Partial<Record<IntakeKey, string>>>> = {
  saudi: saudiIntake,
};

export function intakeCopy(dialect: Dialect) {
  const text = (key: IntakeKey) => overlays[dialect]?.[key] ?? INTAKE_COPY_ENTRIES[key].fusha;
  const option = (key: OptionKey) => ({ value: INTAKE_COPY_ENTRIES[key].value, label: text(key) });

  return {
    text,
    option,
    options: (group: keyof typeof INTAKE_OPTION_GROUPS) => INTAKE_OPTION_GROUPS[group].map(option),
  };
}
