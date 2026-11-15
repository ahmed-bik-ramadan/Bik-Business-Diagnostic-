import { reviewCopy } from './dialect';

export type ReviewPageNumber = 1 | 2 | 3;
export interface ReviewResponse { kind: 'accepted' | 'custom'; text: string }
export interface ReviewState {
  questionnaireComplete: boolean;
  page: ReviewPageNumber;
  responses: Partial<Record<ReviewPageNumber, ReviewResponse>>;
  drafts: Partial<Record<ReviewPageNumber, string>>;
  editing: Partial<Record<ReviewPageNumber, boolean>>;
}
export interface ReviewedSection { page: ReviewPageNumber; label: string; text: string }
export const REVIEW_PAGES = [1, 2, 3] as const;
export const REVIEW_FREE_TEXT_LIMIT = 300;
export const emptyReviewState = (): ReviewState => ({ questionnaireComplete: false, page: 1, responses: {}, drafts: {}, editing: {} });
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A whitelist for the existing session store; preserve valid visitor wording exactly. */
export function sanitizeReviewState(value: unknown): ReviewState {
  const safe = emptyReviewState();
  if (!object(value)) return safe;
  safe.questionnaireComplete = value.questionnaireComplete === true;
  if (REVIEW_PAGES.includes(value.page)) safe.page = value.page;
  for (const page of REVIEW_PAGES) {
    const response = object(value.responses) ? value.responses[page] : undefined;
    if (object(response) && ['accepted', 'custom'].includes(response.kind) && typeof response.text === 'string'
      && response.text.trim() && response.text.length <= (response.kind === 'custom' ? REVIEW_FREE_TEXT_LIMIT : 2000)) {
      safe.responses[page] = { kind: response.kind, text: response.text };
    }
    if (object(value.drafts) && typeof value.drafts[page] === 'string') safe.drafts[page] = value.drafts[page].slice(0, REVIEW_FREE_TEXT_LIMIT);
    if (object(value.editing) && typeof value.editing[page] === 'boolean') safe.editing[page] = value.editing[page];
  }
  return safe;
}

export function confirmReview(value: ReviewState, page: ReviewPageNumber, response: ReviewResponse): ReviewState {
  const safe = sanitizeReviewState(value);
  const valid = sanitizeReviewState({ responses: { [page]: response } }).responses[page];
  if (!valid) return safe;
  for (const later of REVIEW_PAGES.filter(number => number > page)) delete safe.responses[later];
  safe.responses[page] = valid;
  safe.editing[page] = false;
  safe.page = page < 3 ? (page + 1) as ReviewPageNumber : 3;
  return safe;
}

export const firstPendingReview = (state: ReviewState): ReviewPageNumber | null =>
  REVIEW_PAGES.find(page => !state.responses[page]) ?? null;

/** Remove contact spans only. Do not trim, collapse whitespace, scrub IDs, or rewrite names. */
export function redactReviewContacts(text: string): string {
  const replacement = reviewCopy('fusha').redacted;
  const replaceLink = (link: string) => replacement + (link.match(/[.,!؟،؛:]+$/u)?.[0] || '');
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, replacement)
    .replace(/(?:https?:\/\/|www\.)[^\s<>،؛؟]+/gi, replaceLink)
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>،؛؟]*)?/gi, replaceLink)
    .replace(/(?:\+|00)?[\d٠-٩۰-۹][\d٠-٩۰-۹ ().-]{5,}[\d٠-٩۰-۹]/g, (match, offset, source) => {
      if ((match.match(/[\d٠-٩۰-۹]/g) || []).length < 7) return match;
      const before = source.slice(Math.max(0, offset - 30), offset);
      const after = source.slice(offset + match.length);
      const phoneCue = /(?:هاتف(?:ي|نا)?|رقم(?:ي|نا)?|واتساب|جوال(?:ي|نا)?|تليفون(?:ي|نا)?)[\s:：]*$/u.test(before);
      const moneyCue = /(?:إيراد(?:ات)?(?:نا)?|ايراد(?:ات)?(?:نا)?|مبيعات(?:نا)?|المبيعات|مبلغ|المبلغ|تكلفة|التكلفة)[\s:：]*$/u.test(before)
        || /^\s*(?:جنيه|ريال|درهم|دينار|دولار|EGP|SAR|AED|USD)(?:\s|[،.;]|$)/iu.test(after);
      return moneyCue && !phoneCue ? match : replacement;
    });
}

export function buildReviewedSections(value: unknown): ReviewedSection[] {
  const state = sanitizeReviewState(value);
  const copy = reviewCopy('fusha');
  return REVIEW_PAGES.flatMap(page => {
    const response = state.responses[page];
    return response ? [{ page, label: copy.sectionLabels[page], text: redactReviewContacts(response.text) }] : [];
  });
}

export function reviewedSectionText(value: unknown): string {
  const sections = buildReviewedSections(value);
  return sections.length ? [reviewCopy('fusha').sectionTitle, ...sections.map(section => `${section.label}\n${section.text}`)].join('\n\n') : '';
}
