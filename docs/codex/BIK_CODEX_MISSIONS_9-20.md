# BIK — حزمة مهام Codex 9 إلى 20
طريقة التشغيل: تُشغَّل مهمة واحدة في كل مرة بالترتيب. تلصق في Codex سطر البداية ثم نص المهمة. بعد التقرير تعيده لـClaude ليراجعه قبل التالية.
سطر البداية الثابت (يُلصق قبل كل مهمة): "Read AGENTS.md at the repo root and docs/codex/ first. Then execute the mission below exactly. Do not touch anything outside its scope. End with the report format in AGENTS.md section 7."
نص الاستئناف الثابت عند نفاد الرصيد (يُغيَّر الرقم فقط): "Resume Mission N from where you stopped. Re-read AGENTS.md, run git status and git diff to see what is already done, finish only the remaining items of Mission N, then report."

---
## Mission 9 — Install the briefing (no app code)
Goal: put the project briefing where Codex always reads it.
Do: 1) create `AGENTS.md` at the repo root with the exact content the owner provides (file `AGENTS.md`). 2) create `docs/codex/` and copy into it: `BIK_TEXTS_LEGAL_FAQ_PAYMENT.md`, `bik-library-base.json`, `BIK_CODEX_MISSIONS_9-20.md` (this file). 3) Do not edit any source file.
Acceptance: files exist on the working branch; `pnpm typecheck` result unchanged.
Resume: "Resume Mission 9."

## Mission 10 — Truth and safety of texts
Goal: remove every claim that is false, unsupported, or against the rules.
Files to inspect: `LeadGate.tsx`, `OfferCards.tsx`, `appConfig.ts`, `ConsultantPage.jsx`, `Report.tsx`, `ConsultantChat.tsx`, `analysisRecovery.ts`, `Welcome.tsx`, `DATA_PRIVACY.md`, `ARCHITECTURE.md`.
Do:
1. Remove the recovery copy completely: delete `saveAnalysisRecovery` writes to localStorage and every read of it; at app start remove any old `bik-*` keys from localStorage. "ابدأ من جديد" clears all session state. Then verify no visitor content is written to any storage; report what you verified.
2. Replace the privacy sentence in the WhatsApp gate with text section 1 of `BIK_TEXTS_LEGAL_FAQ_PAYMENT.md`.
3. Replace phrases: "إلى الأبد"/"ملكك إلى الأبد" -> "يبقى لديك في محادثة واتساب"; "ثمن البقاء كما أنت" -> "كلفة الوضع الحالي بحسب أرقامك"; "الانتظار لا يجعلها أرخص" -> "المشكلة تستمر بكلفتها الشهرية حتى تُعالج". Search the whole repo for each phrase and for other fear/pressure lines; list extra findings, do not invent replacements (use `[[TEXT_NEEDED]]`).
4. Hide the chat widget on `/report` (keep code).
5. One source for offer texts: the consultant page reads from `BIK_OFFERS`. Delete the "86%", "الاستمرار المجاني" and "10% من الأرباح" lines. Show only: refund if rating below 85% or work not done, administrative fee only.
6. 5000 card: "أكثر من 550 ساعة عمل تنفيذي خلال الشهر" with no owner of the hours. Add under it the 10x line (section 4 of the texts file).
7. Experience: replace "20+" and any similar with: "في المبيعات منذ 2003 وفي تطوير الأعمال منذ 2017".
8. Rewrite `DATA_PRIVACY.md` and `ARCHITECTURE.md` to describe the real system (static front-end, no database, no admin panel, chat disabled). Remove claims about PostgreSQL, Gemini, admin dashboard.
Don't touch: prices, scoring, calculator.
Acceptance: grep finds none of the removed phrases; `/report` shows no chat widget; clearing session leaves no `bik-*` keys.
Resume: "Resume Mission 10."

## Mission 11 — Calculator fixes and guards
Files: `valueModule/compute.ts` and its tests.
Do: 1) cap the "price below appropriate" percentage at 100; 2) revenue 0 is valid: no money block, show the line in AGENTS.md section 5; 3) margin 0 allowed; 4) enforce the five guards in AGENTS.md section 5 in code with tests for each (double-count cases must not add); 5) remove the 25/50/75 default scenarios acting as recovery rates: scenarios come only from visitor inputs; 6) label every figure "تقدير استرشادي"; 7) recommendation logic converts non-USD losses with the existing rate instead of dropping them (`lossSustainsExecutive`); 8) warn softly when inputs contradict (monthly sales x unit price far above stated revenue): "الأرقام المدخلة لا تتسق؛ راجعها".
Acceptance: tests added for each rule pass; existing tests pass or are updated with a note.
Resume: "Resume Mission 11."

## Mission 12 — Processing page, digits, country codes, dialect source
Files: `Processing.tsx`, `appConfig.ts`, `currency.ts`, `evidenceSwot.ts`, `dualLayerReport.ts`, `ReportPreview.tsx`, `OfferCards.tsx`, `LeadGate.tsx`, `Questionnaire.tsx`, `ReviewPage`, `Report.tsx`.
Do:
1. Processing: three explicit states (`loading|error|done`); the error card renders only in `error`; minimum display 6 seconds showing true ordered stages (reading answers, computing six axes, linking symptoms to priorities, preparing preview) with a smooth progress bar ending at 100%. Stage text must be descriptive only (no promises, no pressure). Texts: `[[TEXT_NEEDED: processing_stages]]` unless the owner supplied them.
2. Latin digits and `$` everywhere (`toArabicIndic` removed; `en-US` formatting). Price format `$272`, decided once in config.
3. Add country codes Oman +968, Iraq +964, Libya +218, Palestine +970, Sudan +249, Lebanon +961, Algeria +213 and make phone normalization accept them.
4. Dialect: remove the per-page country selector; derive dialect from `intakeAnswers.country` everywhere through `dialectForCountry`; unknown/empty -> Modern Standard Arabic. Support keys: egypt, saudi, emirati, gulf_generic, msa. Missing strings fall back to msa.
Acceptance: five runs on phone width without error flash; grep for Arabic-Indic digits in UI output is empty; Omani number passes; changing the country in the intake changes the question wording.
Resume: "Resume Mission 12."

## Mission 13 — Unified offer cards with the free call inside
Files: `OfferCards.tsx`, `ConsultantPage.jsx`, `appConfig.ts`.
Do: one shared card component used on the report and the consultant page. Compact card: name, price, one line, the free call line inside the card (15 min; 40 min on the 5000 card), button "لماذا تناسبك هذه الخدمة" opening the full card in a dialog with an X; closing restores the compact card. Order 5000, 499, 272. The 5000 card is dark: its button is light green with contrast at least 4.5:1; the other buttons are dark blue on light. No "recommended" badge unless a visible reason from the visitor's own answers is shown. Remove the separate 15-minute call block below the cards.
Acceptance: every button works; contrast measured; the dialog is keyboard-closable.
Resume: "Resume Mission 13."

## Mission 14 — Payment journey (PayPal links)
Files: new `paymentConfig.ts`, new pages `OfferSummary`, `PaymentSent`, `App.tsx` routes, `OfferCards.tsx`.
Do:
1. `paymentConfig.ts`: `{ "272": { url: "", depositUsd: 95.20 }, "499": { url: "", depositUsd: 174.65 }, "5000": null }`. URLs are empty until the owner pastes them; empty URL => the pay button is hidden and only "راسل أحمد أولاً" shows.
2. After a visitor picks an offer: summary screen using section 5 of the texts file. Button "ادفع المقدم" opens the PayPal URL in a new tab; button "راسل أحمد أولاً" opens WhatsApp with a prefilled message. For 5000: no pay button; show the call-then-invoice line.
3. Route `/payment-sent` with the thanks text and a WhatsApp button prefilled "أرسلت مقدم عرض [اسم العرض] وأرفق الإيصال".
4. Anonymous counters for: summary opened, pay button clicked (offer id only).
5. Never claim payment is confirmed: the platform cannot know.
Don't: add any form, key, SDK or server code.
Acceptance: with a test URL the button opens it; with an empty URL it is hidden; no payment data touched.
Resume: "Resume Mission 14."

## Mission 15 — Legal pages and FAQ
Do: routes `/privacy` and `/terms` with the texts (sections 2 and 3); links in the footer of every page, in the WhatsApp gate (links already in the line) and in the consultant page footer. FAQ blocks at the bottom of Welcome, Report (offers), Consultant page from section 6 (accordion, accessible, RTL). Dialect: msa for now.
Acceptance: pages open directly (SPA fallback); FAQ keyboard accessible.
Resume: "Resume Mission 15."

## Mission 16 — Branching questionnaire (proposal first, no code change)
Goal: shorten the journey by questions that branch on answers.
Do: read the full question bank and scoring. Output a proposal file `docs/codex/BRANCHING_PROPOSAL.md`: for each of the six axes, which existing question works as a single screening question (highest weight), the rule that opens the deeper questions only for axes scoring weak or unclear, which questions are skipped for strong axes, and the effect on the report (which fields would be missing). Do not edit app code. The owner approves before implementation (Mission 16B).
Resume: "Resume Mission 16."

## Mission 17 — Pathways engine and pages
Files: new `pathways/` module, `Report.tsx`, `ConsultantPage.jsx`, data file `bik-library-base.json`.
Do:
1. Load the library once. Resolve pattern codes (B0, B_EVAL, V_INV, G_*, T, J, X, P, R) from the `patterns` object at build time.
2. Report: for the two weakest axes show up to 2 pathways each, `release_group` 1 only, matched by the axis and by the visitor's answers; show F14 headline, meaning, action. Money only with a value-type label and "تقدير استرشادي". Never show a pathway that has `scope_flag`.
3. Consultant page: replace the duplicated generic services list with pain->service cards from group 1: owner phrase (dialect), "ما يدل عليه عادةً", "ما نفعله", the service name; button opens WhatsApp with a prefilled message naming the pathway.
4. Dialect: use `dialects[...]` with fallback to msa; wording-chat outputs arrive later in Mission 18.
Acceptance: unit tests for matching; no pathway with `scope_flag` is ever rendered; JSON loads without runtime errors.
Resume: "Resume Mission 17."

## Mission 18 — Merge dialect and method fields
Input from the owner (arrives after the wording chat): many files named `dialects-AXn-NN.json`, each a JSON array of pathway objects.
Do: read all of them, merge into the library by `id`: fill `dialects.saudi`, `dialects.emirati`, improve `egypt`, `gulf_generic`, `msa_neutral`, fill `method_fields.why_chain` (5 items), `kaizen_control`, `decision_required`, and per-dialect platform copy. Validate: all 105 ids present, no empty field, no digits in Arabic-Indic form, no forbidden words (ضمان, مضمون, يضمن except negations; fear/pressure phrases). Report violations without fixing wording.
Resume: "Resume Mission 18."

## Mission 19 — Counters, identity, hosting preparation, cleanup
Do:
1. Anonymous step counters (cookieless, no content). Choose a tool; before choosing, read its current terms for commercial use and report them.
2. `index.html`: Arabic title "BIK | قراءة أولية لحال شركتك", Arabic description without "SWOT", `og:image` 1200x630 with the BIK logo, `og:locale=ar_AR`, `robots.txt` with noindex until the owner decides.
3. Hosting: read the current commercial-use terms of Vercel Hobby, Cloudflare Pages and Netlify free plans and report; do not migrate.
4. `release.json` with version and date.
5. Dead code: after Missions 10-17 tests pass, remove `server/platform-db.ts`, `server/db.ts`, supabase stub, `AdminDashboard.tsx`, the Gemini path in `reportGenerator.ts`, `server/storage.ts`, `@replit/connectors-sdk`, one group per commit, running typecheck and tests after each.
6. A "qualified conversation" tag note in `docs/codex/TRACKING.md` for the owner's manual WhatsApp log.
Resume: "Resume Mission 19."

## Mission 20 — Browser tests
Do: Playwright tests at width 390: full journey for two sectors; processing page never shows an error card; gate with an Omani number; report and offer cards (dialog opens/closes); payment summary with and without a URL; `/privacy`, `/terms` and `/payment-sent` open directly; FAQ toggles; no `bik-*` key remains in localStorage after the journey. Add to the existing test pipeline without removing tests. Provide a one-command run and a plain Arabic instruction for the owner.
Resume: "Resume Mission 20."
