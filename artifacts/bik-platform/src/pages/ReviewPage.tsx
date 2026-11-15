import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { buildReviewPages, reviewEntryRedirect, reviewNextRoute, reviewHistoryRoutes } from '../services/reviewContent';
import { confirmReview, REVIEW_FREE_TEXT_LIMIT, type ReviewPageNumber } from '../services/reviewState';
import { dialectForCountry, reviewCopy } from '../services/dialect';

export default function ReviewPage() {
  const params = useParams();
  const navigate = useNavigate();
  const store = useDiagnosticStore();
  const validPage = ['1', '2', '3'].includes(params.page || '');
  const page = (validPage ? Number(params.page) : 1) as ReviewPageNumber;
  const historyPrepared = useRef(false);
  const redirect = validPage ? reviewEntryRedirect(store, page) : '/review/1';
  const copy = reviewCopy(dialectForCountry(String(store.intakeAnswers.country || '')));
  const content = useMemo(() => buildReviewPages(store)[page - 1], [page, store.userName, store.companyName,
    store.intakeAnswers, store.universalAnswers, store.sectorAnswers, store.sectorL1, store.sectorL2, store.sessionId, store.review]);
  const editing = store.review.editing[page] === true;
  const confirmed = store.review.responses[page];
  const draft = store.review.drafts[page] ?? (store.review.responses[page]?.kind === 'custom' ? store.review.responses[page]?.text : '') ?? '';
  const editor = useRef<HTMLTextAreaElement>(null);
  const goBack = () => navigate(-1);

  useLayoutEffect(() => {
    if (redirect || window.location.pathname !== `/review/${page}`) return;
    if (!historyPrepared.current) {
      historyPrepared.current = true;
      // Build the same previous steps for direct links and reloads. Thereafter the router's native
      // back traversal handles each step; no popstate listener can double-decrement the page.
      const startIndex = Number.isFinite(window.history.state?.idx) ? window.history.state.idx : 0;
      reviewHistoryRoutes(page).forEach((path, index) => {
        const state = { usr: null, key: `bik-review-${startIndex}-${index}`, idx: startIndex + index };
        if (index === 0) window.history.replaceState(state, '', path);
        else window.history.pushState(state, '', path);
      });
    }
    store.setField('review', { ...store.review, page });
    window.scrollTo(0, 0);
  }, [page, redirect]);

  useEffect(() => { if (editing) editor.current?.focus(); }, [editing, page]);
  if (redirect) return <Navigate to={redirect} replace />;

  const advance = (kind: 'accepted' | 'custom') => {
    const savedKind = kind === 'accepted' && confirmed?.kind === 'custom' ? 'custom' : kind;
    const text = kind === 'accepted' ? (confirmed?.text || content.lines.join('\n')) : draft;
    if (!text.trim() || (kind === 'custom' && text.length > REVIEW_FREE_TEXT_LIMIT)) return;
    store.setField('review', confirmReview(store.review, page, { kind: savedKind, text }));
    store.setField('report', null);
    store.setField('proposal', null);
    navigate(reviewNextRoute(page));
  };

  return <main className="min-h-[100dvh] bg-[#F4F1E9] text-[#0F172A] px-4 py-6 md:py-12" dir="rtl" lang="ar">
    <div className="page-enter mx-auto max-w-3xl">
      <button type="button" onClick={goBack} className="min-h-11 inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[#526B7B]" data-testid="review-back">
        <ArrowRight size={18} aria-hidden="true" />{copy.previous}
      </button>
      <h1 className="mt-5 font-display text-3xl font-bold leading-relaxed md:text-4xl">{content.title}</h1>
      <p className="mt-3 text-lg leading-8 text-[#68717A]">{content.subtitle}</p>
      <div className="mt-6 space-y-4 rounded-[1.7rem] border border-[#C9A961]/30 bg-[#FBFAF6] p-6 md:p-8" data-testid="review-box">
        {confirmed?.kind === 'custom'
          ? <p className="whitespace-pre-wrap break-words text-lg leading-8">{confirmed.text}</p>
          : <>
            {content.mirror && <p className="text-base font-normal leading-6 text-[#0F172A]" data-testid="review-mirror-open">{content.mirror.opening}</p>}
            {(content.inferredDestination ? [content.lines.join(' ')] : content.lines).map((line, index) =>
              <p key={index} className={`text-lg leading-8${page === 1 ? ' font-medium' : ''}`} data-testid="review-statement">{line}</p>)}
            {content.mirror && <p className="text-base font-normal leading-6 text-[#0F172A]" data-testid="review-mirror-close">{content.mirror.closing}</p>}
          </>}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => advance('accepted')} className="min-h-11 rounded-xl bg-[#0F172A] px-6 py-3.5 font-bold text-white hover:bg-[#26354E]" data-testid="review-yes">{copy.yes}</button>
        <button type="button" onClick={() => store.setField('review', { ...store.review, editing: { ...store.review.editing, [page]: true } })}
          className="min-h-11 rounded-xl border-2 border-[#0F172A]/20 bg-[#FBFAF6] px-6 py-3.5 font-bold" aria-expanded={editing} aria-controls="review-editor" data-testid="review-other">{copy.other}</button>
      </div>
      {editing && <form id="review-editor" className="mt-6" onSubmit={event => { event.preventDefault(); advance('custom'); }}>
        <label htmlFor="review-draft" className="block font-bold">{copy.editorLabel}</label>
        <p className="mt-2 text-sm leading-7 text-[#68717A]" id="review-help">{copy.help}</p>
        <textarea ref={editor} id="review-draft" value={draft} maxLength={REVIEW_FREE_TEXT_LIMIT} aria-describedby="review-help"
          onChange={event => store.setField('review', { ...store.review, drafts: { ...store.review.drafts, [page]: event.target.value } })}
          className="mt-3 block min-h-32 w-full rounded-xl border border-[#0F172A]/20 bg-[#FBFAF6] p-4 text-lg leading-8" data-testid="review-draft" />
        <button type="submit" disabled={!draft.trim()} className="mt-3 min-h-11 w-full rounded-xl bg-[#0F172A] px-6 py-3.5 font-bold text-white disabled:opacity-50" data-testid="review-submit">{copy.submit}</button>
      </form>}
    </div>
  </main>;
}
