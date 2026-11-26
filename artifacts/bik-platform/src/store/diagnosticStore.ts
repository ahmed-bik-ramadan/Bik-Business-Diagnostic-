import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DiagnosticReport } from '../types';
import { AxisDetail } from '../services/deterministicScoring';
import { QuestionLedgerEntry } from '../types/dualLayer';
import { emptyReviewState, type ReviewState } from '../services/reviewState';
import { sanitizeDiagnosticPersisted } from '../services/persistedStateSanitizer';

export type StartMode = 'analysis' | 'crisis';

export interface DiagnosticStore {
  review: ReviewState;
  sessionId: string;
  userName: string;
  companyName: string;
  whatsapp: string;
  leadSaveWarning?: boolean;
  sectorL1: string;
  sectorL2: string;
  startMode: StartMode;
  diagnosticDepth: 'quick' | 'deep';
  intakeAnswers: Record<string, string | number>;
  universalAnswers: Record<string, string | number>;
  sectorAnswers: Record<string, string | number>;
  currentStep: 'welcome' | 'sector' | 'intake' | 'universal' | 'sector-q' | 'processing' | 'gate' | 'report';
  universalProgress: number;
  sectorProgress: number;
  instantScore: number | null;
  axisScores: Record<string, number> | null;
  axisDetails: Record<string, AxisDetail> | null;
  overallConfidence: 'عالي' | 'متوسط' | 'منخفض' | null;
  overallCoverage: number | null;
  dataGaps: Array<{ questionId: string; label: string; dimension: string }>;
  report: DiagnosticReport | null;
  proposal: string | null;
  conversationHistory: Array<{ role: 'user' | 'model'; text: string }>;
  questionHistory: QuestionLedgerEntry[];
  setField: (key: string, value: any) => void;
  recordQuestionShown: (question: { id: string; question: string; dimension?: string; diagnosticRole?: string }) => void;
  recordQuestionAnswered: (questionId: string, answerValue: any, answerText: string) => void;
  recordQuestionSkipped: (questionId: string) => void;
  markUnansweredQuestions: () => void;
  /** Removes the most recent answer (and anything derived from it) so the client can change it. Returns its question id, or null. */
  undoLastAnswer: () => string | null;
  nextStep: () => void;
  reset: () => void;
}

export const useDiagnosticStore = create<DiagnosticStore>()(
  persist(
    (set, get) => ({
      sessionId: crypto.randomUUID(),
      userName: '',
      companyName: '',
      whatsapp: '',
      leadSaveWarning: false,
      sectorL1: '',
      sectorL2: '',
      startMode: 'analysis',
      diagnosticDepth: 'quick',
      intakeAnswers: {},
      universalAnswers: {},
      sectorAnswers: {},
      currentStep: 'welcome',
      universalProgress: 0,
      sectorProgress: 0,
      instantScore: null,
      axisScores: null,
      axisDetails: null,
      overallConfidence: null,
      overallCoverage: null,
      dataGaps: [],
      report: null,
      proposal: null,
      conversationHistory: [],
      questionHistory: [],
      review: emptyReviewState(),

      setField: (key, value) => set((state) => ({ ...state, [key]: value })),

      recordQuestionShown: (question) => set((state) => {
        // Deterministic check: do not create duplicate entries if already shown/recorded
        const existing = state.questionHistory.find(q => q.questionId === question.id);
        if (existing) {
          return state;
        }
        const sequence = state.questionHistory.length + 1;
        const newEntry: QuestionLedgerEntry = {
          sequence,
          questionId: question.id,
          questionText: question.question,
          dimension: question.dimension,
          diagnosticRole: question.diagnosticRole,
          shownAt: Date.now(),
          status: 'shown'
        };
        return {
          ...state,
          questionHistory: [...state.questionHistory, newEntry]
        };
      }),

      recordQuestionAnswered: (questionId, answerValue, answerText) => set((state) => {
        const existingIndex = state.questionHistory.findIndex(q => q.questionId === questionId);
        if (existingIndex >= 0) {
          const updated = [...state.questionHistory];
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: 'answered',
            answerValue,
            answerText,
            answeredAt: Date.now()
          };
          return { ...state, questionHistory: updated };
        } else {
          // If answered without prior shown record, create in answered status
          const sequence = state.questionHistory.length + 1;
          const newEntry: QuestionLedgerEntry = {
            sequence,
            questionId,
            questionText: questionId,
            shownAt: Date.now(),
            status: 'answered',
            answerValue,
            answerText,
            answeredAt: Date.now()
          };
          return {
            ...state,
            questionHistory: [...state.questionHistory, newEntry]
          };
        }
      }),

      recordQuestionSkipped: (questionId) => set((state) => {
        const existingIndex = state.questionHistory.findIndex(q => q.questionId === questionId);
        if (existingIndex >= 0) {
          const updated = [...state.questionHistory];
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: 'skipped',
            answerValue: 'skipped',
            answerText: 'تم التخطي',
            answeredAt: Date.now()
          };
          return { ...state, questionHistory: updated };
        }
        return state;
      }),

      markUnansweredQuestions: () => set((state) => {
        let hasChanges = false;
        const updated = state.questionHistory.map(entry => {
          if (entry.status === 'shown') {
            hasChanges = true;
            return {
              ...entry,
              status: 'unanswered' as const
            };
          }
          return entry;
        });
        return hasChanges ? { ...state, questionHistory: updated } : state;
      }),

      undoLastAnswer: () => {
        const state = get();
        const answered = state.questionHistory
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => entry.questionId !== 'u35' && (entry.status === 'answered' || entry.status === 'skipped'));
        if (answered.length === 0) return null;
        const last = answered.reduce((a, b) => ((b.entry.answeredAt ?? 0) >= (a.entry.answeredAt ?? 0) ? b : a));
        const removedId = last.entry.questionId;
        const universalAnswers = { ...state.universalAnswers };
        const sectorAnswers = { ...state.sectorAnswers };
        delete universalAnswers[removedId];
        delete sectorAnswers[removedId];
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('bik_universal_answers', JSON.stringify(universalAnswers));
          sessionStorage.setItem('bik_sector_answers', JSON.stringify(sectorAnswers));
        }
        set({
          universalAnswers,
          sectorAnswers,
          // The removed question and anything shown after it are re-recorded when shown again.
          questionHistory: state.questionHistory.filter((_, index) => index < last.index),
          review: emptyReviewState(),
          // Everything computed from the old answers is now stale.
          report: null,
          instantScore: null,
          axisScores: null,
          axisDetails: null,
          overallConfidence: null,
          overallCoverage: null,
          dataGaps: []
        });
        return removedId;
      },

      nextStep: () => set((state) => {
        return state;
      }),

      reset: () => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('bik_universal_answers');
          sessionStorage.removeItem('bik_sector_answers');
          sessionStorage.removeItem('bik_questionnaire_current_index');
          sessionStorage.removeItem('bik_temp_lead');
          sessionStorage.removeItem('bik_draft_answers');
        }

        set({
          sessionId: crypto.randomUUID(),
          userName: '',
          companyName: '',
          whatsapp: '',
          leadSaveWarning: false,
          sectorL1: '',
          sectorL2: '',
          startMode: 'analysis',
          diagnosticDepth: 'quick',
          intakeAnswers: {},
          universalAnswers: {},
          sectorAnswers: {},
          currentStep: 'welcome',
          universalProgress: 0,
          sectorProgress: 0,
          instantScore: null,
          axisScores: null,
          axisDetails: null,
          overallConfidence: null,
          overallCoverage: null,
          dataGaps: [],
          report: null,
          proposal: null,
          conversationHistory: [],
          questionHistory: [],
          review: emptyReviewState(),
        });
      },
    }),
    {
      name: 'bik-diagnostic-storage',
      storage: createJSONStorage(() => sessionStorage),
      // F4 (round-5): كل ما يعود من التخزين يُطبَّع عبر القائمة البيضاء قبل دخول المتجر،
      // فلا يصل حقل تالف أو عبث به إلى رحلة التشخيص مهما كان شكل السجل.
      merge: (persisted, current) => ({ ...current, ...sanitizeDiagnosticPersisted(persisted) }),
      partialize: (state) => {
        // Retain sessionId, questionHistory and diagnostic answers across refreshes for ephemeral V1 flow
        // Strictly exclude transient conversation history
        const { conversationHistory, ...rest } = state;
        return rest;
      },
    }
  )
);
