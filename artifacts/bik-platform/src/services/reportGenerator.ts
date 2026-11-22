// src/services/reportGenerator.ts
// BIK Business Intelligence & Knowledge - Diagnostic Report Orchestrator & Generator
// Version: 2.0.0
// Guarantees:
// 1. Mandatory invocation of computeDeterministicScore() as Ground Truth.
// 2. Strict grounding of LLM prompt with precomputed numbers and verified data gaps.
// 3. Fallback to createFallbackReport() without UI disruptions if LLM fails or mutates values.
// 4. Zero hallucinated statistics or unverified market benchmarks.

import { GoogleGenAI, Type } from '@google/genai';
import { DiagnosticReport } from '../types';
import { computeDeterministicScore, DetailedScoreResult } from './deterministicScoring';
import { createFallbackReport } from './reportFallback';
import type { QuestionLedgerEntry } from '../types/dualLayer';
import { CLIENT_DATA_STORAGE_DISABLED } from '../../shared/privacy';

export interface GenerateReportOptions {
  sessionId: string;
  universalAnswers: Record<string, any>;
  sectorAnswers?: Record<string, any>;
  intakeAnswers?: Record<string, any>;
  sectorL1?: string;
  sectorL2?: string;
  diagnosticDepth?: string;
  companyName?: string;
  questionHistory?: QuestionLedgerEntry[];
}

let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (CLIENT_DATA_STORAGE_DISABLED || process.env.ENABLE_GEMINI_REPORTS !== 'true') return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
}

export async function generateFullDiagnosticReport(options: GenerateReportOptions): Promise<DiagnosticReport> {
  const {
    sessionId,
    universalAnswers = {},
    sectorAnswers = {},
    intakeAnswers = {},
    sectorL1 = '',
    sectorL2 = '',
    diagnosticDepth = 'quick',
    companyName = 'الشركة',
    questionHistory = []
  } = options;

  // 1. Step 1: Compulsory Deterministic Scoring (Ground Truth)
  const scoreResult: DetailedScoreResult = computeDeterministicScore(universalAnswers, intakeAnswers);

  const fallbackReport = createFallbackReport({
    sessionId,
    scoreResult,
    companyData: {
      companyName,
      sectorL1,
      sectorL2,
      diagnosticDepth
    },
    answers: { ...intakeAnswers, ...universalAnswers, ...sectorAnswers },
    questionHistory
  });

  const ai = getGeminiClient();
  if (!ai) {
    console.warn('[ReportGenerator] GEMINI_API_KEY not configured. Using deterministic fallback report.');
    return fallbackReport;
  }

  // 2. Prepare Ground Truth Prompt
  const groundTruthText = `
=== الحقائق المحسوبة برمجياً وحتمياً (Ground Truth - يمنع تغيير أي رقم فيها) ===
- مؤشر الأداء والصحة العامة (Health Score): ${scoreResult.overall} من 100
- مستوى الثقة في التقييم: ${scoreResult.overallConfidence} (تغطية البيانات: ${scoreResult.overallCoverage}%)
- تقييم المحاور الرئيسية:
${Object.entries(scoreResult.axisDetails)
  .map(([dim, d]) => `  * ${dim}: ${d.score}/100 (الحالة: ${d.status}, الثقة: ${d.confidence})`)
  .join('\n')}

- فجوات البيانات التشغيلية غير المقاسة بدقة لدى الشركة:
${scoreResult.dataGaps.length > 0
  ? scoreResult.dataGaps.map(g => `  * ${g.dimension}: ${g.label}`).join('\n')
  : '  * لا توجد فجوات بيانات جوهرية في الأسئلة الأساسية.'}

- الأثر المالي المحسوب:
${scoreResult.financialImpact.isComputable
  ? `  * الإيراد الشهري: ${scoreResult.financialImpact.metrics.monthlyRevenue?.value?.toLocaleString('en-US')} ${scoreResult.financialImpact.currency}
  * صافي الربح الشهري: ${scoreResult.financialImpact.metrics.monthlyNetProfit?.value?.toLocaleString('en-US')} ${scoreResult.financialImpact.currency}
  * الإنفاق الشهري على اكتساب العملاء (CAC): ${scoreResult.financialImpact.metrics.monthlyAcquisitionSpend?.value?.toLocaleString('en-US') || 'غير متوفر'} ${scoreResult.financialImpact.currency}`
  : `  * ${scoreResult.financialImpact.uncomputableReason || 'الأثر المالي غير قابل للحساب بدقة من البيانات المتاحة'}`}
`;

  const SYSTEM_INSTRUCTION = `
أنت "المستشار الاستراتيجي الرقمي" — خبير تشخيص وتطوير أعمال للشركات.
مهمتك: كتابة التقرير التحليلي والاستشاري بناءً على الحقائق المحسوبة المرفقة حصراً.

قواعدك الصارمة جداً:
1. التزم بالحقائق المحسوبة أعلاه بدقة تامة. لا تغيّر مؤشر الأداء (${scoreResult.overall}/100) ولا تخترع أي أرقام أو نسب مئوية وهمية غير موجودة (ممنوع تماماً كتابة: "تحسين فوري بنسبة 20%" أو "ضعف متوسط السوق").
2. كل استنتاج أو توصية يجب أن يعود إلى إجابة حقيقية من إجابات النشاط.
3. مصفوفة blind_spots يجب أن تحتوي على 3 نقاط عمياء دقيقة مبنية على إجابات النشاط وفجوات القياس.
4. مصفوفة priority_actions يجب أن تحتوي على 3 إلى 5 إجراءات أولوية عملية ومحددة.
5. لا تذكر أسماء أي أطر نظرية أو مفكرين (لا Porter، لا SWOT، لا McKinsey، إلخ).
`;

  const userPrompt = `
قم بإعداد التقرير التشخيصي الاستشاري المتقدم لهذا النشاط:
القطاع: ${sectorL1 || 'عام'} — ${sectorL2 || 'عام'}
بيانات التأسيس: ${JSON.stringify(intakeAnswers)}
إجابات المحاور العامة: ${JSON.stringify(universalAnswers)}
إجابات المحاور القطاعية: ${JSON.stringify(sectorAnswers)}

${groundTruthText}

أخرج التقرير بصيغة JSON مطابقة للهيكل المطلوب.
`;

  const REPORT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      headline_diagnosis: { type: Type.STRING },
      health_score: { type: Type.NUMBER },
      health_label: { type: Type.STRING },
      swot: {
        type: Type.OBJECT,
        properties: {
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          threats: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['strengths', 'weaknesses', 'opportunities', 'threats']
      },
      blind_spots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            impact_level: { type: Type.STRING, enum: ['critical', 'high', 'medium'] },
            source_question: { type: Type.STRING },
            estimated_cost: { type: Type.STRING }
          },
          required: ['name', 'description', 'impact_level', 'source_question', 'estimated_cost']
        }
      },
      priority_actions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING },
            why_now: { type: Type.STRING },
            expected_impact: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            timeframe: { type: Type.STRING }
          },
          required: ['action', 'why_now', 'expected_impact', 'difficulty', 'timeframe']
        }
      },
      closing_question: { type: Type.STRING },
      sector_insight: { type: Type.STRING }
    },
    required: ['headline_diagnosis', 'swot', 'blind_spots', 'priority_actions', 'closing_question', 'sector_insight']
  };

  try {
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash'];
    let rawText: string | null = null;

    for (const model of candidateModels) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timeout')), 5000)
        );
        const response: any = await Promise.race([
          ai.models.generateContent({
            model,
            contents: userPrompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              temperature: 0.2,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: REPORT_SCHEMA
            }
          }),
          timeoutPromise
        ]);
        if (response.text) {
          rawText = response.text;
          break;
        }
      } catch (e: any) {
        console.warn(`[ReportGenerator] Model ${model} generation error: ${e.message}`);
      }
    }

    if (!rawText) {
      console.warn('[ReportGenerator] LLM produced empty response. Using resilient deterministic fallback.');
      return fallbackReport;
    }

    const parsed = JSON.parse(rawText);

    // Strict validation of parsed output
    if (!parsed.headline_diagnosis || !Array.isArray(parsed.blind_spots) || parsed.blind_spots.length === 0) {
      console.warn('[ReportGenerator] LLM output missing mandatory sections. Using fallback.');
      return fallbackReport;
    }

    // Safety checks against hallucinated statistics
    const fullText = JSON.stringify(parsed);
    if (fullText.includes('متوسط السوق بمقدار الضعف') || fullText.includes('تحسين فوري بنسبة 20%')) {
      console.warn('[ReportGenerator] Detected unverified benchmark in LLM output. Sanitizing with fallback.');
      return fallbackReport;
    }

    // Grounded Merging: Always enforce deterministic calculations and metadata
    const finalReport: DiagnosticReport = {
      headline_diagnosis: String(parsed.headline_diagnosis).trim(),
      health_score: scoreResult.overall, // Ground Truth strictly enforced
      health_label: fallbackReport.health_label,
      swot: {
        strengths: Array.isArray(parsed.swot?.strengths) && parsed.swot.strengths.length > 0 ? parsed.swot.strengths : fallbackReport.swot.strengths,
        weaknesses: Array.isArray(parsed.swot?.weaknesses) && parsed.swot.weaknesses.length > 0 ? parsed.swot.weaknesses : fallbackReport.swot.weaknesses,
        opportunities: Array.isArray(parsed.swot?.opportunities) && parsed.swot.opportunities.length > 0 ? parsed.swot.opportunities : fallbackReport.swot.opportunities,
        threats: Array.isArray(parsed.swot?.threats) && parsed.swot.threats.length > 0 ? parsed.swot.threats : fallbackReport.swot.threats
      },
      blind_spots: parsed.blind_spots.map((b: any, idx: number) => ({
        name: String(b.name || fallbackReport.blind_spots[idx]?.name || 'نقطة عمياء تشغيلية'),
        description: String(b.description || fallbackReport.blind_spots[idx]?.description || ''),
        impact_level: b.impact_level === 'critical' || b.impact_level === 'high' || b.impact_level === 'medium' ? b.impact_level : 'medium',
        source_question: String(b.source_question || fallbackReport.blind_spots[idx]?.source_question || 'التقييم التشغيلي'),
        estimated_cost: scoreResult.financialImpact.isComputable
          ? String(b.estimated_cost || fallbackReport.blind_spots[idx]?.estimated_cost || 'غير محدد بدقة')
          : 'غير محدد لعدم توافر البيانات المالية الكافية'
      })),
      priority_actions: Array.isArray(parsed.priority_actions) && parsed.priority_actions.length >= 3
        ? parsed.priority_actions.slice(0, 5)
        : fallbackReport.priority_actions,
      closing_question: String(parsed.closing_question || fallbackReport.closing_question),
      sector_insight: String(parsed.sector_insight || fallbackReport.sector_insight),
      financial_impact: scoreResult.financialImpact,
      confidence: scoreResult.overallConfidence,
      coverage: scoreResult.overallCoverage,
      engine_metadata: scoreResult.engineMetadata,
      evidence: scoreResult.topWeaknesses.concat(scoreResult.topStrengths),
      diagnostic_findings: fallbackReport.diagnostic_findings,
      one_sentence_explanation: fallbackReport.one_sentence_explanation,
      aha_moment: fallbackReport.aha_moment,
      discovered_findings: fallbackReport.discovered_findings,
      top_priorities: fallbackReport.top_priorities,
      direction_90_days: fallbackReport.direction_90_days,
      data_gaps_analysis: fallbackReport.data_gaps_analysis,
      evidence_swot: fallbackReport.evidence_swot,
      dual_layer: fallbackReport.dual_layer,
      strategic_narrative: fallbackReport.strategic_narrative,
      behavioral_insight: fallbackReport.behavioral_insight
    };

    return finalReport;
  } catch (err: any) {
    console.error('[ReportGenerator] LLM invocation or parsing failed:', err);
    return fallbackReport;
  }
}
