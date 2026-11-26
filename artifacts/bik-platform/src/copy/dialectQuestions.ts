import type { UniversalQuestion } from '../data/universalQuestions';
import type { Dialect } from '../services/dialect';
import saudiBatch from './saudi_universal_batch1.json';

type TextFields = 'question' | 'label' | 'placeholder' | 'unit';
type QuestionText = Partial<Pick<UniversalQuestion, TextFields>>;
type QuestionOverlay = QuestionText & { options?: Record<string, string> };
type LocalizableQuestion = Pick<UniversalQuestion, 'id' | 'options'> & QuestionText;

const saudiQuestions: Readonly<Record<string, QuestionOverlay>> = saudiBatch.items;

export function localizeQuestion<Question extends LocalizableQuestion>(question: Question, dialect: Dialect): Question {
  const overlay = dialect === 'saudi' ? saudiQuestions[question.id] : undefined;
  if (!overlay) return question;

  const { options: optionLabels, ...text } = overlay;
  const localized = { ...question, ...text };
  if (optionLabels && question.options) {
    localized.options = question.options.map(option => ({
      ...option,
      label: optionLabels[option.value] ?? option.label,
    }));
  }
  return localized;
}
