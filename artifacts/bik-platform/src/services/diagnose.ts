import { DiagnosticStore } from "../store/diagnosticStore";
import { DiagnosticReport } from "../types";
import { computeDeterministicScore } from "./deterministicScoring";
import { createFallbackReport } from "./reportFallback";

export async function generateDiagnosticReport(
  store: DiagnosticStore
): Promise<DiagnosticReport> {
  // u30 is retained in the session ledger for the dossier only. It is deliberately
  // omitted from every input consumed by score, coverage, finance or causal rules.
  const { u30: _reflectiveOnly, ...diagnosticAnswers } = store.universalAnswers || {};
  const scoreResult = computeDeterministicScore(diagnosticAnswers, store.intakeAnswers);
  return createFallbackReport({
    review: store.review,
    sessionId: store.sessionId,
    scoreResult,
    companyData: {
      companyName: store.companyName,
      sectorL1: store.sectorL1,
      sectorL2: store.sectorL2,
      diagnosticDepth: store.diagnosticDepth
    },
    answers: {
      ...store.intakeAnswers,
      ...diagnosticAnswers,
      ...store.sectorAnswers
    },
    questionHistory: store.questionHistory
  });
}

export async function generateProposal(
  report: DiagnosticReport,
  userName: string,
  companyName: string,
  sectorL2: string
): Promise<string> {
  try {
    const response = await fetch("/_bik-api/proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, userName, companyName, sectorL2 })
    });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.proposal === 'string' && data.proposal.trim()) return data.proposal;
    }
  } catch (error) {
    void error;
  }
  const priorities = Array.isArray(report.priority_actions) ? report.priority_actions : [];
  const priorityText = priorities.slice(0, 3).map((item: any, index: number) =>
    `${index + 1}. ${item.action || 'مراجعة نقطة تشغيلية رئيسية'} — ${item.timeframe || 'يُحدد بعد جلسة التحقق'}`
  ).join('\n');
  const confidenceNote = report.coverage !== undefined
    ? `درجة تغطية البيانات الحالية ${report.coverage}%؛ لذلك تُراجع الأولويات معك قبل اعتماد نطاق العمل.`
    : 'يُستكمل تحديد نطاق العمل بعد مراجعة البيانات المتبقية.';
  return [
    `مقترح أولي لـ ${companyName || 'نشاطك'} في قطاع ${sectorL2 || 'الأعمال'}${userName ? ` — ${userName}` : ''}`,
    report.health_score_computed === false
      ? 'لا تتوافر بيانات كافية لحساب مؤشر موثوق، لذلك لا يُعرض رقم. نبدأ بتحديد الأولويات ثم استكمال البيانات الناقصة.'
      : `أظهر الفحص مؤشراً قدره ${report.health_score}/100. لا يمثل هذا الرقم حكماً نهائياً أو ضماناً مالياً، بل نقطة بداية لتحديد الأولويات.`,
    'الأولويات المقترحة للمناقشة:',
    priorityText || 'تثبيت البيانات الأساسية ثم تحديد الاختناق التشغيلي الأعلى أثراً.',
    confidenceNote,
    'الخدمة المناسبة مبدئياً: جلسة تشخيص ومراجعة أولويات، يليها نطاق عمل شهري مرتبط بمؤشرات أداء يتم الاتفاق عليها بعد التحقق.'
  ].join('\n');
}
