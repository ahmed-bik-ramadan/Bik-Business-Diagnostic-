import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, LockKeyhole } from 'lucide-react';
import { useDiagnosticStore } from '../store/diagnosticStore';
import { buildWhatsAppReportParts } from '../services/reportTextDelivery';
import { buildConsultantWhatsAppUrl } from '../config/appConfig';
import { secondsUntilReady } from '../services/transferGate';
import {
  confirmTransferPart,
  finishTransfer,
  markTransferPartOpened,
  readTransferProgress,
  transferProgressKey,
  wipeTransferSessionArtifacts,
  writeTransferProgress,
  type ReportTransferProgress
} from '../services/reportTransferState';

export default function ReportTransfer() {
  const navigate = useNavigate();
  const { sessionId, report } = useDiagnosticStore();
  const dossier = report?.dual_layer?.consultantDossier?.full_dossier_text || '';
  const partsResult = useMemo(() => {
    try {
      return { parts: buildWhatsAppReportParts(dossier, sessionId), error: false };
    } catch {
      return { parts: [], error: true };
    }
  }, [dossier, sessionId]);
  const parts = partsResult.parts;
  const [progress, setProgress] = useState<ReportTransferProgress | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  // True when the browser blocked the WhatsApp popup: the page says so plainly, with
  // enabling steps and a retry. No clipboard detour: the part text travels inside the
  // wa.me link itself, and every send leaves through the consultant's chat.
  const [popupBlocked, setPopupBlocked] = useState(false);
  // True when the device itself has no internet connection: the browser still hands back a
  // window for wa.me whose navigation then fails silently, so without this check the page
  // would record a "sent" part that never left the device. The open is refused honestly.
  const [offlineBlocked, setOfflineBlocked] = useState(false);
  // True when this browser blocks sessionStorage entirely: without it neither progress nor the
  // report copy can be read, so the page must say so plainly instead of showing a generic notice.
  const [storageBlocked, setStorageBlocked] = useState(false);
  // True when sessionStorage is readable but refuses writes (quota or permissions policy):
  // progress cannot be saved, so the page names this state instead of a generic failure.
  const [storageWriteBlocked, setStorageWriteBlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const confirmedInThisView = useRef(new Set<number>());
  // دليل في الذاكرة فقط: الجزء يُعدّ مفتوحاً في هذه الجلسة من الصفحة بعد نجاح window.open
  // فعلياً هنا. طابع openedAt المزوَّر في التخزين (أو سجل منسوخ من جهاز آخر) لا يرضيه أبداً،
  // لأن هذا الدليل لا يُكتب في التخزين إطلاقاً ويموت بإغلاق الصفحة.
  const openedInThisView = useRef(new Set<number>());
  const transferKey = transferProgressKey(sessionId);
  const currentIndex = progress?.currentIndex ?? 0;
  const selectedPart = progress?.parts[selectedIndex];
  const isComplete = Boolean(progress && parts.length > 0 && currentIndex === parts.length);
  const canOpenSelected = Boolean(progress && selectedPart && selectedIndex <= currentIndex);
  // The wait runs from the moment the client pressed "open" for this part; it is stored with the part, so it survives a reload.
  const waitMark = selectedPart && selectedPart.openedAt !== null ? { index: selectedIndex, at: selectedPart.openedAt } : null;
  const secondsLeft = secondsUntilReady(waitMark, currentIndex, now);
  const canConfirmSelected = Boolean(
    progress
    && selectedPart
    && selectedIndex === currentIndex
    && selectedPart.status === 'pending'
    && selectedPart.openedAt !== null
    && openedInThisView.current.has(selectedIndex)
    && secondsLeft === 0
    && !confirming
  );

  useEffect(() => {
    if (secondsLeft === null || secondsLeft === 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    // Storage is probed before anything else, reads and writes alike: when the browser
    // blocks either, this page says so plainly instead of silently redirecting to the
    // processing screen, which would loop a visitor whose report copy is unreadable.
    let storageUsable = true;
    let storageWritable = true;
    try {
      window.sessionStorage.getItem('__bik_probe');
    } catch {
      // sessionStorage access itself throws here (browser setting or permissions policy).
      storageUsable = false;
    }
    if (storageUsable) {
      try {
        const probeKey = `__bik_probe_w:${sessionId}`;
        window.sessionStorage.setItem(probeKey, '1');
        window.sessionStorage.removeItem(probeKey);
      } catch {
        // Readable but not writable: quota exhausted or a write-only block.
        storageWritable = false;
      }
    }
    if (!storageUsable || !storageWritable) {
      setStorageBlocked(!storageUsable);
      setStorageWriteBlocked(!storageWritable);
      setError(storageUsable
        ? 'تخزين الجلسة في متصفحك لا يقبل الحفظ، ولا يمكن حفظ تقدم الإرسال على هذا الجهاز. فعّل تخزين الجلسة أو أفرغ مساحة المتصفح لهذا الموقع ثم أعد تحميل الصفحة.'
        : 'تخزين الجلسة في متصفحك معطّل، ولا يمكن استعادة تقريرك أو حفظ تقدم الإرسال من هذا الجهاز. فعّل تخزين الجلسة لهذا الموقع من إعدادات المتصفح ثم أعد تحميل الصفحة.');
      return;
    }
    if (!report) {
      navigate('/processing', { replace: true });
      return;
    }
    let hasConsent = false;
    try {
      hasConsent = sessionStorage.getItem(`bik-sharing-consent:${sessionId}`) === 'true';
    } catch {
      // Consent is valid only in the current tab.
    }
    if (!hasConsent) {
      navigate('/lead-gate', { replace: true });
      return;
    }
    try {
      if (partsResult.error) throw new Error('part-build');
      const restored = readTransferProgress(sessionStorage, sessionId, parts);
      // F8 (round-5): إن وُجد الإرسال مكتملالاً عند الاسترجاع فتُمحى نسخ الجلسة على
      // الفور؛ سجلّ الإتمام في sessionStorage بلا نص تقرير ولا يحتاج هذه النسخ.
      if (restored.currentIndex >= parts.length) wipeTransferSessionArtifacts(sessionId);
      if (restored.currentIndex < parts.length) writeTransferProgress(sessionStorage, restored);
      setProgress(restored);
      setSelectedIndex(restored.currentIndex);
      confirmedInThisView.current.clear();
      console.info('[bik-transfer]', {
        event: 'state_restored',
        partCount: restored.parts.length,
        currentIndex: restored.currentIndex,
        sentCount: restored.parts.filter(part => part.status === 'sent').length
      });
    } catch (cause) {
      setError(partsResult.error
        ? 'تعذر تجهيز أجزاء التقرير بأمان. أعد المحاولة أو ارجع إلى صفحة التقرير.'
        : 'تعذر استعادة تقدم الإرسال من هذا الجهاز. تحقق من إتاحة التخزين ثم أعد المحاولة.');
      console.error('[bik-transfer]', {
        event: 'error',
        stage: partsResult.error ? 'build_parts' : 'restore_state',
        errorName: cause instanceof Error ? cause.name : 'UnknownError'
      });
    }
  }, [report, sessionId, navigate, parts, partsResult.error]);

  useEffect(() => {
    if (!parts.length) return;
    console.info('[bik-transfer]', {
      event: 'parts_built',
      partCount: parts.length,
      maxEncodedLength: Math.max(...parts.map(part => encodeURIComponent(part.message).length))
    });
  }, [parts]);

  useEffect(() => {
    const refresh = (source: string) => {
      try {
        const restored = readTransferProgress(sessionStorage, sessionId, parts);
        setProgress(restored);
        setSelectedIndex(restored.currentIndex);
        console.info('[bik-transfer]', {
          event: 'state_restored',
          source,
          partCount: restored.parts.length,
          currentIndex: restored.currentIndex,
          sentCount: restored.parts.filter(part => part.status === 'sent').length
        });
      } catch (cause) {
        setError('تعذر استعادة تقدم الإرسال. أعد المحاولة بعد إتاحة التخزين لهذا الموقع.');
        console.error('[bik-transfer]', {
          event: 'error',
          stage: 'restore_state',
          errorName: cause instanceof Error ? cause.name : 'UnknownError'
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh('visibilitychange');
    };
    const onPageShow = () => refresh('pageshow');
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === sessionStorage && event.key === transferKey) refresh('storage');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('storage', onStorage);
    };
  }, [sessionId, parts, transferKey]);

  const persistOpened = (index: number): ReportTransferProgress | null => {
    if (!progress) return null;
    try {
      const next = markTransferPartOpened(progress, index);
      writeTransferProgress(sessionStorage, next);
      setProgress(next);
      setSelectedIndex(index);
      setError('');
      console.info('[bik-transfer]', { event: 'whatsapp_open_requested', partIndex: index + 1 });
      return next;
    } catch (cause) {
      setError('تعذر حفظ تقدم هذا الجزء. أعد المحاولة قبل تأكيد الإرسال.');
      console.error('[bik-transfer]', {
        event: 'error',
        stage: 'save_open_state',
        errorName: cause instanceof Error ? cause.name : 'UnknownError'
      });
      return null;
    }
  };

  const openWhatsApp = async () => {
    if (!canOpenSelected || !selectedPart) return;
    const target = buildConsultantWhatsAppUrl({ customMessage: selectedPart.message });
    if (!target.isConfigured) {
      setError(target.displayNotice || 'رقم واتساب المستشار غير مهيأ حالياً.');
      return;
    }
    setNotice('');
    // Refused honestly before any window is opened: an offline device can never reach
    // wa.me, so the attempt is neither counted nor recorded as opened.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setNotice('');
      setPopupBlocked(false);
      setOfflineBlocked(true);
      return;
    }
    // Opened synchronously inside the click so the browser allows it. The part text travels inside the link; nothing is copied.
    let opened: Window | null = null;
    try {
      opened = window.open(target.url, '_blank');
    } catch (cause) {
      console.error('[bik-transfer]', {
        event: 'error',
        stage: 'open_whatsapp',
        partIndex: selectedIndex + 1,
        errorName: cause instanceof Error ? cause.name : 'UnknownError'
      });
    }
    if (!opened) {
      // لا مسار نسخ: النص يسير داخل الرابط نفسه، والحل الوحيد هو إتاحة النوافذ المنبثقة ثم إعادة المحاولة.
      setNotice('');
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);
    setOfflineBlocked(false);
    try { opened.opener = null; } catch { /* cross-origin window: nothing to detach */ }
    const next = persistOpened(selectedIndex);
    if (next) setNow(Date.now());
    // دليل الفتح الحقيقي يُسجَّل هنا فقط: بعد نجاح window.open فعلياً، لا عند أي مسار آخر.
    openedInThisView.current.add(selectedIndex);
  };

  const acknowledgeCurrent = () => {
    if (!progress || !canConfirmSelected || confirmedInThisView.current.has(selectedIndex)) return;
    confirmedInThisView.current.add(selectedIndex);
    setConfirming(true);
    setError('');
    try {
      const result = confirmTransferPart(progress, selectedIndex);
      if (result.changed) {
        if (result.progress.currentIndex === parts.length) {
          const completed = finishTransfer(sessionStorage, sessionId, parts, () => wipeTransferSessionArtifacts(sessionId));
          if (!completed) throw new Error('completion-write');
        } else {
          writeTransferProgress(sessionStorage, result.progress);
        }
        setProgress(result.progress);
        setSelectedIndex(result.progress.currentIndex < parts.length ? result.progress.currentIndex : selectedIndex);
        setNotice(result.progress.currentIndex === parts.length
          ? 'اكتمل تأكيد جميع الأجزاء. أصبح التحليل الكامل متاحاً.'
          : `تم تأكيد الجزء ${selectedIndex + 1}. انتقل الآن إلى الجزء ${result.progress.currentIndex + 1}.`);
        console.info('[bik-transfer]', {
          event: 'part_confirmed',
          partIndex: selectedIndex + 1,
          sentCount: result.progress.currentIndex,
          partCount: result.progress.parts.length
        });
      }
    } catch (cause) {
      confirmedInThisView.current.delete(selectedIndex);
      setError(cause instanceof Error && cause.message.includes('Open WhatsApp')
        ? 'افتح محادثة واتساب لهذا الجزء أولاً، ثم أكّد إرساله.'
        : 'تعذر حفظ تأكيد الإرسال. أعد المحاولة؛ لن يتخطى التقرير أي جزء غير مؤكد.');
      console.error('[bik-transfer]', {
        event: 'error',
        stage: 'confirm_part',
        partIndex: selectedIndex + 1,
        errorName: cause instanceof Error ? cause.name : 'UnknownError'
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#F4F1E9] text-[#0F172A]" dir="rtl" lang="ar">
      <header className="bg-[#0F172A] text-[#FBFAF6]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <span className="font-display text-xl font-bold">BIK <span className="text-[#C9A961]">/</span> إرسال التقرير</span>
          <span className="text-xs text-[#FBFAF6]/65">أُكّد {currentIndex} من {parts.length}</span>
        </div>
      </header>
      <div className="page-enter mx-auto max-w-3xl px-4 py-9 md:px-8 md:py-14">
        <button type="button" onClick={() => navigate('/lead-gate')} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[#526B7B] hover:text-[#0F172A]" data-testid="back-to-gate"><ArrowRight size={16} /> رجوع</button>
        <p className="text-xs font-bold tracking-[.16em] text-[#8B7135]">الخطوة الأخيرة قبل فتح تحليلك</p>
        <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">تقريرك جاهز للإرسال إلى أ/ أحمد</h1>
        <p className="mt-4 max-w-2xl leading-8 text-[#68717A]">حين تؤكد إرسال الأجزاء ({parts.length}) يُفتح لك التحليل الكامل هنا على المنصة. هذا تأكيد منك، وليس إشعار استلام من واتساب أو المستشار. يمكنك الرجوع إلى الرسائل التي أرسلتها في محادثتكما، وكل جزء يخرج من جهازك جاهزاً للإرسال بلا نسخ ولا لصق.</p>

        {isComplete ? <section className="mt-8 rounded-[1.7rem] border border-[#C9A961]/50 bg-[#FBFAF6] p-6 shadow-[0_20px_70px_rgba(15,23,42,.08)]" data-testid="transfer-complete">
          <div className="flex items-start gap-3">
            <Check className="mt-1 text-[#92763D]" size={24} />
            <div>
              <h2 className="font-display text-2xl font-bold">اكتمل تأكيد إرسال أجزاء التقرير</h2>
              <p className="mt-2 text-sm leading-7 text-[#526B7B]">أكدت إرسال أجزاء التقرير إلى أ/ أحمد في محادثتكما. يمكنك الرجوع إلى الرسائل التي أرسلتها على واتساب، وفتح التحليل الكامل الآن.</p>
              <button type="button" onClick={() => navigate('/report')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-6 py-3.5 font-bold text-white hover:bg-[#26354E]" data-testid="open-full-analysis">
                فتح التحليل الكامل <ArrowUpRight size={18} />
              </button>
              <button type="button" onClick={() => navigate('/consultant')} className="mt-5 inline-flex items-center gap-2 rounded-xl border-2 border-[#0F172A]/20 px-6 py-3.5 font-bold text-[#0F172A] hover:bg-white sm:ms-3" data-testid="complete-consultant-link">من الذي سيقرأ تقريرك؟ تعرّف على أ/ أحمد</button>
            </div>
          </div>
        </section> : partsResult.error ? <p className="mt-8 rounded-xl border border-red-300 bg-white p-5 text-sm leading-7 text-red-800" role="alert">تعذر تقسيم التقرير بأمان. توجد جملة أطول من حد الرسالة الآمن؛ أعد إنشاء التقرير أو تواصل مع الدعم.</p> : progress && selectedPart ? <section className="mt-8 overflow-hidden rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] shadow-[0_20px_70px_rgba(15,23,42,.08)]" data-testid="transfer-part">
          <div className="flex items-center justify-between border-b border-[#0F172A]/10 bg-[#F8F5EC] px-5 py-4">
            <div><p className="text-xs text-[#68717A]">الجزء المحدد</p><h2 className="mt-1 font-bold">الجزء {selectedIndex + 1} من {parts.length}</h2></div>
            <span className="font-mono text-sm text-[#92763D]">{currentIndex}/{parts.length}</span>
          </div>
          <div className="p-5 md:p-7">
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs font-bold text-[#526B7B]">
                <span>تقدم الإرسال</span><span>{currentIndex} من {parts.length}</span>
              </div>
              <progress className="mt-2 h-2 w-full accent-[#C9A961]" value={currentIndex} max={parts.length} aria-label="تقدم إرسال أجزاء التقرير" data-testid="transfer-progress" />
            </div>
            <ol className="mb-5 grid gap-2 sm:grid-cols-2" aria-label="حالة كل جزء">
              {progress.parts.map((part, index) => {
                const sent = part.status === 'sent';
                const available = index <= currentIndex;
                return <li key={`${index}-${part.label}`}>
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => { setSelectedIndex(index); setNotice(''); setError(''); }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs ${selectedIndex === index ? 'border-[#C9A961] bg-[#F6F0DF]' : 'border-[#0F172A]/10 bg-white'} disabled:cursor-not-allowed disabled:opacity-50`}
                    data-testid={`part-status-${index + 1}`}
                    aria-current={selectedIndex === index ? 'step' : undefined}
                  >
                    <span>الجزء {index + 1} من {parts.length}</span>
                    <span className={sent ? 'font-bold text-emerald-700' : 'text-[#68717A]'}>{sent ? 'تم التأكيد · إعادة الإرسال' : index === currentIndex ? 'بانتظار الإرسال' : 'بانتظار الجزء السابق'}</span>
                  </button>
                </li>;
              })}
            </ol>
            <p className="text-sm leading-7 text-[#26354E]" aria-label={`نص ${selectedPart.label}`}>يُفتح واتساب ومعه نص الجزء {selectedIndex + 1} جاهزاً للإرسال. لا حاجة إلى نسخ أو لصق: اضغط إرسال فقط.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={openWhatsApp} disabled={!canOpenSelected} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-3.5 font-bold text-white hover:bg-[#26354E] disabled:cursor-not-allowed disabled:opacity-50" data-testid="open-whatsapp">
                {selectedPart.status === 'sent' ? 'أعد فتح واتساب لهذا الجزء' : `افتح واتساب وأرسل الجزء ${selectedIndex + 1}`} <ArrowUpRight size={18} />
              </button>
              <button type="button" onClick={acknowledgeCurrent} disabled={!canConfirmSelected} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#0F172A]/20 px-5 py-3.5 font-bold text-[#0F172A] hover:bg-[#F4F1E9] disabled:cursor-not-allowed disabled:opacity-45" data-testid="acknowledge-part">
                <Check size={17} /> {confirming ? 'جارٍ حفظ التأكيد…' : selectedPart.status === 'sent' ? 'تم تأكيد هذا الجزء' : secondsLeft !== null && secondsLeft > 0 ? `أؤكد أنني أرسلت هذا الجزء (بعد ${secondsLeft} ث)` : 'أؤكد أنني أرسلت هذا الجزء'}
              </button>
            </div>
            {popupBlocked && <div className="mt-4 rounded-xl border border-[#8A3F32]/40 bg-[#F9F1EE] p-5 text-sm leading-7 text-[#8A3F32]" role="alert" data-testid="popup-blocked">
              <p className="font-bold">لم يُفتح واتساب: متصفحك يمنع النوافذ المنبثقة لهذا الموقع.</p>
              <p className="mt-2">نص الجزء يسير داخل رابط واتساب نفسه، فلا نسخ ولا لصق: يكفي أن تُتيح النافذة ثم تعيد المحاولة.</p>
              <ol className="mt-2 list-decimal space-y-1 ps-5">
                <li>ابحث عن أيقونة الحظر أو أيقونة الإعدادات في شريط عنوان المتصفح، أو افتح إعدادات هذا الموقع.</li>
                <li>اسمح بالنوافذ المنبثقة (Pop-ups) لموقع BIK.</li>
                <li>اضغط «افتح واتساب» مرة أخرى من هذا الصف.</li>
              </ol>
              <button type="button" onClick={openWhatsApp} disabled={!canOpenSelected} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#8A3F32]/40 px-4 py-2 font-bold text-[#8A3F32] hover:bg-[#F9F1EE] disabled:cursor-not-allowed disabled:opacity-50" data-testid="popup-blocked-retry">
                <ArrowUpRight size={16} /> أعدت الإتاحة؛ افتح واتساب الآن
              </button>
            </div>}
            {offlineBlocked && <div className="mt-4 rounded-xl border border-[#8A3F32]/40 bg-[#F9F1EE] p-5 text-sm leading-7 text-[#8A3F32]" role="alert" data-testid="offline-blocked">
              <p className="font-bold">لا يوجد اتصال بالإنترنت على هذا الجهاز، ولم يُفتح واتساب.</p>
              <p className="mt-2">لم يُحتسب أي جزء ولم يُسجَّل أي إرسال. تفقّد اتصالك (شبكة أو بيانات الهاتف) ثم أعد المحاولة من هذا الصف.</p>
              <button type="button" onClick={openWhatsApp} disabled={!canOpenSelected} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#8A3F32]/40 px-4 py-2 font-bold text-[#8A3F32] hover:bg-[#F9F1EE] disabled:cursor-not-allowed disabled:opacity-50" data-testid="offline-retry">
                <ArrowUpRight size={16} /> عاد الاتصال؛ افتح واتساب الآن
              </button>
            </div>}
            {notice && <p className="mt-4 text-sm leading-7 text-[#526B7B]" role="status">{notice}</p>}
            {error && <p className="mt-4 text-sm leading-7 text-[#8A3F32]" role="alert">{error}</p>}
          </div>
        </section> : storageBlocked ? <div className="mt-8 rounded-2xl border border-[#8A3F32]/40 bg-[#F9F1EE] p-5 text-sm leading-7 text-[#8A3F32]" role="alert" data-testid="storage-blocked">تخزين الجلسة (sessionStorage) معطّل في هذا المتصفح، وتعذّر استعادة تقريرك أو حفظ تقدم الإرسال بسببه. فعّل تخزين الجلسة لهذا الموقع من إعدادات المتصفح ثم أعد تحميل الصفحة لإكمال الإرسال.</div> : storageWriteBlocked ? <div className="mt-8 rounded-2xl border border-[#8A3F32]/40 bg-[#F9F1EE] p-5 text-sm leading-7 text-[#8A3F32]" role="alert" data-testid="storage-write-blocked">تخزين الجلسة في متصفحك يرفض الحفظ (مساحة ممتلئة أو إعداد يمنع الكتابة)، فلا يمكن حفظ تقدم الإرسال على هذا الجهاز. أفرغ مساحة المتصفح لهذا الموقع أو فعّل تخزين الجلسة ثم أعد تحميل الصفحة.</div> : error ? <div className="mt-8 rounded-2xl border border-[#8A3F32]/40 bg-[#F9F1EE] p-5 text-sm leading-7 text-[#8A3F32]" role="alert">{error}</div> : <div className="mt-8 rounded-2xl border border-[#C9A961]/40 bg-[#F6F0DF] p-5" role="status">لا يوجد نص تقرير متاح لهذه الجلسة. ارجع إلى الخطوة السابقة أو أعد إنشاء التحليل.</div>}

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#0F172A]/10 bg-white/60 p-4 text-xs leading-6 text-[#68717A]">
          <LockKeyhole size={16} className="mt-1 shrink-0 text-[#92763D]" />
          <p>BIK لا يرسل شيئاً بدلاً عنك، والإرسال يتم من حسابك في واتساب. لا نحفظ التقرير ولا بياناتك على خادم.</p>
        </div>
      </div>
    </main>
  );
}
