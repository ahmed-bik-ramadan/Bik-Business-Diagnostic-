# AGENTS.md — BIK Business Diagnostic Platform

Read this file fully before every task. It overrides your defaults. If a mission contradicts this file, stop and report; do not choose silently.

## 1. What this is
Arabic RTL web platform (React + TypeScript + Vite + Zustand, Express server pieces, pnpm workspace `@workspace/bik-platform`). It reads a company owner's situation in six axes, shows a preview report, and moves the owner to WhatsApp with the consultant Ahmed Ramadan (BIK Business Solutions, Cairo). Success = a visitor becomes a signed contract. Repo: `ahmed-bik-ramadan/Bik-Business-Diagnostic-`, working branch `v19-release`. The owner of the repo is NOT a programmer: explain results in plain Arabic, short, no jargon.

## 2. Hard rules
1. Never change prices, the scoring engine, or `BIK_OFFERS` numbers unless the mission says so.
2. Never write secrets into the repo. API keys are server secrets only. PayPal links are public URLs held in one config file.
3. Never merge to `main`, never deploy production. Commit to the working branch (or a mission branch) and report.
4. Never build a card form or collect payment data. Payment = outbound link to PayPal only.
5. Do not store visitor data anywhere (no server record, no localStorage recovery copy). The client keeps only the report in his own WhatsApp chat. The only counters allowed are anonymous step counters without any content, cookies or IP storage.
6. Do not rewrite Arabic copy yourself. All Arabic wording comes from the mission text or from files the owner supplies. If a string is missing, insert a clearly marked placeholder `[[TEXT_NEEDED: key]]` and list it in your report.
7. One mission at a time. Read every file you will touch before editing. Touch nothing outside the mission scope. If something unrelated is broken, list it in the report; do not fix it.

## 3. Fixed business facts (source of truth)
- Offers, display order top to bottom: 5000 USD, 499 USD, 272 USD.
  - 272 USD one-time: "أسبوع استشاري مركز". Three calls of 45–180 minutes outside Egypt; in-person sessions at the client premises inside Egypt.
  - 499 USD monthly: consultant proposes solutions, the client executes. Works through the heads of departments; no call cap.
  - 5000 USD monthly: executive advisory. Ahmed acts as executive advisor to the owner/CEO and his team executes with agency resources. Text says "أكثر من 550 ساعة عمل تنفيذي خلال الشهر" and NEVER says whose hours they are. Target: ten times the fee, measured from before/after financial papers; counts cash flow, revenue, cost reduction or productivity depending on the activity. It is a target, not a guarantee.
- Free call inside EACH offer card (not below the cards): 15 minutes; 40 minutes on the 5000 card.
- Deposit: 35% of the offer value, on every offer, part of the fee, not on top (272 -> 95.20 USD; 499 -> 174.65 USD; 5000 -> 1750 USD).
- Refund policy (the only one published): refund if the client's rating of the work is below 85% or the work did not take place; only an administrative fee is deducted. Remove any text about "86%", "free continuation" or "10% of profits".
- Contracting entity: BIK Business Solutions (agency). Contracts in Egypt/Gulf are usually verbal; a written e-signed contract is drafted on request. A client's secrets are never disclosed to another client.
- Experience, one true sentence only: sales since 2003; business development since 2017. Do not write "20+ years".
- Keep as they are: consultant-page figures (350+ projects, 2000+ consultations, 500+ trainees; 96% is written as a goal "هو غايتنا"), and the 23 case cards.
- Numbers: Latin digits and `$`, never Arabic-Indic digits.
- Courtesy title is written `أ/` with hamza.
- Dialect comes automatically from the country given at intake (Egyptian, Saudi, Emirati, general Gulf for other Gulf countries, Modern Standard Arabic for other Arab African countries). One source of truth: `intakeAnswers.country`. No per-page dialect selector.

## 4. Language rules (apply to every string you place)
No fear, no pressure, no fake urgency, no guarantees, no invented statistics. Every figure shown to a visitor must be labelled as an estimate or come from the visitor's own numbers. Approved replacements: "يبقى لديك في محادثة واتساب" (instead of forever); "كلفة الوضع الحالي بحسب أرقامك"; "المشكلة تستمر بكلفتها الشهرية حتى تُعالج". Any removed sentence must be replaced, never just deleted.

## 5. Calculator guards (cost-of-problem)
1. Never add the effect of reactivating dormant customers twice or on top of `dormantCount`.
2. Never add discount savings and the price-below-appropriate effect on the same invoices.
3. Never add cash released from stock/receivables to profit; a lost-units effect counts once.
4. Owner time freed is counted once and capped by weekly hours available.
5. Every estimate carries the label "تقدير استرشادي". Revenue 0 is a valid input: show priorities with the line "لم يُدخل إيراد، فنعرض الأولويات دون تقدير مالي" and no money block.

## 6. How to work and test
- Verification commands run from the repo root: `pnpm --filter @workspace/bik-platform run typecheck` and `pnpm --filter @workspace/bik-platform run test`. The root `pnpm run typecheck` is known broken (root tsconfig.json and tsconfig.base.json are missing; lib/* are unused template leftovers). Do not fix it inside a mission other than Mission 19.
- Check visually at 390px width (phone) and at desktop. RTL must not break.
- Routes must survive direct open (SPA fallback exists in `vercel.json`).
- Library data: `bik-library-base.json` (pathways, patterns referenced by code B0/B_EVAL/V_INV/G_*/T/J/X/P/R). Show a pathway only if `release_group` is 1 unless the mission says otherwise. Never show money values for a pathway without the value type label.
- You may read files from the connected GitHub, Vercel and Google Drive when a mission names them.
- The existing tests are `scripts/verify_*.ts` scripts inside artifacts/bik-platform and several assert UI copy. When a mission changes copy, update the affected verify scripts in the same mission and say which. New tests must follow the same pattern and be added to the `test:additions` script.

## 7. Report format (end of every mission, Arabic, short)
1. ما تغيّر (ملف: سطر واحد).
2. ما اختبرته ونتيجته.
3. نصوص ناقصة `[[TEXT_NEEDED]]`.
4. ما لم أفعله ولماذا.
5. أي شيء غير متوقع.
No long explanations.
