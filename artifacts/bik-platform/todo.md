# BIK Execution Tracker

## Completed

- [x] Prevent session ownership replacement on reused session IDs.
- [x] Require the correct ownership token for session resume and answer updates.
- [x] Retain `questionHistory` in the browser session for report generation. The legacy server-side answer saves are retired.
- [x] Unify financial disclosure mapping around `u31` revenue and `u06` net margin.
- [x] Remove TypeScript `noCheck` suppression and fix application type errors.
- [x] Verify the static build in `dist/index.html` and `dist/assets`. The Express bundle is for local development.
- [x] Run acceptance, ledger-preservation, launch-contract, ownership, and report-generation smoke tests.

## Remaining

- [x] Retire server-side `report_payload` persistence. Reports are generated in the browser and the platform keeps no server copy.
- [x] Publish the verified checkpoint through WebDev and confirm the deployed URL after the deployment service accepted the corrected artifact; permanent domain serves matching production asset references.
- [x] Replace the legacy `storageMode: postgresql` label in the MySQL/TiDB adapter with a neutral `managed_database` label to avoid operational ambiguity.

## 2026-10-05 Safe verification addendum

- [x] Added session-grounded consultant context and deterministic fallback responses.
- [x] Added privacy-minimized funnel events with managed-database persistence and admin aggregates in the legacy server. That path is inactive in the static platform.
- [x] Instrumented question, answer, completion, report, copy, WhatsApp-part, lead-save, and abandonment milestones.
- [x] Added focused implementation regression suite; reference and additions suites pass.
- [x] Verified deterministic value model, active knowledge boundaries, durable/temporary save behavior, and lossless WhatsApp segmentation with synthetic data.
- [x] Verified desktop/mobile preview screenshots and synthetic funnel endpoint acceptance/rejection.
- [x] Corrected public release fingerprint and saved checkpoint `aa4f969c`.
- [x] Independently re-read the permanent domain: HTTP is healthy, but it advertises older release `ef7e4ab2`, not the current UI checkpoint; latest results-page interaction remains verified on preview only.

## 2026-10-06 Results-page redesign

- [x] Reorganized only `ReportPreview.tsx` into concise sections with `عرض المزيد` controls.
- [x] Added a closable modal containing the selected detail, WhatsApp handoff controls, and separate existing offer cards.
- [x] Preserved full-report copy, multipart WhatsApp flow, delivery disclaimer, and existing prices.
- [x] TypeScript, production build, static preview contract, persistence checks, and browser interaction passed.
- [x] Live-domain HTTP check completed read-only: `/release.json` and `/api/v1/health` returned 200, but the domain is on release `ef7e4ab2`; checkpoint `cfdaa765` is not independently confirmed live.
