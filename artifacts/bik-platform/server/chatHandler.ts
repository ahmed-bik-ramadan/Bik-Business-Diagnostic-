/**
 * Fix F — /api/v1/chat handler. Framework-free so it can be tested with a mocked fetch.
 *
 * - Key comes only from the environment (OPENROUTER_API_KEY); it is never logged or returned.
 * - Only the whitelisted payload from validateChatRequest is forwarded.
 * - Any upstream failure returns an explicit error; no synthetic advisor reply is ever produced.
 * - Message content is never logged.
 * - وضع الاختبار فقط: BIK_CHAT_MOCK=1 يعيد رداً محاكى حتمياً دون أي اتصال بالمنبع،
 *   ليتحقق المراجع من سياسة المحادثة (الإشعار، الحارس) بلا مفتاح. لا يُشغَّل أبداً في الإنتاج.
 */
import { CHAT_FALLBACK_REPLY, appendPersonalDataWarning, buildChatSystemPrompt, containsPersonalData, guardAssistantReply, validateChatRequest } from '../src/services/chatPolicy.ts';
import { consumeRateBucket, pruneRateBuckets } from './rateLimit';
import { CHAT_RATE_LIMIT_PER_IP } from './runtimeConfig';

export const DEFAULT_CHAT_MODEL = 'anthropic/claude-haiku-5.5';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 20_000;

export interface ChatHandlerDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  ip: string;
  now?: number;
  buckets: Map<string, { count: number; resetAt: number }>;
}

export interface ChatHandlerResult { status: number; json: Record<string, unknown> }

export async function handleChat(body: unknown, deps: ChatHandlerDeps): Promise<ChatHandlerResult> {
  const now = deps.now ?? Date.now();
  pruneRateBuckets(deps.buckets, now);
  const mockMode = deps.env.NODE_ENV !== 'production' && deps.env.BIK_CHAT_MOCK === '1';
  const apiKey = (deps.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey && !mockMode) return { status: 503, json: { error: 'chat_unavailable' } };

  if (!consumeRateBucket(deps.buckets, deps.ip, CHAT_RATE_LIMIT_PER_IP, now)) {
    return { status: 429, json: { error: 'rate_limited' } };
  }

  const parsed = validateChatRequest(body);
  if (!parsed.ok || !parsed.value) return { status: 400, json: { error: parsed.error || 'invalid_body' } };
  const { messages, context } = parsed.value;

  // وضع الاختبار: فرع واحد حتمي قبل أي اتصال بالمنبع، يعمل بمفتاح أو بدونه،
  // ويمرّ بنفس سلسلة السياسة (التحقق، الحارس، إشعار البيانات الشخصية). الرد مُعلَّم
  // بوضوح فلا يُقرأ أبداً كمشورة، ولا يُضبط هذا الوضع في الإنتاج.
  if (mockMode) {
    const base = 'رد محاكى لفحص المنصة (وضع الاختبار): المحادثة تعمل، وهذه الصياغة ثابتة للتحقق لا للمشورة.';
    const guardedMock = guardAssistantReply(base);
    const warnedMock = messages.some(m => m.role === 'user' && containsPersonalData(m.text));
    const textMock = warnedMock && guardedMock !== CHAT_FALLBACK_REPLY ? appendPersonalDataWarning(guardedMock) : guardedMock;
    return { status: 200, json: { text: textMock, mock: true } };
  }

  const model = (deps.env.OPENROUTER_MODEL || '').trim() || DEFAULT_CHAT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await deps.fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': (deps.env.PUBLIC_APP_URL || 'https://bik-business-solutions.com').trim(),
        'X-Title': 'BIK Diagnostic'
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          { role: 'system', content: buildChatSystemPrompt(context) },
          ...messages.map(m => ({ role: m.role, content: m.text }))
        ]
      })
    });
    if (!upstream.ok) {
      console.warn(`[chat] upstream status ${upstream.status}`);
      return { status: 502, json: { error: 'upstream_failed' } };
    }
    const data: any = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      console.warn('[chat] upstream returned no content');
      return { status: 502, json: { error: 'upstream_empty' } };
    }
    const guarded = guardAssistantReply(content);
    // If any user turn carried personal data, the notice is appended here in code —
    // it never depends on the model remembering to warn. The fixed fallback reply
    // stays exactly as written: it is a rejection message, not advice to annotate.
    const warned = messages.some(m => m.role === 'user' && containsPersonalData(m.text));
    const text = warned && guarded !== CHAT_FALLBACK_REPLY ? appendPersonalDataWarning(guarded) : guarded;
    return { status: 200, json: { text } };
  } catch (err: any) {
    console.warn(`[chat] upstream error: ${err?.name === 'AbortError' ? 'timeout' : 'network'}`);
    return { status: 502, json: { error: 'upstream_failed' } };
  } finally {
    clearTimeout(timer);
  }
}
