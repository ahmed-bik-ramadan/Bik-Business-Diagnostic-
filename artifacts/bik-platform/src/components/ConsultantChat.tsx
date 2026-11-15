import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { BIK_OFFERS, buildConsultantWhatsAppUrl } from '../config/appConfig';
import { platformCopy } from '../copy/platformCopy';
import {
  MAX_MESSAGE_CHARS,
  MAX_USER_TURNS,
  recommendationForContext,
  sanitizeChatText,
  shouldOfferContact,
  suggestedChatQuestions,
  type ChatContext,
  type ChatMessage
} from '../services/chatPolicy';

interface Props {
  context: ChatContext;
}

// The browser reaches the BIK server through its isolated prefix (see server.ts); a plain /api
// path belongs to another service on the hosting platform.
export const CHAT_ENDPOINT = '/_bik-api/v1/chat';

type ChatError = 'unavailable' | 'rate_limited' | 'failed' | null;

const ERROR_TEXT: Record<Exclude<ChatError, null>, string> = {
  unavailable: 'المحادثة الآلية غير متاحة حالياً. يمكنك التواصل مع المستشار مباشرة.',
  rate_limited: 'تجاوزت الحد المؤقت للمحادثة. انتظر دقائق ثم أعد المحاولة.',
  failed: 'تعذر الحصول على رد. أعد إرسال السؤال.'
};

export default function ConsultantChat({ context }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChatError>(null);
  const [redacted, setRedacted] = useState(false);
  const inFlight = useRef(false);

  const userTurns = messages.filter(m => m.role === 'user').length;
  const limitReached = userTurns >= MAX_USER_TURNS && messages[messages.length - 1]?.role === 'assistant';
  const offerContact = shouldOfferContact(messages) || limitReached || error === 'unavailable';
  const offerKey = recommendationForContext(context);

  const contact = buildConsultantWhatsAppUrl({
    customMessage: `مرحباً أستاذ أحمد، أنهيت تشخيص BIK وأرغب في مناقشة «${BIK_OFFERS[offerKey].name}».`
  });

  async function request(history: ChatMessage[]) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context })
      });
      if (response.status === 503) { setError('unavailable'); return; }
      if (response.status === 429) { setError('rate_limited'); return; }
      if (!response.ok) { setError('failed'); return; }
      const data = await response.json();
      if (typeof data?.text !== 'string' || !data.text.trim()) { setError('failed'); return; }
      setMessages([...history, { role: 'assistant', text: data.text }]);
    } catch {
      setError('failed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function send(question = draft) {
    if (busy || inFlight.current || limitReached) return;
    const raw = question.trim();
    const text = sanitizeChatText(raw);
    if (!text) return;
    setRedacted(text.includes('[محذوف]'));
    const history: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages(history);
    setDraft('');
    void request(history);
  }

  function retry() {
    if (messages[messages.length - 1]?.role === 'user') void request(messages);
  }

  return <section className="rounded-[1.7rem] border border-[#C9A961]/35 bg-[#FBFAF6] p-5 md:p-7" aria-labelledby="advisor-chat-title" data-testid="consultant-chat">
    <div className="flex items-start gap-3">
      <ShieldCheck className="mt-1 shrink-0 text-[#92763D]" size={22} />
      <div className="min-w-0 w-full">
        <p className="text-xs font-bold text-[#92763D]">{platformCopy['chat.badge']}</p>
        <h2 id="advisor-chat-title" className="mt-1 font-display text-xl font-bold">{platformCopy['chat.title']}</h2>
        <p className="mt-3 text-sm leading-7 text-[#68717A]">
          {platformCopy['chat.privacy']}
        </p>

        <ol className="mt-5 min-h-[14rem] space-y-3" aria-live="polite" data-testid="chat-messages">
          {messages.map((m, i) => (
            <li
              key={i}
              data-testid="chat-message"
              data-role={m.role}
              className={m.role === 'user'
                ? 'rounded-xl bg-[#0F172A] px-4 py-3 text-sm leading-7 text-white'
                : 'rounded-xl border border-[#C9A961]/35 bg-white px-4 py-3 text-sm leading-7 text-[#0F172A] whitespace-pre-wrap'}
            >{m.text}</li>
          ))}
        </ol>

        {busy && <p className="mt-3 text-sm text-[#68717A]" data-testid="chat-busy">جارٍ إعداد الرد.</p>}

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert" data-testid="chat-error" data-error={error}>
            <p>{ERROR_TEXT[error]}</p>
            {error !== 'unavailable' && messages[messages.length - 1]?.role === 'user' && (
              <button type="button" onClick={retry} className="mt-2 font-bold underline" data-testid="chat-retry">أعد المحاولة</button>
            )}
          </div>
        )}

        {redacted && <p className="mt-3 text-xs text-[#92763D]" data-testid="chat-redacted">حُذفت بيانات اتصال من رسالتك قبل الإرسال.</p>}

        {error !== 'unavailable' && !limitReached && (
          <form className="mt-5 flex gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              maxLength={MAX_MESSAGE_CHARS}
              rows={3}
              placeholder={platformCopy['chat.placeholder']}
              aria-label="سؤالك"
              data-testid="chat-input"
              className="min-h-24 min-w-0 flex-1 rounded-xl border border-[#C9A961]/40 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              data-testid="chat-send"
              className="inline-flex items-center gap-2 self-end rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-bold text-white hover:bg-[#26354E] disabled:opacity-50"
            ><Send size={16} /> إرسال</button>
          </form>
        )}

        {messages.length === 0 && (
          <div className="mt-4" data-testid="chat-starters" aria-labelledby="chat-suggest-heading">
            <p id="chat-suggest-heading" className="text-sm font-bold text-[#26354E]">{platformCopy['chat.suggestHeading']}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedChatQuestions(context).map(question => (
                <button
                  key={question}
                  type="button"
                  onClick={() => send(question)}
                  disabled={busy}
                  className="min-h-11 rounded-xl border border-[#C9A961]/50 bg-white px-3 py-2 text-right text-xs font-bold leading-6 text-[#26354E] hover:bg-[#F6F0DF] disabled:opacity-50"
                >{question}</button>
              ))}
            </div>
          </div>
        )}

        {limitReached && <p className="mt-3 text-sm text-[#68717A]" data-testid="chat-limit">انتهى عدد الأسئلة المتاح في هذه الجلسة. أكمل مع المستشار مباشرة.</p>}

        {offerContact && (
          <div className="mt-5 rounded-xl border border-[#C9A961]/40 bg-white p-4" data-testid="chat-contact-cta">
            <p className="text-sm leading-7 text-[#0F172A]">للمتابعة مع المستشار مباشرة:</p>
            {contact.isConfigured ? (
              <a href={contact.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-bold text-white hover:bg-[#26354E]">
                <MessageCircle size={17} /> تواصل عبر واتساب
              </a>
            ) : (
              <p className="mt-2 text-sm text-[#68717A]">{contact.displayNotice}</p>
            )}
          </div>
        )}

        <Link to="/consultant" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#92763D] underline">معلومات المستشار وخيارات التواصل</Link>
      </div>
    </div>
  </section>;
}
